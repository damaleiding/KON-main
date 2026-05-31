#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCENE = "blue_space_bridge_0421";
const DEFAULT_LEDGER = `bluespace/outputs/${DEFAULT_SCENE}/_ledger/production-ledger.jsonl`;
const DECISION_SCHEMA_VERSION = 1;

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`Argument error: ${error.message}`);
  console.error("Run --help for usage.");
  process.exit(2);
}

if (opts.help || !opts.command) {
  printHelp();
  process.exit(opts.help ? 0 : 2);
}

const projectRoot = resolve(opts.projectRoot || findProjectRoot(process.cwd()));

try {
  if (opts.command === "import") {
    await commandImport();
  } else if (opts.command === "import-latest") {
    await commandImportLatest();
  } else if (opts.command === "register-protocol") {
    await commandRegisterProtocol();
  } else {
    throw new Error(`Unknown command: ${opts.command}`);
  }
} catch (error) {
  console.error(`review-decision: ${error.message}`);
  process.exit(1);
}

async function commandImport() {
  if (!opts.file) throw new Error("--file is required for import");

  const inputPath = resolveMaybeProjectRelative(opts.file);
  const payload = JSON.parse(stripBom(await readFile(inputPath, "utf8")));
  validateSyncToken(payload);
  const result = await importPayload(payload, inputPath);
  printImportResult(result);
}

async function commandImportLatest() {
  const latest = await findLatestMarksFile();
  if (!latest) {
    throw new Error(`No review-marks-*.json file found in: ${defaultSearchDirs().map(toProjectRel).join(", ")}`);
  }
  const payload = JSON.parse(stripBom(await readFile(latest, "utf8")));
  validateSyncToken(payload);
  const result = await importPayload(payload, latest);
  printImportResult(result);
}

async function importPayload(payload, inputPath) {
  const ledgerPath = resolveMaybeProjectRelative(opts.ledger || payload.ledger || DEFAULT_LEDGER);
  const decisionLogPath = resolveMaybeProjectRelative(opts.decisionLog || defaultDecisionLogPath(ledgerPath));
  const sessionId = opts.sessionId || payload.session_id || buildSessionId(payload.generated_at || payload.generatedAt);
  const marks = normalizeMarksPayload(payload, inputPath, ledgerPath, decisionLogPath, sessionId);
  const existingDecisionIds = await readExistingDecisionIds(decisionLogPath);
  const newDecisions = marks.filter((decision) => opts.force || !existingDecisionIds.has(decision.decision_id));
  const skippedDuplicates = marks.length - newDecisions.length;

  let ledgerResult = {
    applied: 0,
    missing: [],
    changed_entries: [],
  };

  if (opts.applyLedger) {
    ledgerResult = await applyDecisionsToLedger(ledgerPath, decisionLogPath, newDecisions);
  }

  const result = {
    input: inputPath ? toProjectRel(inputPath) : "review-board-sync",
    ledger: toProjectRel(ledgerPath),
    decision_log: toProjectRel(decisionLogPath),
    session_id: sessionId,
    received_marks: marks.length,
    imported_decisions: newDecisions.length,
    skipped_duplicates: skippedDuplicates,
    apply_ledger: opts.applyLedger,
    ledger_applied: ledgerResult.applied,
    ledger_missing: ledgerResult.missing.length,
    changed_entries: ledgerResult.changed_entries,
    dry_run: opts.dryRun,
  };

  if (!opts.dryRun) {
    await mkdir(dirname(decisionLogPath), { recursive: true });
    if (newDecisions.length > 0) {
      await appendFile(decisionLogPath, entriesToJsonl(newDecisions), "utf8");
    } else if (!existsSync(decisionLogPath)) {
      await writeFile(decisionLogPath, "", "utf8");
    }
  }

  return { ...result, decisions: newDecisions, ledger_result: ledgerResult };
}

