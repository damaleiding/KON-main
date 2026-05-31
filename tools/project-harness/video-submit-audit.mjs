#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_ROOT = "bluespace/outputs/blue_space_bridge_0421";
const DEFAULT_LEDGER = `${DEFAULT_ROOT}/_ledger/production-ledger.jsonl`;
const DEFAULT_JSON = "bluespace/_harness/video-submit-audit.json";
const DEFAULT_MD = "bluespace/_harness/video-submit-audit.md";
const MIN_PROMPT_CHARS = 400;

function parseArgs(argv) {
  const opts = {
    root: DEFAULT_ROOT,
    ledger: DEFAULT_LEDGER,
    json: DEFAULT_JSON,
    md: DEFAULT_MD,
    "fail-on-blocker": false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--fail-on-blocker") {
      opts["fail-on-blocker"] = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`Unexpected positional argument: ${arg}`);
    const key = arg.slice(2);
    i += 1;
    if (i >= argv.length) throw new Error(`Missing value for --${key}`);
    opts[key] = argv[i];
  }
  return opts;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  } catch {
    return null;
  }
}

function readJson(filePath) {
  const text = readText(filePath);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "_review") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function hashText(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function flattenRefs(refs) {
  const out = [];
  if (!refs || typeof refs !== "object") return out;
  for (const value of Object.values(refs)) {
    for (const item of asArray(value)) {
      if (!item) continue;
      if (typeof item === "string") out.push(item);
      else if (typeof item.path === "string") out.push(item.path);
    }
  }
  return out;
}

function promptFromGeneration(generation, baseDir = ".") {
  const inline = generation?.prompt ? String(generation.prompt).trim() : "";
  if (inline) return { text: inline, source: "inline" };
  const promptFile = generation?.prompt_file;
  if (!promptFile) return { text: "", source: "missing" };
  const candidates = [
    promptFile,
    path.resolve(promptFile),
    path.resolve(baseDir, promptFile),
  ];
  for (const candidate of candidates) {
    const text = readText(candidate);
    if (text !== null) return { text: text.trim(), source: normalizePath(promptFile) };
  }
  return { text: "", source: normalizePath(promptFile), missingFile: true };
}

function settingValue(settings, names) {
  for (const name of names) {
    if (settings?.[name] !== undefined && settings?.[name] !== null) return settings[name];
  }
  return null;
}

function collectFlags({ prompt, settings, refs, shotId, active, generationTool, media }) {
  const flags = [];
  const resolution = String(settingValue(settings, ["resolution", "requested_resolution"]) || "");
  const ratio = String(settingValue(settings, ["ratio", "aspect_ratio"]) || "");
  const generateAudio = settingValue(settings, ["generate_audio"]);
  const audio = String(settingValue(settings, ["audio"]) || "");

  if (!prompt.text) {
    if (generationTool !== "shot-media-discovery") flags.push("missing_prompt");
  } else if (prompt.text.length < MIN_PROMPT_CHARS) {
    flags.push("short_prompt");
  }
  if (prompt.missingFile) flags.push("missing_prompt_file");
  if (resolution && !/1080p/i.test(resolution)) flags.push(`resolution_${resolution}`);
  if (ratio && ratio !== "16:9") flags.push(`ratio_${ratio}`);
  const normalizedAudio = audio.toLowerCase();
  if (
    generateAudio === true ||
    (normalizedAudio &&
      !/^(no_audio|none|false|off|no$)/.test(normalizedAudio) &&
      /(audio|true|generated|requested)/.test(normalizedAudio))
  ) {
    flags.push("audio_enabled");
  }

  const refText = refs.map((ref) => normalizePath(ref).toLowerCase()).join("\n");
  if (shotId === "s071" && /tail_waterdrop|waterdrop_tail|liked_tail_waterdrop|locked_waterdrop_tail|locked_tail/.test(refText)) {
    flags.push("s071_tail_waterdrop_ref");
  }
  if (media?.error) {
    flags.push("media_probe_failed");
  }
  if (media?.height && /1080p/i.test(resolution) && Number(media.height) < 1080) {
    flags.push(`actual_${media.width}x${media.height}`);
  }
  if (media?.width && media?.height && ratio === "16:9" && !matchesRatio(media.width, media.height, 16 / 9)) {
    flags.push(`actual_ratio_${media.width}x${media.height}`);
  }
  if (media?.has_audio && (generateAudio === false || /^no_audio|none|false|off|no$/i.test(normalizedAudio))) {
    flags.push("actual_audio_present");
  }

  const blockerFlags = new Set([
    "short_prompt",
    "missing_prompt_file",
    "audio_enabled",
    "s071_tail_waterdrop_ref",
    "media_probe_failed",
    "actual_audio_present",
  ]);
  const hasBlockerFlag = flags.some((flag) => blockerFlags.has(flag) || flag.startsWith("resolution_") || flag.startsWith("ratio_"));
  const hasActualResolutionMismatch = flags.some((flag) => flag.startsWith("actual_") && flag !== "actual_audio_present");
  const severity = active && hasBlockerFlag ? "blocker" : flags.length ? "warning" : "ok";
  return { flags, severity: active && hasActualResolutionMismatch ? "blocker" : severity };
}

function matchesRatio(width, height, expectedRatio) {
  const actual = Number(width) / Number(height);
  return Number.isFinite(actual) && Math.abs(actual - expectedRatio) < 0.02;
}

function probeMedia(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (stat.size === 0) return { error: "output file is empty" };
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=index,codec_type,width,height,duration",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      filePath,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    return { error: (result.stderr || result.stdout || "ffprobe failed").trim() };
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return { error: `ffprobe returned invalid JSON: ${result.stdout || result.stderr}`.trim() };
  }
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  return {
    width: video?.width || null,
    height: video?.height || null,
    duration: parsed.format?.duration || video?.duration || null,
    has_audio: Boolean(audio),
  };
}

