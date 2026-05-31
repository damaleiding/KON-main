#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCENE = "blue_space_bridge_0421";
const DEFAULT_LEDGER = `bluespace/outputs/${DEFAULT_SCENE}/_ledger/production-ledger.jsonl`;
const DEFAULT_OUTPUT = `bluespace/outputs/${DEFAULT_SCENE}/_review/index.html`;
const GENERATOR_VERSION = 3;
const DATA_SCHEMA_VERSION = 1;
const MANIFEST_SCHEMA_VERSION = 1;
const DATA_FILE_NAME = "review-data.js";
const MANIFEST_FILE_NAME = "manifest.json";
const LAUNCHER_FILES = ["open_in_chrome.cmd", "open_in_chrome.command"];

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`Argument error: ${error.message}`);
  console.error("Run --help for usage.");
  process.exit(2);
}

if (opts.help) {
  printHelp();
  process.exit(0);
}

const projectRoot = resolve(opts.projectRoot || findProjectRoot(process.cwd()));

try {
  const ledgerPath = resolveMaybeProjectRelative(opts.ledger || DEFAULT_LEDGER);
  const outputPath = resolveMaybeProjectRelative(opts.output || DEFAULT_OUTPUT);
  const ledgerText = await readFile(ledgerPath, "utf8");
  const entries = parseLedger(ledgerText, ledgerPath);
  const decisionLogPath = resolveMaybeProjectRelative(opts.decisionLog || defaultDecisionLogPath(ledgerPath));
  const decisionLogText = existsSync(decisionLogPath) ? await readFile(decisionLogPath, "utf8") : "";
  const savedDecisions = parseDecisionLog(decisionLogText, decisionLogPath);
  const decisionIndex = buildDecisionIndex(savedDecisions);
  const assets = entries.map((entry) => mergeSavedDecision(normalizeEntry(entry), decisionIndex));
  const outputDir = dirname(outputPath);
  const dataPath = join(outputDir, DATA_FILE_NAME);
  const manifestPath = join(outputDir, MANIFEST_FILE_NAME);
  const syncToken = await readOrCreateSyncToken(join(outputDir, ".sync-token.json"));
  const syncStatus = await readJsonIfExists(join(outputDir, "sync-status.json"));
  const stableData = buildStableData(assets, ledgerPath, ledgerText, decisionLogPath, decisionLogText, savedDecisions);
  const sourceHash = hashJson(stableData);
  const data = {
    ...stableData,
    syncToken,
    syncStatus,
    sourceHash,
    generatedAt: new Date().toISOString(),
  };
  const html = buildHtml();
  const manifest = buildManifest({
    outputPath,
    dataPath,
    ledgerPath,
    ledgerText,
    html,
    data,
  });
  const currentManifest = await readJsonIfExists(manifestPath);
  const fresh = !opts.force && isCacheFresh(currentManifest, manifest, outputPath, dataPath);

  if (opts.dataOnly && !existsSync(outputPath)) {
    throw new Error(`Review Board page is missing: ${toProjectRel(outputPath)}. Run review-board once before data-only refresh.`);
  }

  if (fresh) {
    console.log(`Review Board is current: ${toProjectRel(outputPath)}`);
  } else {
    await writeReviewBundle({ outputPath, dataPath, manifestPath, html, data, manifest, dataOnly: opts.dataOnly });
    if (!opts.dataOnly) console.log(`Wrote ${toProjectRel(outputPath)}`);
    console.log(`Wrote ${toProjectRel(dataPath)}`);
  }

  console.log(
    `Assets: ${assets.length}; shots: ${manifest.counts.shots}; prompt coverage: ${formatCounts(manifest.counts.promptCoverage)}`,
  );
  console.log(pathToFileURL(outputPath).href);
} catch (error) {
  console.error(`review-board: ${error.message}`);
  process.exit(1);
}

function parseLedger(text, ledgerPath) {
  const entries = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      entries.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`Invalid ledger JSON in ${toProjectRel(ledgerPath)} on line ${index + 1}: ${error.message}`);
    }
  });
  return entries;
}