function printImportResult(result) {
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Review decisions: ${result.imported_decisions} imported, ${result.skipped_duplicates} duplicate(s) skipped`);
  console.log(`Decision log: ${result.decision_log}`);
  if (opts.applyLedger) {
    console.log(`Ledger applied: ${result.ledger_applied}; missing: ${result.ledger_missing}`);
  } else {
    console.log("Ledger apply: skipped (use --apply-ledger to update review.verdict)");
  }
}

async function commandRegisterProtocol() {
  if (process.platform !== "win32") {
    throw new Error("register-protocol is currently implemented for Windows only. macOS can keep using import-latest.");
  }
  const protocolScript = join(SCRIPT_DIR, "review-sync-protocol.ps1");
  if (!existsSync(protocolScript)) throw new Error(`Missing protocol script: ${toProjectRel(protocolScript)}`);

  const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${protocolScript}" "%1"`;
  runReg(["add", "HKCU\\Software\\Classes\\trae-review-sync", "/ve", "/d", "URL:Trae Review Sync", "/f"]);
  runReg(["add", "HKCU\\Software\\Classes\\trae-review-sync", "/v", "URL Protocol", "/d", "", "/f"]);
  runReg(["add", "HKCU\\Software\\Classes\\trae-review-sync\\shell\\open\\command", "/ve", "/d", command, "/f"]);
  console.log("Registered trae-review-sync:// protocol for current Windows user.");
  console.log(`Command: ${command}`);
}

function normalizeMarksPayload(payload, inputPath, ledgerPath, decisionLogPath, sessionId) {
  const items = Array.isArray(payload.marks) ? payload.marks : Array.isArray(payload) ? payload : [];
  if (items.length === 0) throw new Error("No marks found. Expected Review Board marks JSON with a marks[] array.");

  const exportedAt = payload.generated_at || payload.generatedAt || new Date().toISOString();
  const source = {
    kind: "review_board_marks",
    file: toProjectRel(inputPath),
    ledger: toProjectRel(ledgerPath),
    exported_at: exportedAt,
  };

  return items
    .map((item) => normalizeMarkItem(item, source, decisionLogPath, sessionId))
    .filter(Boolean);
}

function normalizeMarkItem(item, source, decisionLogPath, sessionId) {
  const mark = String(item.mark || "").trim().toLowerCase();
  if (!["liked", "disliked", "cleared"].includes(mark)) return null;

  const entryId = item.entry_id || item.entryId || item.recipe?.entry_id || "";
  const outputPath = normalizeSlashes(item.output_path || item.outputPath || item.recipe?.asset?.output_path || "");
  const shotId = item.shot_id || item.shotId || item.recipe?.shot_id || null;
  const title = item.title || item.recipe?.title || outputPath || entryId;
  if (!entryId && !outputPath) return null;

  const decidedAt = new Date().toISOString();
  const ledgerVerdict = mark === "liked" ? opts.mapLiked : mark === "disliked" ? opts.mapDisliked : opts.mapCleared;
  const decisionId = `dec_${hashText([sessionId, entryId, outputPath, mark, ledgerVerdict].join("|")).slice(0, 14)}`;
  const reason = item.reason || item.note || item.review_note || "";
  const recipe = item.recipe || null;

  return {
    schema_version: DECISION_SCHEMA_VERSION,
    decision_id: decisionId,
    session_id: sessionId,
    decided_at: decidedAt,
    source,
    entry_id: entryId,
    shot_id: shotId,
    title,
    output_path: outputPath,
    mark,
    ledger_verdict: ledgerVerdict,
    reason,
    prompt_state: item.prompt_state || item.promptState || recipe?.generation?.prompt_state || null,
    recipe,
    decision_log: toProjectRel(decisionLogPath),
  };
}