function auditManifest(filePath, outputVerdicts = new Map()) {
  const doc = readJson(filePath);
  if (!doc?.generation) return null;
  const generation = doc.generation;
  const prompt = promptFromGeneration(generation, path.dirname(filePath));
  const refs = flattenRefs(generation.references);
  const settings = generation.settings || {};
  const output = doc.output || generation.output || "";
  const shotId = inferShotId(output || filePath);
  const outputPath = output ? path.resolve(output) : "";
  const outputExists = outputPath ? fs.existsSync(outputPath) : false;
  const ledgerVerdict = outputVerdicts.get(normalizePath(output));
  const active =
    outputExists &&
    ledgerVerdict !== "rejected" &&
    !/\/(?:rejected|trash|_legacy)\//i.test(normalizePath(outputPath));
  const media = probeMedia(outputPath);
  const flags = collectFlags({
    prompt,
    settings,
    refs,
    shotId,
    active,
    generationTool: generation.tool,
    media,
  });
  return {
    source: "manifest",
    file: normalizePath(filePath),
    output: normalizePath(output),
    output_exists: outputExists,
    media,
    shot_id: shotId,
    task_id: doc.task_id || generation.task_id || null,
    ledger_verdict: ledgerVerdict || null,
    prompt_source: prompt.source,
    prompt_length: prompt.text.length,
    prompt_sha256: prompt.text ? hashText(prompt.text) : null,
    settings,
    refs: refs.map(normalizePath),
    ...flags,
  };
}

function inferShotId(text) {
  const match = normalizePath(text).match(/(?:^|\/)(s\d{3})(?:[_\/-]|$)/i);
  return match ? match[1].toLowerCase() : null;
}