function parseDecisionLog(text, decisionLogPath) {
  const decisions = [];
  if (!text.trim()) return decisions;
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid decision JSON in ${toProjectRel(decisionLogPath)} on line ${index + 1}: ${error.message}`);
    }
    const mark = String(entry.mark || "").trim().toLowerCase();
    if (!["liked", "disliked", "cleared"].includes(mark)) return;
    const entryId = entry.entry_id || "";
    const outputPath = normalizeSlashes(entry.output_path || "");
    if (!entryId && !outputPath) return;
    decisions.push({
      decisionId: entry.decision_id || "",
      sessionId: entry.session_id || "",
      decidedAt: entry.decided_at || "",
      entryId,
      outputPath,
      shotId: entry.shot_id || null,
      title: entry.title || outputPath || entryId,
      mark,
      ledgerVerdict: entry.ledger_verdict || "",
      reason: entry.reason || "",
      promptState: entry.prompt_state || null,
      source: entry.source || null,
      line: index + 1,
    });
  });
  return decisions;
}

function buildDecisionIndex(decisions) {
  const byEntry = new Map();
  const byOutput = new Map();
  for (const decision of decisions) {
    if (decision.entryId) byEntry.set(decision.entryId, decision);
    if (decision.outputPath) byOutput.set(decision.outputPath, decision);
  }
  return { byEntry, byOutput };
}

function mergeSavedDecision(asset, decisionIndex) {
  const decision = decisionIndex.byEntry.get(asset.entryId) || decisionIndex.byOutput.get(asset.outputPath) || null;
  if (!decision) {
    return {
      ...asset,
      savedMark: "",
      savedDecision: null,
    };
  }
  return {
    ...asset,
    savedMark: decision.mark === "cleared" ? "" : decision.mark,
    savedDecision: {
      mark: decision.mark,
      decisionId: decision.decisionId,
      sessionId: decision.sessionId,
      decidedAt: decision.decidedAt,
      ledgerVerdict: decision.ledgerVerdict,
      reason: decision.reason,
      source: decision.source,
      line: decision.line,
    },
  };
}

function buildStableData(assets, ledgerPath, ledgerText, decisionLogPath, decisionLogText, savedDecisions) {
  const ledgerRel = toProjectRel(ledgerPath);
  const decisionLogRel = toProjectRel(decisionLogPath);
  const ledgerHash = hashText(ledgerText);
  const decisionLogHash = hashText(decisionLogText || "");
  return {
    kind: "review_board_data",
    schemaVersion: DATA_SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    projectRoot: normalizeSlashes(projectRoot),
    ledger: ledgerRel,
    ledgerHash,
    decisionLog: decisionLogRel,
    decisionLogHash,
    board: {
      title: "Bluespace Review Board",
      ledger: ledgerRel,
      ledgerHash,
      decisionLog: decisionLogRel,
      decisionLogHash,
      savedDecisionCount: savedDecisions.length,
      projectRoot: normalizeSlashes(projectRoot),
    },
    assets,
    byShot: buildShotIndex(assets),
    counts: buildCounts(assets),
  };
}

function buildShotIndex(assets) {
  const byShot = {};
  for (const item of assets) {
    const shot = item.shotId || "(unmapped)";
    if (!byShot[shot]) {
      byShot[shot] = {
        shotId: shot,
        assetCount: 0,
        entryIds: [],
      };
    }
    byShot[shot].assetCount += 1;
    byShot[shot].entryIds.push(item.entryId || item.outputPath);
  }
  return byShot;
}

function buildCounts(assets) {
  return {
    assets: assets.length,
    shots: Object.keys(buildShotIndex(assets)).length,
    byReview: countBy(assets, (item) => item.review || "unknown"),
    byKind: countBy(assets, (item) => item.kind || "unknown"),
    byRole: countBy(assets, (item) => item.role || "unknown"),
    byModel: countBy(assets, (item) => item.model || "unknown"),
    promptCoverage: countBy(assets, (item) => item.promptState || "missing"),
    savedMarks: countBy(assets, (item) => item.savedMark || "unmarked"),
  };
}

function buildManifest({ outputPath, dataPath, ledgerPath, ledgerText, html, data }) {
  const dataJson = stableJson(data);
  const shotFiles = Object.keys(data.byShot).map((shotId) => `data/shots/${safeFileName(shotId)}.json`);
  return {
    kind: "review_board_manifest",
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generator: "project-harness/review-board",
    generatorVersion: GENERATOR_VERSION,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    generatedAt: data.generatedAt,
    projectRoot: normalizeSlashes(projectRoot),
    ledger: toProjectRel(ledgerPath),
    ledgerHash: hashText(ledgerText),
    decisionLog: data.decisionLog,
    decisionLogHash: data.decisionLogHash,
    sourceHash: data.sourceHash,
    dataHash: hashText(dataJson),
    htmlHash: hashText(html),
    output: toProjectRel(outputPath),
    dataFile: normalizeSlashes(relative(dirname(outputPath), dataPath)),
    jsonDataFile: "data/all.json",
    shotFiles,
    launcherFiles: LAUNCHER_FILES,
    counts: data.counts,
  };
}

function defaultDecisionLogPath(ledgerPath) {
  return join(dirname(ledgerPath), "review-decisions.jsonl");
}

async function readJsonIfExists(pathText) {
  if (!existsSync(pathText)) return null;
  try {
    return JSON.parse(await readFile(pathText, "utf8"));
  } catch {
    return null;
  }
}

async function readOrCreateSyncToken(pathText) {
  await mkdir(dirname(pathText), { recursive: true });
  const existing = await readJsonIfExists(pathText);
  if (existing?.token) return existing.token;
  const token = randomBytes(24).toString("hex");
  await writeFile(
    pathText,
    `${stableJson({
      token,
      createdAt: new Date().toISOString(),
      purpose: "Review Board one-shot local sync protocol",
    })}\n`,
    "utf8",
  );
  return token;
}

function isCacheFresh(current, next, outputPath, dataPath) {
  if (!current) return false;
  if (current.schemaVersion !== next.schemaVersion) return false;
  if (!existsSync(outputPath) || !existsSync(dataPath)) return false;
  if (current.generatorVersion !== next.generatorVersion) return false;
  if (current.dataSchemaVersion !== next.dataSchemaVersion) return false;
  if (current.ledgerHash !== next.ledgerHash) return false;
  if (current.decisionLog !== next.decisionLog) return false;
  if (current.decisionLogHash !== next.decisionLogHash) return false;
  if (current.sourceHash !== next.sourceHash) return false;
  if (current.htmlHash !== next.htmlHash) return false;
  if (current.projectRoot !== next.projectRoot) return false;
  if (!Array.isArray(current.shotFiles)) return false;
  const outputDir = dirname(outputPath);
  const requiredFiles = ["data/all.json", ...next.shotFiles, ...LAUNCHER_FILES].map((item) => join(outputDir, item));
  return requiredFiles.every((item) => existsSync(item));
}

async function writeReviewBundle({ outputPath, dataPath, manifestPath, html, data, manifest, dataOnly }) {
  const outputDir = dirname(outputPath);
  const allJsonPath = join(outputDir, "data", "all.json");
  const shotsDir = join(outputDir, "data", "shots");

  await mkdir(outputDir, { recursive: true });
  await mkdir(shotsDir, { recursive: true });
  if (!dataOnly) await writeFile(outputPath, html, "utf8");
  await writeFile(dataPath, buildDataJs(data), "utf8");
  await writeFile(allJsonPath, `${stableJson(data)}\n`, "utf8");
  if (!dataOnly) await writeReviewLaunchers(outputDir);

  const assetsByShot = new Map();
  for (const item of data.assets) {
    const shot = item.shotId || "(unmapped)";
    if (!assetsByShot.has(shot)) assetsByShot.set(shot, []);
    assetsByShot.get(shot).push(item);
  }

  for (const [shotId, shotAssets] of assetsByShot.entries()) {
    const shotData = {
      kind: "review_board_shot_data",
      schemaVersion: DATA_SCHEMA_VERSION,
      generatorVersion: data.generatorVersion,
      projectRoot: data.projectRoot,
      ledger: data.ledger,
      ledgerHash: data.ledgerHash,
      decisionLog: data.decisionLog,
      decisionLogHash: data.decisionLogHash,
      sourceHash: data.sourceHash,
      generatedAt: data.generatedAt,
      shotId,
      board: data.board,
      counts: buildCounts(shotAssets),
      assets: shotAssets,
    };
    await writeFile(join(shotsDir, `${safeFileName(shotId)}.json`), `${stableJson(shotData)}\n`, "utf8");
  }

  await writeFile(manifestPath, `${stableJson(manifest)}\n`, "utf8");
}

async function writeReviewLaunchers(outputDir) {
  const cmd = [
    "@echo off",
    "setlocal",
    "set \"PAGE=%~dp0index.html\"",
    "set \"PAGE_URL=file:///%PAGE:\\=/%?cache_bust=%RANDOM%\"",
    "set \"CHROME=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe\"",
    "if exist \"%CHROME%\" start \"\" \"%CHROME%\" \"%PAGE_URL%\" & exit /b 0",
    "set \"CHROME=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe\"",
    "if exist \"%CHROME%\" start \"\" \"%CHROME%\" \"%PAGE_URL%\" & exit /b 0",
    "set \"CHROME=%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe\"",
    "if exist \"%CHROME%\" start \"\" \"%CHROME%\" \"%PAGE_URL%\" & exit /b 0",
    "where chrome.exe >nul 2>nul",
    "if not errorlevel 1 start \"\" chrome.exe \"%PAGE_URL%\" & exit /b 0",
    "echo Google Chrome was not found. Open index.html manually or run review-board-open.ps1 --browser default.",
    "pause",
    "exit /b 1",
    "",
  ].join("\r\n");
  const command = [
    "#!/usr/bin/env bash",
    "set -e",
    "DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)",
    "open -a \"Google Chrome\" \"$DIR/index.html\" || open \"$DIR/index.html\"",
    "",
  ].join("\n");
  await writeFile(join(outputDir, "open_in_chrome.cmd"), cmd, "utf8");
  const commandPath = join(outputDir, "open_in_chrome.command");
  await writeFile(commandPath, command, "utf8");
  try {
    await chmod(commandPath, 0o755);
  } catch {
    // chmod is best effort for cross-platform generated launchers.
  }
}

function buildDataJs(data) {
  return `window.REVIEW_BOARD_DATA = ${safeScriptJson(data)};\n`;
}

function normalizeEntry(entry) {
  const outputPath = entry.asset?.output_path || "";
  const absPath = outputPath ? resolveMaybeProjectRelative(outputPath) : null;
  const exists = absPath ? existsSync(absPath) : false;
  const fileModifiedAt = exists ? readFileModifiedAt(absPath) : "";
  const kind = entry.asset?.kind || inferKind(outputPath);
  const generation = entry.generation || {};
  const prompt = generation.prompt || "";
  const promptFile = normalizeSlashes(generation.prompt_file || "");
  const promptSummary = generation.prompt_summary || "";
  const references = Array.isArray(generation.references)
    ? generation.references.map((ref) => ({
        role: ref.role || "unspecified",
        path: normalizeSlashes(ref.path || ""),
        note: ref.note || "",
      }))
    : [];
  const settings = generation.settings || {};
  const hasReusableRecipe =
    prompt ||
    promptFile ||
    generation.command ||
    references.length > 0 ||
    Object.keys(settings).length > 0;
  const promptState = hasReusableRecipe ? "full" : promptSummary ? "summary_only" : "missing";
  return {
    entryId: entry.entry_id || "",
    sceneSlug: entry.scene_slug || "",
    shotId: entry.shot_id || "(unmapped)",
    legacyId: entry.legacy_id || "",
    title: entry.title || basename(outputPath),
    status: entry.lifecycle_status || "unknown",
    review: entry.review?.verdict || "unknown",
    model: entry.asset?.model || "unknown",
    kind,
    role: entry.asset?.spec?.role || entry.generation?.mode || kind,
    outputPath: normalizeSlashes(outputPath),
    absPath: absPath ? normalizeSlashes(absPath) : "",
    href: absPath ? pathToFileURL(absPath).href : "",
    exists,
    fileModifiedAt,
    tool: generation.tool || "unknown",
    mode: generation.mode || kind,
    taskId: generation.task_id || "",
    command: generation.command || "",
    prompt,
    promptFile,
    negativePrompt: generation.negative_prompt || "",
    promptSummary,
    promptState,
    seed: generation.seed ?? "",
    settings,
    references,
    note: firstNote(entry),
    sourceHeading: entry.provenance?.source_heading || "",
    sourceLine: entry.provenance?.source_line || null,
    productionDate: entry.provenance?.production_date || "",
    ingestedAt: entry.provenance?.ingested_at || "",
    spec: entry.asset?.spec || {},
  };
}

function readFileModifiedAt(pathText) {
  try {
    return statSync(pathText).mtime.toISOString();
  } catch {
    return "";
  }
}

function buildHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bluespace Review Board</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #090d12;
      --panel: #121820;
      --panel-strong: #171f29;
      --ink: #eef3f8;
      --muted: #93a1b1;
      --line: #283442;
      --field: #0d131b;
      --accent: #4fd1c5;
      --accent-weak: rgba(79, 209, 197, 0.14);
      --like: #f6c967;
      --like-weak: rgba(246, 201, 103, 0.14);
      --dislike: #9aa8b7;
      --dislike-weak: rgba(154, 168, 183, 0.12);
      --warn: #f3b562;
      --bad: #ff8f8f;
      --shadow: 0 16px 34px rgba(0, 0, 0, 0.28);
      --mono: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
      --sans: "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: var(--sans);
      font-size: 14px;
      line-height: 1.45;
    }
    button, input, select { font: inherit; }
    button {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--panel);
      color: var(--ink);
      min-height: 34px;
      padding: 6px 10px;
      cursor: pointer;
    }
    button:hover { border-color: var(--accent); color: var(--accent); background: var(--panel-strong); }
    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #06100f;
      font-weight: 800;
      box-shadow: 0 0 0 2px rgba(79, 209, 197, 0.18);
    }
    input, select {
      width: 100%;
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--field);
      color: var(--ink);
      padding: 7px 9px;
    }
    label {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    code { font-family: var(--mono); }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: grid;
      grid-template-columns: minmax(240px, 1fr) auto;
      gap: 14px;
      align-items: center;
      padding: 16px 20px 14px;
      border-bottom: 1px solid var(--line);
      background: rgba(9, 13, 18, 0.94);
      backdrop-filter: blur(8px);
    }
    h1 {
      margin: 0;
      font-size: 22px;
      line-height: 1.1;
      letter-spacing: 0;
    }
    .subtitle { margin-top: 4px; color: var(--muted); font-size: 13px; }
    .top-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .wrap {
      max-width: 1520px;
      margin: 0 auto;
      padding: 16px 20px 28px;
      display: grid;
      gap: 14px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 10px;
    }
    .stat {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: 10px 12px;
    }
    .stat strong { display: block; font-size: 22px; line-height: 1; }
    .stat span { display: block; margin-top: 5px; color: var(--muted); font-size: 12px; }
    .filters {
      display: grid;
      grid-template-columns: minmax(220px, 1.4fr) repeat(8, minmax(112px, 0.8fr)) auto;
      gap: 10px;
      align-items: end;
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: 12px;
    }
    .board-layout {
      display: grid;
      grid-template-columns: 156px minmax(0, 1fr);
      gap: 14px;
      align-items: start;
    }
    .board-content {
      display: grid;
      gap: 14px;
      min-width: 0;
    }
    .shot-rail {
      position: sticky;
      top: 92px;
      display: grid;
      gap: 8px;
      max-height: calc(100vh - 112px);
      overflow: auto;
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: 8px;
    }
    .shot-rail-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }
    .shot-rail-head span:last-child {
      font-family: var(--mono);
      font-weight: 600;
    }
    .shot-list {
      display: grid;
      gap: 6px;
    }
    .shot-button {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      min-height: 32px;
      padding: 5px 7px;
      border-color: transparent;
      background: rgba(255, 255, 255, 0.035);
      color: var(--ink);
      text-align: left;
    }
    .shot-button:hover {
      border-color: var(--accent);
    }
    .shot-button.active {
      border-color: var(--accent);
      background: var(--accent-weak);
      color: var(--accent);
    }
    .shot-button.empty-shot {
      opacity: 0.45;
    }
    .shot-id {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--mono);
      font-weight: 800;
      font-size: 12px;
    }
    .shot-count {
      flex: 0 0 auto;
      min-width: 24px;
      border-radius: 999px;
      padding: 1px 6px;
      background: rgba(255, 255, 255, 0.07);
      color: var(--muted);
      font-family: var(--mono);
      font-size: 11px;
      text-align: center;
    }
    .shot-button.active .shot-count {
      background: rgba(79, 209, 197, 0.18);
      color: var(--accent);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-height: 30px;
      align-items: center;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.04);
      color: var(--muted);
      font-size: 12px;
      font-family: var(--mono);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 12px;
    }
    .card {
      display: grid;
      grid-template-rows: auto minmax(190px, auto) auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .card.hidden { display: none; }
    .card.liked {
      border-color: rgba(246, 201, 103, 0.55);
      box-shadow: 0 18px 38px rgba(246, 201, 103, 0.08), var(--shadow);
    }
    .card.disliked {
      border-style: dashed;
      opacity: 0.72;
    }
    .card.folded {
      grid-template-rows: auto auto;
    }
    .card.folded .media,
    .card.folded .foldable {
      display: none;
    }
    .card-head {
      display: grid;
      gap: 7px;
      padding: 12px 12px 10px;
      border-bottom: 1px solid var(--line);
    }
    .title-row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      justify-content: space-between;
    }
    .title {
      font-weight: 800;
      font-size: 15px;
      min-width: 0;
    }
    .title-row > span {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 6px;
    }
    .badge {
      flex: 0 0 auto;
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 12px;
      font-family: var(--mono);
      background: var(--accent-weak);
      color: var(--accent);
    }
    .badge.needs_review { background: rgba(243, 181, 98, 0.16); color: var(--warn); }
    .badge.rejected, .badge.missing { background: rgba(255, 143, 143, 0.16); color: var(--bad); }
    .badge.selected { background: var(--accent-weak); color: var(--accent); }
    .badge.prompt-full { background: rgba(79, 209, 197, 0.14); color: var(--accent); }
    .badge.prompt-summary_only { background: rgba(243, 181, 98, 0.16); color: var(--warn); }
    .badge.prompt-missing { background: rgba(255, 143, 143, 0.16); color: var(--bad); }
    .user-mark {
      background: var(--dislike-weak);
      color: var(--muted);
    }
    .user-mark.liked {
      background: var(--like-weak);
      color: var(--like);
    }
    .user-mark.disliked {
      background: var(--dislike-weak);
      color: var(--dislike);
    }
    .user-mark.saved {
      border: 1px solid rgba(79, 209, 197, 0.28);
    }
    .user-mark.local {
      border: 1px solid rgba(246, 201, 103, 0.34);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
      font-family: var(--mono);
    }
    .media {
      display: grid;
      place-items: center;
      background: #10151c;
      min-height: 210px;
    }
    video, img {
      width: 100%;
      max-height: 310px;
      object-fit: contain;
      display: block;
      background: #10151c;
    }
    .missing-media {
      color: #f7c4c4;
      padding: 22px;
      text-align: center;
      font-family: var(--mono);
    }
    .card-body {
      display: grid;
      gap: 10px;
      padding: 12px;
    }
    .note {
      min-height: 42px;
      color: var(--ink);
    }
    .fold-note {
      display: none;
      color: var(--muted);
      font-size: 12px;
    }
    .card.folded .fold-note {
      display: block;
    }
    .path {
      color: var(--muted);
      font-family: var(--mono);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .saved-decision {
      border-left: 3px solid var(--accent);
      color: var(--muted);
      font-size: 12px;
      padding-left: 8px;
    }
    .recipe {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.03);
      color: var(--muted);
      padding: 8px 10px;
    }
    .recipe summary {
      cursor: pointer;
      color: var(--ink);
      font-weight: 700;
    }
    .recipe-grid {
      display: grid;
      gap: 7px;
      margin-top: 9px;
      font-size: 12px;
    }
    .recipe-label {
      color: var(--muted);
      font-weight: 700;
    }
    .recipe-value {
      color: var(--ink);
      font-family: var(--mono);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .actions a {
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 6px 10px;
      color: var(--ink);
      text-decoration: none;
      background: var(--panel-strong);
    }
    .actions a:hover { border-color: var(--accent); color: var(--accent); }
    button.active-like {
      border-color: rgba(246, 201, 103, 0.7);
      color: var(--like);
      background: var(--like-weak);
    }
    button.active-dislike {
      border-color: rgba(154, 168, 183, 0.6);
      color: var(--dislike);
      background: var(--dislike-weak);
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.46;
    }
    .empty {
      border: 1px dashed var(--line);
      border-radius: 8px;
      padding: 30px;
      text-align: center;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.04);
    }
    .copy-fallback {
      position: fixed;
      inset: auto 18px 18px auto;
      z-index: 30;
      width: min(560px, calc(100vw - 36px));
      display: grid;
      gap: 8px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: var(--shadow);
      padding: 12px;
    }
    .copy-fallback label {
      color: var(--ink);
      font-size: 13px;
    }
    .copy-fallback textarea {
      width: 100%;
      min-height: 110px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--field);
      color: var(--ink);
      padding: 8px;
      font-family: var(--mono);
      font-size: 12px;
    }
    .copy-fallback-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    @media (max-width: 920px) {
      .topbar { grid-template-columns: 1fr; }
      .top-actions { justify-content: flex-start; }
      .stats { grid-template-columns: repeat(2, 1fr); }
      .filters { grid-template-columns: 1fr 1fr; }
      .filters label:first-child { grid-column: 1 / -1; }
      .board-layout { grid-template-columns: 1fr; }
      .shot-rail {
        position: static;
        max-height: none;
      }
      .shot-list {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding-bottom: 2px;
      }
      .shot-button {
        flex: 0 0 auto;
        width: auto;
        min-width: 86px;
      }
    }
    @media (max-width: 560px) {
      .wrap { padding: 12px; }
      .stats, .filters, .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div>
      <h1>Bluespace Review Board</h1>
      <div class="subtitle" id="subtitle"></div>
    </div>
    <div class="top-actions">
      <button type="button" id="syncLedger" class="primary">Update</button>
      <button type="button" id="forceRefresh">强制刷新</button>
      <button type="button" id="copyLiked">复制喜欢路径</button>
      <button type="button" id="copyLikedRecipes">复制喜欢配方</button>
      <button type="button" id="copyVisible">复制可见路径</button>
      <button type="button" id="pauseAll">暂停全部</button>
    </div>
  </header>
  <main class="wrap">
    <section class="stats" id="stats"></section>
    <section class="filters">
      <label>搜索
        <input id="search" type="search" placeholder="title / shot / task / path">
      </label>
      <label>Review
        <select id="reviewFilter"></select>
      </label>
      <label>Shot
        <select id="shotFilter"></select>
      </label>
      <label>Model
        <select id="modelFilter"></select>
      </label>
      <label>Kind
        <select id="kindFilter"></select>
      </label>
      <label>Role
        <select id="roleFilter"></select>
      </label>
      <label>Recipe
        <select id="recipeFilter"></select>
      </label>
      <label>Mark
        <select id="markFilter"></select>
      </label>
      <label>Sort
        <select id="sortMode"></select>
      </label>
      <button type="button" id="resetFilters">重置</button>
    </section>
    <section class="board-layout">
      <aside class="shot-rail" aria-label="Shot quick filter">
        <div class="shot-rail-head"><span>Shots</span><span id="shotQuickSummary"></span></div>
        <div class="shot-list" id="shotQuickFilters"></div>
      </aside>
      <div class="board-content">
        <section class="chips" id="chips"></section>
        <section class="grid" id="grid"></section>
        <section class="empty" id="empty" hidden>没有符合条件的媒体。</section>
      </div>
    </section>
  </main>
  <script>
    document.write('<script src="./${DATA_FILE_NAME}?cache_bust=' + Date.now() + '"><\\/script>');
  </script>
  <script>
    const data = window.REVIEW_BOARD_DATA;
    const DEFAULT_VIEW_STATE = Object.freeze({
      search: "",
      review: "all",
      shot: "all",
      model: "all",
      kind: "all",
      role: "all",
      recipe: "all",
      mark: "all",
      sort: "ledger",
    });
    const state = { ...DEFAULT_VIEW_STATE };
    const markStorageKey = "review-board:marks:" + data.ledger;
    const viewPreferenceStorageKey = "review-board:view-preferences:v1";
    const expandedDislikes = {};
    let userMarks = loadMarks();
    const els = {
      subtitle: document.getElementById("subtitle"),
      stats: document.getElementById("stats"),
      search: document.getElementById("search"),
      review: document.getElementById("reviewFilter"),
      shot: document.getElementById("shotFilter"),
      model: document.getElementById("modelFilter"),
      kind: document.getElementById("kindFilter"),
      role: document.getElementById("roleFilter"),
      recipe: document.getElementById("recipeFilter"),
      mark: document.getElementById("markFilter"),
      sort: document.getElementById("sortMode"),
      reset: document.getElementById("resetFilters"),
      forceRefresh: document.getElementById("forceRefresh"),
      shotQuick: document.getElementById("shotQuickFilters"),
      shotQuickSummary: document.getElementById("shotQuickSummary"),
      chips: document.getElementById("chips"),
      grid: document.getElementById("grid"),
      empty: document.getElementById("empty"),
      copyLiked: document.getElementById("copyLiked"),
      copyLikedRecipes: document.getElementById("copyLikedRecipes"),
      syncLedger: document.getElementById("syncLedger"),
      copyVisible: document.getElementById("copyVisible"),
      pauseAll: document.getElementById("pauseAll"),
    };

    function unique(field) {
      return [...new Set(data.assets.map((item) => item[field]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
    }

    function fillSelect(select, values, labelAll) {
      select.innerHTML = "";
      select.append(new Option(labelAll, "all"));
      values.forEach((value) => select.append(new Option(value, value)));
    }

    function init() {
      els.subtitle.textContent = data.ledger + " · " + data.assets.length + " assets · generated " + new Date(data.generatedAt).toLocaleString() + formatSyncStatus();
      fillSelect(els.review, unique("review"), "全部状态");
      fillSelect(els.shot, unique("shotId"), "全部镜头");
      fillSelect(els.model, unique("model"), "全部模型");
      fillSelect(els.kind, unique("kind"), "全部类型");
      fillSelect(els.role, unique("role"), "全部用途");
      fillRecipeSelect();
      fillSelect(els.mark, ["liked", "unmarked", "disliked"], "全部标记");
      els.mark.querySelector('option[value="liked"]').textContent = "喜欢";
      els.mark.querySelector('option[value="unmarked"]').textContent = "未标记";
      els.mark.querySelector('option[value="disliked"]').textContent = "不喜欢";
      fillSortSelect();
      loadViewPreferencesIntoState();
      renderStats();
      renderGrid();
      bind();
    }

    function fillSortSelect() {
      const options = [
        ["ledger", "账本 / ingest 顺序"],
        ["liked", "喜欢优先"],
        ["newest", "时间新到旧"],
        ["oldest", "时间旧到新"],
        ["shot", "Shot 顺序"],
        ["review", "Review 状态"],
      ];
      els.sort.innerHTML = "";
      options.forEach(([value, label]) => els.sort.append(new Option(label, value)));
    }

    function fillRecipeSelect() {
      const options = [
        ["all", "全部配方"],
        ["full", "完整配方"],
        ["summary_only", "仅摘要"],
        ["missing", "缺 prompt"],
      ];
      els.recipe.innerHTML = "";
      options.forEach(([value, label]) => els.recipe.append(new Option(label, value)));
    }

    function loadViewPreferencesIntoState() {
      const preferences = loadViewPreferences();
      state.search = normalizeSearch(preferences.search);
      for (const [key, select] of filterSelects()) {
        const preferred = typeof preferences[key] === "string" ? preferences[key] : DEFAULT_VIEW_STATE[key];
        state[key] = hasOption(select, preferred) ? preferred : DEFAULT_VIEW_STATE[key];
      }
      syncControlsFromState();
    }

    function loadViewPreferences() {
      try {
        return JSON.parse(localStorage.getItem(viewPreferenceStorageKey) || "{}");
      } catch {
        return {};
      }
    }

    function saveViewPreferences() {
      try {
        localStorage.setItem(viewPreferenceStorageKey, JSON.stringify({
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          search: state.search,
          review: state.review,
          shot: state.shot,
          model: state.model,
          kind: state.kind,
          role: state.role,
          recipe: state.recipe,
          mark: state.mark,
          sort: state.sort,
        }));
      } catch {
        // The board remains usable if the browser blocks storage for file URLs.
      }
    }

    function resetViewPreferences() {
      Object.assign(state, DEFAULT_VIEW_STATE);
      syncControlsFromState();
      saveViewPreferences();
    }

    function syncControlsFromState() {
      els.search.value = state.search;
      for (const [key, select] of filterSelects()) {
        select.value = hasOption(select, state[key]) ? state[key] : DEFAULT_VIEW_STATE[key];
        state[key] = select.value;
      }
    }

    function filterSelects() {
      return [["review", els.review], ["shot", els.shot], ["model", els.model], ["kind", els.kind], ["role", els.role], ["recipe", els.recipe], ["mark", els.mark], ["sort", els.sort]];
    }

    function hasOption(select, value) {
      return Array.from(select.options).some((option) => option.value === value);
    }

    function normalizeSearch(value) {
      return typeof value === "string" ? value.trim().toLowerCase() : "";
    }

    function formatSyncStatus() {
      if (!data.syncStatus) return "";
      const status = data.syncStatus.ok ? "同步成功" : "同步失败";
      const time = data.syncStatus.finishedAt || data.syncStatus.startedAt || data.syncStatus.time || "";
      const source = data.syncStatus.source ? " · " + data.syncStatus.source : "";
      return " · " + status + (time ? " " + new Date(time).toLocaleString() : "") + source;
    }

    function bind() {
      els.search.addEventListener("input", () => {
        state.search = normalizeSearch(els.search.value);
        saveViewPreferences();
        apply();
      });
      for (const [key, select] of filterSelects()) {
        select.addEventListener("change", () => {
          state[key] = select.value;
          saveViewPreferences();
          if (key === "sort") {
            renderGrid();
          } else {
            apply();
          }
        });
      }
      els.reset.addEventListener("click", () => {
        resetViewPreferences();
        renderGrid();
      });
      els.shotQuick.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-shot-filter]");
        if (!button) return;
        state.shot = button.dataset.shotFilter;
        syncControlsFromState();
        saveViewPreferences();
        apply();
      });
      els.copyLiked.addEventListener("click", async () => {
        const paths = data.assets
          .filter((item) => markFor(item) === "liked")
          .map((item) => item.outputPath)
          .join("\\n");
        await copyText(paths, els.copyLiked);
      });
      els.copyLikedRecipes.addEventListener("click", async () => {
        const recipes = data.assets
          .filter((item) => markFor(item) === "liked")
          .map((item) => buildRecipe(item));
        await copyText(JSON.stringify({
          ledger: data.ledger,
          generated_at: new Date().toISOString(),
          recipes,
        }, null, 2), els.copyLikedRecipes);
      });
      els.syncLedger.addEventListener("click", () => {
        triggerOneShotSync(true, els.syncLedger);
      });
      els.forceRefresh.addEventListener("click", () => {
        const url = new URL(window.location.href);
        url.searchParams.set("cache_bust", Date.now().toString());
        window.location.replace(url.href);
      });
      els.copyVisible.addEventListener("click", async () => {
        const paths = filteredAssets().map((item) => item.outputPath).join("\\n");
        await copyText(paths, els.copyVisible);
      });
      els.pauseAll.addEventListener("click", () => {
        document.querySelectorAll("video").forEach((video) => video.pause());
      });
    }

    function renderStats() {
      const liked = data.assets.filter((item) => markFor(item) === "liked").length;
      const disliked = data.assets.filter((item) => markFor(item) === "disliked").length;
      const saved = data.assets.filter((item) => savedMarkFor(item)).length;
      const pending = data.assets.filter((item) => pendingMarkFor(item)).length;
      const fullPrompt = data.assets.filter((item) => item.promptState === "full").length;
      const selected = data.assets.filter((item) => item.review === "selected").length;
      const needsReview = data.assets.filter((item) => item.review === "needs_review").length;
      const missing = data.assets.filter((item) => !item.exists).length;
      const shots = new Set(data.assets.map((item) => item.shotId)).size;
      els.stats.innerHTML = [
        stat("总资产", data.assets.length),
        stat("喜欢", liked),
        stat("不喜欢", disliked),
        stat("已保存", saved),
        stat("待保存", pending),
        stat("完整配方", fullPrompt),
        stat("Selected", selected),
        stat("Needs Review", needsReview),
        stat("Missing", missing),
        stat("Shot Groups", shots),
      ].join("");
    }

    function stat(label, value) {
      return '<div class="stat"><strong>' + escapeHtml(value) + '</strong><span>' + escapeHtml(label) + '</span></div>';
    }

    function renderGrid() {
      els.grid.innerHTML = orderedAssets(data.assets).map(renderCard).join("");
      apply();
    }

    function renderCard(item) {
      const entryKey = markKey(item);
      const mark = markFor(item);
      const localMark = localMarkFor(item);
      const markSource = markSourceFor(item);
      const folded = mark === "disliked" && !expandedDislikes[entryKey];
      const haystack = itemSearchText(item);
      const media = renderMedia(item);
      const task = item.taskId ? '<span>task ' + escapeHtml(item.taskId.slice(0, 12)) + '</span>' : "";
      const markBadge = renderMarkBadge(item);
      const promptBadge = '<span class="badge prompt-' + escapeAttr(item.promptState) + '">' + escapeHtml(promptStateLabel(item.promptState)) + '</span>';
      const foldedClass = folded ? " folded" : "";
      const markClass = mark ? " " + mark : "";
      const clearDisabled = localMark || savedMarkFor(item) ? "" : " disabled";
      const clearMark = localMark ? "clear" : savedMarkFor(item) ? "cleared" : "clear";
      const clearLabel = localMark ? "撤销本地" : savedMarkFor(item) ? "取消标记" : "未标记";
      return '<article class="card' + markClass + foldedClass + '" data-entry-key="' + escapeAttr(entryKey) + '" data-search="' + escapeAttr(haystack) + '" data-review="' + escapeAttr(item.review) + '" data-shot="' + escapeAttr(item.shotId) + '" data-model="' + escapeAttr(item.model) + '" data-kind="' + escapeAttr(item.kind) + '" data-role="' + escapeAttr(item.role) + '" data-recipe="' + escapeAttr(item.promptState) + '" data-user-mark="' + escapeAttr(mark || "unmarked") + '" data-mark-source="' + escapeAttr(markSource || "none") + '">' +
        '<div class="card-head">' +
          '<div class="title-row"><div class="title">' + escapeHtml(item.title) + '</div><span>' + markBadge + promptBadge + '<span class="badge ' + escapeAttr(item.review) + '">' + escapeHtml(item.review) + '</span></span></div>' +
          '<div class="meta"><span>' + escapeHtml(item.shotId) + '</span><span>' + escapeHtml(item.legacyId || "no-legacy") + '</span><span>' + escapeHtml(item.model) + '</span><span>' + escapeHtml(item.kind) + '</span><span>' + escapeHtml(item.role || "role") + '</span>' + task + '</div>' +
        '</div>' +
        '<div class="media">' + media + '</div>' +
        '<div class="card-body">' +
          '<div class="fold-note">已标记为不喜欢，默认折叠。仍可展开查看完整预览。</div>' +
          '<div class="note foldable">' + escapeHtml(item.note || item.promptSummary || "暂无说明") + '</div>' +
          renderSavedDecision(item) +
          renderRecipe(item) +
          '<div class="path foldable">' + escapeHtml(item.outputPath) + '</div>' +
          '<div class="actions">' +
            '<button type="button" class="' + (mark === "liked" ? "active-like" : "") + '" data-mark="liked" data-entry-key="' + escapeAttr(entryKey) + '">喜欢</button>' +
            '<button type="button" class="' + (mark === "disliked" ? "active-dislike" : "") + '" data-mark="disliked" data-entry-key="' + escapeAttr(entryKey) + '">不喜欢</button>' +
            '<button type="button" data-mark="' + escapeAttr(clearMark) + '" data-entry-key="' + escapeAttr(entryKey) + '"' + clearDisabled + '>' + clearLabel + '</button>' +
            (mark === "disliked" ? '<button type="button" data-toggle-fold="' + escapeAttr(entryKey) + '">' + (folded ? "展开" : "折叠") + '</button>' : "") +
            '<a href="' + escapeAttr(item.href) + '">打开文件</a>' +
            '<button type="button" data-copy-recipe="' + escapeAttr(entryKey) + '">复制配方</button>' +
            '<button type="button" data-copy="' + escapeAttr(item.absPath || item.outputPath) + '">复制本机路径</button>' +
            '<button type="button" data-copy="' + escapeAttr(item.outputPath) + '">复制项目路径</button>' +
            '<button type="button" data-copy="' + escapeAttr(item.entryId) + '">复制 entry</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }

    function renderMedia(item) {
      if (!item.exists) {
        return '<div class="missing-media">Missing file</div>';
      }
      if (isVideoLike(item)) {
        return '<video controls preload="metadata" src="' + escapeAttr(item.href) + '"></video>';
      }
      if (isImageLike(item)) {
        return '<img loading="lazy" src="' + escapeAttr(item.href) + '" alt="' + escapeAttr(item.title) + '">';
      }
      return '<div class="missing-media">No preview for ' + escapeHtml(item.kind) + '</div>';
    }

    function isVideoLike(item) {
      return item.kind === "video" || /\\.(mp4|mov|webm|mkv)$/i.test(item.outputPath || "");
    }

    function isImageLike(item) {
      return ["image", "keyframe", "sheet", "storyboard", "reference"].includes(item.kind) ||
        /\\.(png|jpe?g|webp|gif)$/i.test(item.outputPath || "");
    }

    function renderSavedDecision(item) {
      if (!item.savedDecision) return "";
      const saved = item.savedDecision;
      const local = pendingMarkFor(item);
      const parts = [
        "项目已保存：" + markLabel(saved.mark || savedMarkFor(item)),
        saved.ledgerVerdict ? "账本映射：" + saved.ledgerVerdict : null,
        saved.decidedAt ? "时间：" + new Date(saved.decidedAt).toLocaleString() : null,
        saved.decisionId ? "decision：" + saved.decisionId : null,
      ].filter(Boolean);
      if (local) {
        parts.unshift("当前本地草稿会覆盖已保存判断：" + markLabel(local));
      }
      return '<div class="saved-decision foldable">' + escapeHtml(parts.join(" · ")) + '</div>';
    }

    function renderRecipe(item) {
      const rows = [];
      rows.push(recipeRow("状态", promptStateLabel(item.promptState)));
      if (item.promptSummary) rows.push(recipeRow("摘要", item.promptSummary));
      if (item.prompt) rows.push(recipeRow("完整 prompt", item.prompt));
      if (item.promptFile) rows.push(recipeRow("prompt 文件", item.promptFile));
      if (item.negativePrompt) rows.push(recipeRow("negative prompt", item.negativePrompt));
      if (item.seed) rows.push(recipeRow("seed", item.seed));
      if (Object.keys(item.settings || {}).length > 0) {
        rows.push(recipeRow("settings", JSON.stringify(item.settings, null, 2)));
      }
      if (item.references.length > 0) {
        rows.push(recipeRow("references", item.references.map((ref) => ref.role + ": " + ref.path).join("\\n")));
      }
      if (item.command) rows.push(recipeRow("command", item.command));
      if (rows.length === 1 && item.promptState === "missing") {
        rows.push(recipeRow("说明", "这条历史资产没有记录完整 prompt。不要倒推或编造，后续只能作为视觉参考。"));
      }
      return '<details class="recipe foldable"><summary>生成配方</summary><div class="recipe-grid">' + rows.join("") + '</div></details>';
    }

    function recipeRow(label, value) {
      return '<div><div class="recipe-label">' + escapeHtml(label) + '</div><div class="recipe-value">' + escapeHtml(value) + '</div></div>';
    }

    function apply() {
      const visible = filteredAssets();
      let visibleCount = 0;
      document.querySelectorAll(".card").forEach((card) => {
        const isVisible = matchesCard(card);
        card.classList.toggle("hidden", !isVisible);
        if (isVisible) visibleCount += 1;
      });
      els.empty.hidden = visibleCount !== 0;
      renderShotQuickFilters();
      renderChips(visibleCount, visible);
      bindMarkButtons();
      bindRecipeButtons();
      bindCopyButtons();
    }

    function filteredAssets() {
      return orderedAssets(data.assets.filter((item) => matchesAsset(item)));
    }

    function matchesAsset(item, options = {}) {
      if (state.review !== "all" && item.review !== state.review) return false;
      if (!options.ignoreShot && state.shot !== "all" && item.shotId !== state.shot) return false;
      if (state.model !== "all" && item.model !== state.model) return false;
      if (state.kind !== "all" && item.kind !== state.kind) return false;
      if (state.role !== "all" && item.role !== state.role) return false;
      if (state.recipe !== "all" && item.promptState !== state.recipe) return false;
      const mark = markFor(item) || "unmarked";
      if (state.mark !== "all" && mark !== state.mark) return false;
      if (state.search && !itemSearchText(item).includes(state.search)) return false;
      return true;
    }

    function itemSearchText(item) {
      return [
        item.title,
        item.shotId,
        item.legacyId,
        item.entryId,
        item.taskId,
        item.role,
        item.promptState,
        item.outputPath,
        item.note,
        item.prompt,
        item.promptFile,
        item.promptSummary,
        item.command,
        item.references.map((ref) => ref.path).join(" "),
        markFor(item),
        markSourceFor(item),
        item.savedDecision?.decisionId || "",
      ].join(" ").toLowerCase();
    }

    function renderShotQuickFilters() {
      const shots = unique("shotId");
      const counts = new Map();
      let allCount = 0;
      for (const item of data.assets) {
        if (!matchesAsset(item, { ignoreShot: true })) continue;
        const shot = item.shotId || "(unmapped)";
        counts.set(shot, (counts.get(shot) || 0) + 1);
        allCount += 1;
      }
      els.shotQuickSummary.textContent = shots.length + " groups";
      const buttons = [
        renderShotButton("all", "全部", allCount),
        ...shots.map((shot) => renderShotButton(shot, shot, counts.get(shot) || 0)),
      ];
      els.shotQuick.innerHTML = buttons.join("");
    }

    function renderShotButton(value, label, count) {
      const active = state.shot === value;
      const empty = count === 0;
      const classes = ["shot-button", active ? "active" : "", empty ? "empty-shot" : ""].filter(Boolean).join(" ");
      return '<button type="button" class="' + classes + '" data-shot-filter="' + escapeAttr(value) + '" aria-pressed="' + String(active) + '" title="' + escapeAttr(label + " · " + count) + '">' +
        '<span class="shot-id">' + escapeHtml(label) + '</span>' +
        '<span class="shot-count">' + escapeHtml(count) + '</span>' +
      '</button>';
    }

    function matchesCard(card) {
      if (state.review !== "all" && card.dataset.review !== state.review) return false;
      if (state.shot !== "all" && card.dataset.shot !== state.shot) return false;
      if (state.model !== "all" && card.dataset.model !== state.model) return false;
      if (state.kind !== "all" && card.dataset.kind !== state.kind) return false;
      if (state.role !== "all" && card.dataset.role !== state.role) return false;
      if (state.recipe !== "all" && card.dataset.recipe !== state.recipe) return false;
      if (state.mark !== "all" && card.dataset.userMark !== state.mark) return false;
      if (state.search && !card.dataset.search.includes(state.search)) return false;
      return true;
    }

    function renderChips(count, visible) {
      const labels = [
        count + " visible",
        state.review !== "all" ? "review:" + state.review : null,
        state.shot !== "all" ? "shot:" + state.shot : null,
        state.model !== "all" ? "model:" + state.model : null,
        state.kind !== "all" ? "kind:" + state.kind : null,
        state.role !== "all" ? "role:" + state.role : null,
        state.recipe !== "all" ? "recipe:" + promptStateLabel(state.recipe) : null,
        state.mark !== "all" ? "mark:" + state.mark : null,
        "sort:" + sortLabel(state.sort),
      ].filter(Boolean);
      const selectedVisible = visible.filter((item) => item.review === "selected").length;
      const likedVisible = visible.filter((item) => markFor(item) === "liked").length;
      const dislikedVisible = visible.filter((item) => markFor(item) === "disliked").length;
      const savedVisible = visible.filter((item) => savedMarkFor(item)).length;
      const pendingVisible = visible.filter((item) => pendingMarkFor(item)).length;
      labels.push(selectedVisible + " selected visible");
      labels.push(likedVisible + " liked visible");
      labels.push(dislikedVisible + " disliked visible");
      labels.push(savedVisible + " saved visible");
      labels.push(pendingVisible + " pending visible");
      els.chips.innerHTML = labels.map((label) => '<span class="chip">' + escapeHtml(label) + '</span>').join("");
    }

    function orderedAssets(assets) {
      const originalIndex = new Map(data.assets.map((item, index) => [item, index]));
      return assets.slice().sort((a, b) => {
        if (state.sort === "liked") {
          const rankDelta = markRank(markFor(a)) - markRank(markFor(b));
          if (rankDelta !== 0) return rankDelta;
        } else if (state.sort === "newest" || state.sort === "oldest") {
          const direction = state.sort === "newest" ? -1 : 1;
          const timeDelta = (sortTime(a) - sortTime(b)) * direction;
          if (timeDelta !== 0) return timeDelta;
        } else if (state.sort === "shot") {
          const shotDelta = String(a.shotId).localeCompare(String(b.shotId));
          if (shotDelta !== 0) return shotDelta;
        } else if (state.sort === "review") {
          const reviewDelta = reviewRank(a.review) - reviewRank(b.review);
          if (reviewDelta !== 0) return reviewDelta;
        }
        return (originalIndex.get(a) || 0) - (originalIndex.get(b) || 0);
      });
    }

    function sortLabel(sort) {
      if (sort === "liked") return "喜欢优先";
      if (sort === "newest") return "时间新到旧";
      if (sort === "oldest") return "时间旧到新";
      if (sort === "shot") return "Shot 顺序";
      if (sort === "review") return "Review 状态";
      return "账本/ingest";
    }

    function sortTime(item) {
      const value = item.fileModifiedAt || item.productionDate || item.ingestedAt || "";
      const time = Date.parse(value);
      return Number.isFinite(time) ? time : 0;
    }

    function markRank(mark) {
      if (mark === "liked") return 0;
      if (mark === "disliked") return 2;
      return 1;
    }

    function reviewRank(review) {
      if (review === "selected") return 0;
      if (review === "needs_review") return 1;
      if (review === "reference_only") return 2;
      if (review === "rejected") return 3;
      return 4;
    }

    function markKey(item) {
      return item.entryId || item.outputPath;
    }

    function localMarkFor(item) {
      return userMarks[markKey(item)] || "";
    }

    function savedMarkFor(item) {
      return item.savedMark || "";
    }

    function pendingMarkFor(item) {
      const local = localMarkFor(item);
      const saved = savedMarkFor(item);
      if (local === "cleared") return saved ? "cleared" : "";
      return local && local !== saved ? local : "";
    }

    function markFor(item) {
      const pending = pendingMarkFor(item);
      if (pending === "cleared") return "";
      const local = localMarkFor(item);
      if (local === "cleared") return "";
      return pending || savedMarkFor(item) || local || "";
    }

    function markSourceFor(item) {
      if (pendingMarkFor(item)) return "local";
      if (savedMarkFor(item)) return "saved";
      if (localMarkFor(item) && localMarkFor(item) !== "cleared") return "local";
      return "";
    }

    function markLabel(mark) {
      if (mark === "liked") return "喜欢";
      if (mark === "disliked") return "不喜欢";
      if (mark === "cleared") return "取消标记";
      return "未标记";
    }

    function renderMarkBadge(item) {
      const pending = pendingMarkFor(item);
      if (pending === "cleared") {
        return '<span class="badge user-mark local">' + escapeHtml("取消 · 待保存") + '</span>';
      }
      const mark = markFor(item);
      const source = markSourceFor(item);
      return mark ? '<span class="badge user-mark ' + escapeAttr(mark) + ' ' + escapeAttr(source) + '">' + escapeHtml(markLabel(mark) + " · " + markSourceLabel(source)) + '</span>' : "";
    }

    function markSourceLabel(source) {
      if (source === "saved") return "已保存";
      if (source === "local") return "待保存";
      return "未保存";
    }

    function promptStateLabel(state) {
      if (state === "full") return "完整配方";
      if (state === "summary_only") return "仅摘要";
      return "缺 prompt";
    }

    function setMark(entryKey, mark) {
      if (mark === "clear") {
        delete userMarks[entryKey];
        delete expandedDislikes[entryKey];
      } else if (mark === "cleared") {
        const item = itemByKey(entryKey);
        if (item && savedMarkFor(item)) {
          userMarks[entryKey] = "cleared";
        } else {
          delete userMarks[entryKey];
        }
        delete expandedDislikes[entryKey];
      } else {
        const item = itemByKey(entryKey);
        if (item && mark === savedMarkFor(item)) {
          delete userMarks[entryKey];
        } else {
          userMarks[entryKey] = mark;
        }
        if (mark !== "disliked") delete expandedDislikes[entryKey];
      }
      saveMarks();
      renderStats();
      renderGrid();
    }

    function loadMarks() {
      try {
        return JSON.parse(localStorage.getItem(markStorageKey) || "{}");
      } catch {
        return {};
      }
    }

    function saveMarks() {
      try {
        localStorage.setItem(markStorageKey, JSON.stringify(userMarks));
      } catch {
        // File-based review pages can still work without persistent browser storage.
      }
    }

    function buildMarksPayload() {
      const marks = data.assets
        .map((item) => ({
          entry_id: item.entryId,
          shot_id: item.shotId,
          title: item.title,
          output_path: item.outputPath,
          mark: pendingMarkFor(item),
          mark_source: "local",
          previous_saved_mark: savedMarkFor(item) || null,
          saved_decision_id: item.savedDecision?.decisionId || null,
          prompt_state: item.promptState,
          recipe: buildRecipe(item),
        }))
        .filter((item) => item.mark);
      return {
        ledger: data.ledger,
        ledger_hash: data.ledgerHash,
        decision_log: data.decisionLog || null,
        decision_log_hash: data.decisionLogHash || null,
        source_hash: data.sourceHash,
        schema_version: 1,
        export_mode: "pending_local",
        sync_token: data.syncToken || null,
        generated_at: new Date().toISOString(),
        liked_count: marks.filter((item) => item.mark === "liked").length,
        disliked_count: marks.filter((item) => item.mark === "disliked").length,
        cleared_count: marks.filter((item) => item.mark === "cleared").length,
        marks,
      };
    }

    function buildMarksFileName() {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return "review-marks-" + stamp + ".json";
    }

    function triggerOneShotSync(applyLedger, button) {
      const marksPayload = buildMarksPayload();
      if (!data.syncToken) {
        flashButton(button, "缺少同步令牌");
        return;
      }
      const hasMarks = marksPayload.marks.length > 0;
      if (hasMarks) {
        const payload = JSON.stringify(marksPayload, null, 2);
        const staged = stageSyncPayload(payload);
        if (!staged) {
          showManualCopy(payload);
          flashButton(button, "请手动复制");
          return;
        }
      }
      const url = "trae-review-sync://sync?applyLedger=" + (applyLedger ? "1" : "0") + "&marks=" + (hasMarks ? "1" : "0") + "&token=" + encodeURIComponent(data.syncToken || "");
      openSyncProtocol(url);
      flashButton(button, hasMarks ? "请求更新" : "请求同步");
    }

    function openSyncProtocol(url) {
      const link = document.createElement("a");
      link.href = url;
      link.rel = "noreferrer";
      document.body.append(link);
      link.click();
      link.remove();
    }

    function stageSyncPayload(payload) {
      if (tryTextareaCopy(payload)) return true;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(payload).catch(() => {});
        return true;
      }
      return false;
    }

    function buildRecipe(item) {
      return {
        entry_id: item.entryId,
        scene_slug: item.sceneSlug,
        shot_id: item.shotId,
        legacy_id: item.legacyId,
        title: item.title,
        asset: {
          kind: item.kind,
          model: item.model,
          output_path: item.outputPath,
          exists: item.exists,
          spec: item.spec,
        },
        generation: {
          tool: item.tool,
          mode: item.mode,
          task_id: item.taskId,
          command: item.command || null,
          prompt: item.prompt || null,
          prompt_file: item.promptFile || null,
          negative_prompt: item.negativePrompt || null,
          prompt_summary: item.promptSummary || null,
          prompt_state: item.promptState,
          seed: item.seed || null,
          settings: item.settings || {},
          references: item.references || [],
        },
        review_decision: item.savedDecision
          ? {
              mark: item.savedDecision.mark,
              saved_mark: item.savedMark,
              last_decision_mark: item.savedDecision.mark,
              decision_id: item.savedDecision.decisionId,
              session_id: item.savedDecision.sessionId,
              decided_at: item.savedDecision.decidedAt,
              ledger_verdict: item.savedDecision.ledgerVerdict,
            }
          : null,
        reuse_note: item.promptState === "full"
          ? "可以作为后续生成配方基准；AI 仍可能产生不同结果。"
          : "历史记录缺少完整 prompt，只能作为视觉/运动参考，不能视为可完整复现配方。",
      };
    }

    function itemByKey(entryKey) {
      return data.assets.find((item) => markKey(item) === entryKey);
    }

    function bindMarkButtons() {
      document.querySelectorAll("button[data-mark]").forEach((button) => {
        if (button.dataset.bound) return;
        button.dataset.bound = "1";
        button.addEventListener("click", () => {
          setMark(button.dataset.entryKey, button.dataset.mark);
        });
      });
      document.querySelectorAll("button[data-toggle-fold]").forEach((button) => {
        if (button.dataset.bound) return;
        button.dataset.bound = "1";
        button.addEventListener("click", () => {
          const entryKey = button.dataset.toggleFold;
          expandedDislikes[entryKey] = !expandedDislikes[entryKey];
          renderGrid();
        });
      });
    }

    function bindRecipeButtons() {
      document.querySelectorAll("button[data-copy-recipe]").forEach((button) => {
        if (button.dataset.bound) return;
        button.dataset.bound = "1";
        button.addEventListener("click", async () => {
          const item = itemByKey(button.dataset.copyRecipe);
          if (!item) return;
          await copyText(JSON.stringify(buildRecipe(item), null, 2), button);
        });
      });
    }

    function flashButton(button, text) {
      const oldText = button.textContent;
      button.textContent = text;
      setTimeout(() => (button.textContent = oldText), 900);
    }

    async function copyText(text, button) {
      const value = String(text || "");
      if (!value) {
        flashButton(button, "无内容");
        return false;
      }
      if (await tryClipboardApi(value)) {
        flashButton(button, "已复制");
        return true;
      }
      if (tryTextareaCopy(value)) {
        flashButton(button, "已复制");
        return true;
      }
      showManualCopy(value);
      flashButton(button, "手动复制");
      return false;
    }

    async function tryClipboardApi(text) {
      if (!navigator.clipboard || !navigator.clipboard.writeText) return false;
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }

    function tryTextareaCopy(text) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.append(textarea);
      textarea.focus();
      textarea.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      textarea.remove();
      return ok;
    }

    function showManualCopy(text) {
      document.querySelectorAll(".copy-fallback").forEach((node) => node.remove());
      const panel = document.createElement("section");
      panel.className = "copy-fallback";
      panel.innerHTML =
        '<label>自动复制被浏览器拦截，请手动复制</label>' +
        '<textarea readonly></textarea>' +
        '<div class="copy-fallback-actions"><button type="button">关闭</button></div>';
      const textarea = panel.querySelector("textarea");
      textarea.value = text;
      panel.querySelector("button").addEventListener("click", () => panel.remove());
      document.body.append(panel);
      textarea.focus();
      textarea.select();
    }

    function downloadText(text, filename) {
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function bindCopyButtons() {
      document.querySelectorAll("button[data-copy]").forEach((button) => {
        if (button.dataset.bound) return;
        button.dataset.bound = "1";
        button.addEventListener("click", async () => {
          await copyText(button.dataset.copy || "", button);
        });
      });
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char]);
    }

    function escapeAttr(value) {
      return escapeHtml(value).replace(new RegExp(String.fromCharCode(96), "g"), "&#096;");
    }

    init();
  </script>
</body>
</html>
`;
}