async function applyDecisionsToLedger(ledgerPath, decisionLogPath, decisions) {
  if (!existsSync(ledgerPath)) throw new Error(`Ledger does not exist: ${toProjectRel(ledgerPath)}`);

  const lines = (await readFile(ledgerPath, "utf8")).split(/\r?\n/);
  const entries = [];
  const lineErrors = [];
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    try {
      entries.push(JSON.parse(line));
    } catch (error) {
      lineErrors.push(`line ${index + 1}: ${error.message}`);
    }
  });
  if (lineErrors.length > 0) {
    throw new Error(`Ledger has invalid JSON: ${lineErrors.slice(0, 3).join("; ")}`);
  }

  const byEntryId = new Map(entries.map((entry) => [entry.entry_id, entry]));
  const byOutput = new Map(entries.map((entry) => [normalizeSlashes(entry.asset?.output_path || ""), entry]));
  const missing = [];
  const changedEntries = [];

  for (const decision of decisions) {
    const entry = byEntryId.get(decision.entry_id) || byOutput.get(decision.output_path);
    if (!entry) {
      missing.push({
        decision_id: decision.decision_id,
        entry_id: decision.entry_id,
        output_path: decision.output_path,
      });
      continue;
    }

    entry.review = entry.review || {};
    const previousVerdict = entry.review.verdict || null;
    entry.review.verdict = decision.ledger_verdict;
    entry.review.notes = Array.isArray(entry.review.notes) ? entry.review.notes : [];
    const note = buildReviewNote(decision, previousVerdict);
    if (!entry.review.notes.includes(note)) entry.review.notes.push(note);
    entry.review.user_decision = {
      mark: decision.mark,
      decision_id: decision.decision_id,
      session_id: decision.session_id,
      decided_at: decision.decided_at,
      previous_verdict: previousVerdict,
      decision_log: toProjectRel(decisionLogPath),
    };

    changedEntries.push({
      entry_id: entry.entry_id,
      output_path: entry.asset?.output_path || decision.output_path,
      previous_verdict: previousVerdict,
      new_verdict: decision.ledger_verdict,
      decision_id: decision.decision_id,
    });
  }

  if (!opts.dryRun && changedEntries.length > 0) {
    await writeFile(ledgerPath, entriesToJsonl(entries), "utf8");
  }

  return {
    applied: changedEntries.length,
    missing,
    changed_entries: changedEntries,
  };
}

function buildReviewNote(decision, previousVerdict) {
  const base = `review-decision ${decision.session_id}: ${decision.mark} -> ${decision.ledger_verdict}`;
  const previous = previousVerdict ? `, previous=${previousVerdict}` : "";
  const reason = decision.reason ? `, reason=${decision.reason}` : "";
  return `${base}${previous}${reason}`;
}

async function readExistingDecisionIds(pathText) {
  const ids = new Set();
  if (!existsSync(pathText)) return ids;
  const text = await readFile(pathText, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    try {
      const entry = JSON.parse(line);
      if (entry.decision_id) ids.add(entry.decision_id);
    } catch {
      // Existing malformed lines should be handled by a future validator, not by import.
    }
  });
  return ids;
}

async function findLatestMarksFile() {
  const files = [];
  for (const dir of opts.searchDirs.length > 0 ? opts.searchDirs.map(resolveMaybeProjectRelative) : defaultSearchDirs()) {
    if (!dir || !existsSync(dir)) continue;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!/^review-marks-.+\.json$/i.test(entry.name)) continue;
      const pathText = join(dir, entry.name);
      const info = await stat(pathText);
      files.push({ path: pathText, mtimeMs: info.mtimeMs });
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.path || null;
}

function defaultSearchDirs() {
  return [
    process.env.USERPROFILE ? join(process.env.USERPROFILE, "Downloads") : null,
    process.env.HOME ? join(process.env.HOME, "Downloads") : null,
    projectRoot,
  ].filter(Boolean);
}

function validateSyncToken(payload) {
  if (!opts.syncToken) return;
  if (payload.sync_token !== opts.syncToken) {
    throw new Error("Review marks sync token does not match this workspace.");
  }
}