function readLedger(filePath) {
  const text = readText(filePath);
  if (!text) return [];
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function outputVerdictsFromLedger(entries) {
  const verdicts = new Map();
  for (const entry of entries) {
    const output = normalizePath(entry.asset?.output_path || "");
    if (!output) continue;
    verdicts.set(output, entry.review?.verdict || "needs_review");
  }
  return verdicts;
}

function auditLedgerEntry(entry) {
  if (entry.asset?.kind !== "video") return null;
  const generation = entry.generation || {};
  const reviewVerdict = entry.review?.verdict || "needs_review";
  const active = reviewVerdict !== "rejected";
  const prompt = promptFromGeneration(generation);
  const refs = asArray(generation.references).map((ref) => (typeof ref === "string" ? ref : ref?.path)).filter(Boolean);
  const settings = generation.settings || {};
  const outputPath = entry.asset?.output_path || "";
  const media = probeMedia(path.resolve(outputPath));
  const flags = collectFlags({
    prompt,
    settings,
    refs,
    shotId: entry.shot_id,
    active,
    generationTool: generation.tool,
    media,
  });
  return {
    source: "ledger",
    entry_id: entry.entry_id,
    output: normalizePath(outputPath),
    output_exists: outputPath ? fs.existsSync(path.resolve(outputPath)) : false,
    media,
    title: entry.title,
    shot_id: entry.shot_id,
    review_verdict: reviewVerdict,
    task_id: generation.task_id || null,
    prompt_source: prompt.source,
    prompt_length: prompt.text.length,
    prompt_sha256: prompt.text ? hashText(prompt.text) : null,
    settings,
    refs: refs.map(normalizePath),
    ...flags,
  };
}

function toMarkdown(report) {
  const lines = [];
  lines.push("---");
  lines.push("description: Bluespace video submit audit report.");
  lines.push(`updated: ${report.generated_at}`);
  lines.push("---");
  lines.push("");
  lines.push("# Video Submit Audit");
  lines.push("");
  lines.push(`- Blockers: ${report.summary.blockers}`);
  lines.push(`- Warnings: ${report.summary.warnings}`);
  lines.push(`- OK: ${report.summary.ok}`);
  lines.push("");
  lines.push("## Blockers");
  lines.push("");
  appendTable(lines, report.items.filter((item) => item.severity === "blocker"));
  lines.push("");
  lines.push("## Warnings");
  lines.push("");
  appendTable(lines, report.items.filter((item) => item.severity === "warning"));
  lines.push("");
  lines.push("## OK");
  lines.push("");
  appendTable(lines, report.items.filter((item) => item.severity === "ok").slice(0, 50));
  return `${lines.join("\n")}\n`;
}

function appendTable(lines, items) {
  if (!items.length) {
    lines.push("No items.");
    return;
  }
  lines.push("| Severity | Source | Shot | ID / Task | Prompt | Flags | Output |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const item of items) {
    const id = item.entry_id || item.task_id || "";
    const prompt = item.prompt_length ? `${item.prompt_length} chars` : item.prompt_source;
    lines.push(
      `| ${item.severity} | ${item.source} | ${item.shot_id || ""} | ${escapeCell(id)} | ${escapeCell(prompt)} | ${escapeCell(item.flags.join(", "))} | ${escapeCell(item.output || item.file || "")} |`
    );
  }
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|");
}

function dedupeItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.source}:${item.entry_id || item.file || item.output}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ledgerEntries = readLedger(opts.ledger);
  const outputVerdicts = outputVerdictsFromLedger(ledgerEntries);
  const manifestFiles = walk(opts.root).filter((file) => /\.manifest\.json$|\.imagine-video-async\.json$/i.test(file));
  const manifestItems = manifestFiles.map((file) => auditManifest(file, outputVerdicts)).filter(Boolean);
  const ledgerItems = ledgerEntries.map(auditLedgerEntry).filter(Boolean);
  const items = dedupeItems([...ledgerItems, ...manifestItems]).sort((a, b) => {
    const rank = { blocker: 0, warning: 1, ok: 2 };
    return rank[a.severity] - rank[b.severity] || String(a.shot_id || "").localeCompare(String(b.shot_id || ""));
  });
  const report = {
    generated_at: new Date().toISOString(),
    root: normalizePath(opts.root),
    ledger: normalizePath(opts.ledger),
    summary: {
      total: items.length,
      blockers: items.filter((item) => item.severity === "blocker").length,
      warnings: items.filter((item) => item.severity === "warning").length,
      ok: items.filter((item) => item.severity === "ok").length,
    },
    items,
  };
  writeJson(opts.json, report);
  writeText(opts.md, toMarkdown(report));
  console.log(`video-submit-audit: ${report.summary.blockers} blocker(s), ${report.summary.warnings} warning(s), ${report.summary.ok} ok`);
  console.log(`json: ${opts.json}`);
  console.log(`md: ${opts.md}`);
  if (opts["fail-on-blocker"] && report.summary.blockers) process.exitCode = 1;
}

main();