function firstNote(entry) {
  const notes = entry.review?.notes || [];
  if (notes.length > 0) return notes[0];
  return entry.generation?.prompt_summary || "";
}

function inferKind(pathText) {
  const ext = extname(pathText).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return "image";
  if ([".mp4", ".mov", ".webm", ".avi"].includes(ext)) return "video";
  return "asset";
}

function resolveMaybeProjectRelative(pathText) {
  if (isAbsolute(pathText) || /^[A-Za-z]:[\\/]/.test(pathText)) return resolve(pathText);
  return resolve(projectRoot, pathText);
}

function findProjectRoot(startDir) {
  let current = resolve(startDir);
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(current, "AGENTS.md")) && existsSync(join(current, "bluespace"))) {
      return current;
    }
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
  return resolve(SCRIPT_DIR, "..", "..");
}

function normalizeSlashes(pathText) {
  return pathText.replace(/\\/g, "/");
}

function toProjectRel(pathText) {
  const rel = normalizeSlashes(relative(projectRoot, pathText));
  return rel && !rel.startsWith("..") ? rel : normalizeSlashes(pathText);
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

function hashJson(value) {
  return hashText(stableJson(value));
}

function stableJson(value) {
  return JSON.stringify(sortJson(value), null, 2);
}

function safeScriptJson(value) {
  return stableJson(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map((item) => sortJson(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJson(value[key])]),
  );
}

function countBy(items, getter) {
  const counts = {};
  for (const item of items) {
    const key = getter(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function formatCounts(counts) {
  return Object.entries(counts)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function safeFileName(value) {
  return String(value || "unmapped")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || "unmapped";
}

function parseArgs(args) {
  const parsed = {
    help: false,
    projectRoot: null,
    ledger: null,
    decisionLog: null,
    output: null,
    force: false,
    dataOnly: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const [key, inlineValue] = arg.includes("=") ? arg.split(/=(.*)/s, 2) : [arg, null];
    const readValue = () => {
      if (inlineValue !== null) return inlineValue;
      i += 1;
      if (i >= args.length) throw new Error(`Missing value for ${arg}`);
      return args[i];
    };

    if (arg === "-h" || arg === "--help") parsed.help = true;
    else if (key === "--project-root") parsed.projectRoot = readValue();
    else if (key === "--ledger") parsed.ledger = readValue();
    else if (key === "--decision-log") parsed.decisionLog = readValue();
    else if (key === "--output") parsed.output = readValue();
    else if (arg === "--force") parsed.force = true;
    else if (arg === "--data-only") parsed.dataOnly = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function printHelp() {
  process.stdout.write(`Review board generator

Usage:
  node tools/project-harness/review-board.mjs [options]
  tools/project-harness/review-board.ps1 [options]
  tools/project-harness/review-board.sh [options]

Options:
  --project-root <path>    Defaults to the nearest trae_projects root.
  --ledger <path>          Defaults to bluespace/outputs/blue_space_bridge_0421/_ledger/production-ledger.jsonl.
  --decision-log <path>    Defaults to <ledger-dir>/review-decisions.jsonl when present.
  --output <path>          Defaults to bluespace/outputs/blue_space_bridge_0421/_review/index.html.
  --force                  Rewrite the page and data bundle even when the ledger cache is current.
  --data-only              Refresh only review-data.js and JSON data files; keep index.html unchanged.
  -h, --help               Show this help.
`);
}