function runReg(args) {
  const result = spawnSync("reg.exe", args, {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`reg.exe failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function defaultDecisionLogPath(ledgerPath) {
  return join(dirname(ledgerPath), "review-decisions.jsonl");
}

function buildSessionId(value) {
  const source = value || new Date().toISOString();
  return `review_${source.replace(/[^0-9A-Za-z]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48)}`;
}

function entriesToJsonl(entries) {
  return entries.map((entry) => JSON.stringify(entry)).join("\n") + (entries.length ? "\n" : "");
}

function hashText(text) {
  return createHash("sha1").update(text).digest("hex");
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

function resolveMaybeProjectRelative(pathText) {
  if (!pathText) return null;
  if (isAbsolute(pathText) || /^[A-Za-z]:[\\/]/.test(pathText)) return resolve(pathText);
  return resolve(projectRoot, pathText);
}

function toProjectRel(pathText) {
  if (!pathText) return pathText;
  const rel = normalizeSlashes(relative(projectRoot, pathText));
  return rel && !rel.startsWith("..") ? rel : normalizeSlashes(pathText);
}

function normalizeSlashes(pathText) {
  return pathText ? pathText.replace(/\\/g, "/") : pathText;
}

function parseArgs(args) {
  const parsed = {
    command: null,
    help: false,
    json: false,
    projectRoot: null,
    file: null,
    ledger: null,
    decisionLog: null,
    sessionId: null,
    searchDirs: [],
    syncToken: null,
    applyLedger: false,
    dryRun: false,
    force: false,
    mapLiked: "selected",
    mapDisliked: "rejected",
    mapCleared: "needs_review",
  };

  if (args.length > 0 && !args[0].startsWith("-")) {
    parsed.command = args.shift();
  }

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
    else if (arg === "--json") parsed.json = true;
    else if (key === "--project-root") parsed.projectRoot = readValue();
    else if (key === "--file") parsed.file = readValue();
    else if (key === "--ledger") parsed.ledger = readValue();
    else if (key === "--decision-log") parsed.decisionLog = readValue();
    else if (key === "--session-id") parsed.sessionId = readValue();
    else if (key === "--search-dir") parsed.searchDirs.push(readValue());
    else if (key === "--sync-token") parsed.syncToken = readValue();
    else if (arg === "--apply-ledger") parsed.applyLedger = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--force") parsed.force = true;
    else if (key === "--map-liked") parsed.mapLiked = readValue();
    else if (key === "--map-disliked") parsed.mapDisliked = readValue();
    else if (key === "--map-cleared") parsed.mapCleared = readValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printHelp() {
  process.stdout.write(`Review decision importer

Usage:
  node tools/project-harness/review-decision.mjs import --file <marks.json> [options]
  tools/project-harness/review-decision.ps1 import --file <marks.json> [options]
  tools/project-harness/review-decision.ps1 import-latest [options]
  tools/project-harness/review-decision.ps1 register-protocol
  tools/project-harness/review-decision.sh import --file <marks.json> [options]

Commands:
  import                    Import Review Board marks JSON into review-decisions.jsonl.
  import-latest             Import the newest review-marks-*.json from Downloads.
  register-protocol         Windows only. Register trae-review-sync:// one-shot sync.

Options:
  --project-root <path>      Defaults to the nearest trae_projects root.
  --file <path>              Required. Review Board marks JSON export.
  --ledger <path>            Defaults to marks JSON ledger or the bridge production ledger.
  --decision-log <path>      Defaults to <ledger-dir>/review-decisions.jsonl.
  --session-id <id>          Stable id for this review session.
  --search-dir <path>        Directory to search for import-latest. Can repeat.
  --sync-token <token>       Require marks JSON to contain this workspace token.
  --apply-ledger             Also update production-ledger review.verdict.
  --map-liked <verdict>      Default selected.
  --map-disliked <verdict>   Default rejected.
  --map-cleared <verdict>    Default needs_review.
  --dry-run                  Print what would change without writing files.
  --force                    Re-import decisions even if decision_id already exists.
  --json                     Print machine-readable output.
  -h, --help                 Show this help.
`);
}
