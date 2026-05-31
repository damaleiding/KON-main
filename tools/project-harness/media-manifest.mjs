#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST = "bluespace/_media/media-manifest.json";
const DEFAULT_MISSING_OUTPUT = "bluespace/_media/missing-media.json";
const MEDIA_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".tga",
  ".mp4",
  ".mov",
  ".avi",
  ".264",
  ".264_med",
  ".usm",
  ".psd",
  ".7z",
]);
const DEFAULT_ROOTS = [
  "bluespace/refs",
  "bluespace/outputs",
  "bluespace/edit",
  "bluespace/trash",
  "t3-art/concepts/current",
  "t3-art/research/unity-render/refs",
  "t3-art/research/unity-render/outputs",
  "tools",
];
const IGNORE_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  "__pycache__",
  ".stfolder",
]);

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
  if (opts.command === "scan") {
    const manifest = await scanMedia();
    const outputPath = resolveProjectPath(opts.output || DEFAULT_MANIFEST);
    if (opts.json || opts.dryRun) console.log(JSON.stringify(manifest, null, 2));
    if (!opts.dryRun) {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    }
    if (!opts.json && !opts.dryRun) {
      console.log(`Wrote ${toProjectRel(outputPath)}`);
      console.log(formatSummary(manifest.summary));
    }
  } else if (opts.command === "check" || opts.command === "missing") {
    const manifestPath = resolveProjectPath(opts.manifest || DEFAULT_MANIFEST);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const report = await checkManifest(manifest);
    if (opts.command === "missing") {
      const outputPath = resolveProjectPath(opts.output || DEFAULT_MISSING_OUTPUT);
      if (!opts.dryRun) {
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      }
      if (!opts.json && !opts.dryRun) console.log(`Wrote ${toProjectRel(outputPath)}`);
    }
    if (opts.json || opts.command === "missing") console.log(JSON.stringify(report, null, 2));
    else console.log(formatReport(report, opts.limit));
    if (!opts.warnOnly && report.summary.not_ok > 0) process.exit(1);
  } else {
    throw new Error(`Unknown command: ${opts.command}`);
  }
} catch (error) {
  console.error(`media-manifest: ${error.message}`);
  process.exit(1);
}

async function scanMedia() {
  const roots = opts.roots.length ? opts.roots : DEFAULT_ROOTS;
  const entries = [];
  for (const root of roots) {
    const absRoot = resolveProjectPath(root);
    if (!existsSync(absRoot)) continue;
    await walk(absRoot, async (filePath, fileStat) => {
      const rel = toProjectRel(filePath);
      const ext = extname(filePath).toLowerCase();
      if (!MEDIA_EXTENSIONS.has(ext)) return;
      const hash = opts.hash ? await sha256File(filePath) : null;
      entries.push({
        media_id: buildMediaId(rel),
        project: inferProject(rel),
        path: rel,
        sha256: hash,
        bytes: fileStat.size,
        mtime: fileStat.mtime.toISOString(),
        ext,
        role: inferRole(rel),
        status: inferStatus(rel),
        sync_group: inferSyncGroup(rel),
        source: "scan",
      });
    });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return {
    kind: "media_manifest",
    schema_version: 1,
    generated_at: new Date().toISOString(),
    project_root_marker: "AGENTS.md",
    policy: "Git syncs rules/code/logs/manifests; media files sync out-of-band.",
    hash_algorithm: opts.hash ? "sha256" : null,
    entries,
    summary: summarizeEntries(entries),
  };
}

async function checkManifest(manifest) {
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const missing = [];
  const sizeMismatch = [];
  const hashMismatch = [];
  const ok = [];
  for (const entry of entries) {
    const filePath = resolveProjectPath(entry.path);
    if (!existsSync(filePath)) {
      missing.push(compactIssue(entry, "missing", null));
      continue;
    }
    const fileStat = await stat(filePath);
    if (Number.isFinite(entry.bytes) && fileStat.size !== entry.bytes) {
      sizeMismatch.push(compactIssue(entry, "size_mismatch", { actual_bytes: fileStat.size }));
      continue;
    }
    if (opts.verifyHash && entry.sha256) {
      const actual = await sha256File(filePath);
      if (actual !== entry.sha256) {
        hashMismatch.push(compactIssue(entry, "hash_mismatch", { actual_sha256: actual }));
        continue;
      }
    }
    ok.push(entry);
  }
  const issues = [...missing, ...sizeMismatch, ...hashMismatch];
  const missingBytes = missing.reduce((sum, item) => sum + (item.bytes || 0), 0);
  const byGroup = summarizeIssuesByGroup(issues);
  return {
    kind: "media_manifest_check",
    schema_version: 1,
    generated_at: new Date().toISOString(),
    manifest_entries: entries.length,
    summary: {
      ok: ok.length,
      missing: missing.length,
      size_mismatch: sizeMismatch.length,
      hash_mismatch: hashMismatch.length,
      not_ok: issues.length,
      missing_bytes: missingBytes,
      missing_gib: round(missingBytes / 1024 / 1024 / 1024, 3),
      by_sync_group: byGroup,
    },
    missing,
    size_mismatch: sizeMismatch,
    hash_mismatch: hashMismatch,
  };
}

async function walk(dir, onFile) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".gitkeep") {
      if (IGNORE_DIR_NAMES.has(entry.name)) continue;
    }
    const pathText = join(dir, entry.name);
    const rel = toProjectRel(pathText);
    if (entry.isDirectory()) {
      if (shouldIgnoreDir(rel, entry.name)) continue;
      await walk(pathText, onFile);
    } else if (entry.isFile()) {
      const fileStat = await stat(pathText);
      await onFile(pathText, fileStat);
    }
  }
}

function shouldIgnoreDir(rel, name) {
  if (IGNORE_DIR_NAMES.has(name)) return true;
  const normalized = normalizeSlashes(rel);
  if (normalized.includes("/_review/") || normalized.endsWith("/_review")) return true;
  if (normalized.includes("/node_modules/")) return true;
  return false;
}

function summarizeEntries(entries) {
  const bytes = entries.reduce((sum, entry) => sum + (entry.bytes || 0), 0);
  const byGroup = {};
  for (const entry of entries) {
    const key = entry.sync_group || "unknown";
    if (!byGroup[key]) byGroup[key] = { count: 0, bytes: 0, gib: 0 };
    byGroup[key].count += 1;
    byGroup[key].bytes += entry.bytes || 0;
  }
  for (const item of Object.values(byGroup)) item.gib = round(item.bytes / 1024 / 1024 / 1024, 3);
  return {
    count: entries.length,
    bytes,
    gib: round(bytes / 1024 / 1024 / 1024, 3),
    by_sync_group: byGroup,
  };
}

function summarizeIssuesByGroup(issues) {
  const byGroup = {};
  for (const issue of issues) {
    const key = issue.sync_group || "unknown";
    if (!byGroup[key]) byGroup[key] = { count: 0, bytes: 0, gib: 0 };
    byGroup[key].count += 1;
    byGroup[key].bytes += issue.bytes || 0;
  }
  for (const item of Object.values(byGroup)) item.gib = round(item.bytes / 1024 / 1024 / 1024, 3);
  return byGroup;
}

function compactIssue(entry, reason, extra) {
  return {
    reason,
    media_id: entry.media_id || buildMediaId(entry.path),
    path: entry.path,
    bytes: entry.bytes || null,
    sync_group: entry.sync_group || inferSyncGroup(entry.path || ""),
    role: entry.role || inferRole(entry.path || ""),
    sha256: entry.sha256 || null,
    ...(extra || {}),
  };
}

function formatSummary(summary) {
  const lines = [];
  lines.push(`Media entries: ${summary.count}`);
  lines.push(`Media size: ${summary.gib} GiB`);
  for (const [group, item] of Object.entries(summary.by_sync_group || {})) {
    lines.push(`- ${group}: ${item.count} files, ${item.gib} GiB`);
  }
  return lines.join("\n");
}

function formatReport(report, limit) {
  const s = report.summary;
  const lines = [];
  lines.push(`Media manifest check: ${s.not_ok === 0 ? "OK" : "NEEDS SYNC"}`);
  lines.push(`- OK: ${s.ok}/${report.manifest_entries}`);
  lines.push(`- Missing: ${s.missing} (${s.missing_gib} GiB)`);
  lines.push(`- Size mismatch: ${s.size_mismatch}`);
  lines.push(`- Hash mismatch: ${s.hash_mismatch}`);
  if (Object.keys(s.by_sync_group || {}).length) {
    lines.push("- By sync group:");
    for (const [group, item] of Object.entries(s.by_sync_group)) {
      lines.push(`  - ${group}: ${item.count} files, ${item.gib} GiB`);
    }
  }
  const issues = [...report.missing, ...report.size_mismatch, ...report.hash_mismatch].slice(0, limit);
  if (issues.length) {
    lines.push(`- First ${issues.length} issues:`);
    for (const item of issues) lines.push(`  - ${item.reason} | ${item.sync_group} | ${item.path}`);
  }
  return lines.join("\n");
}

function sha256File(pathText) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(pathText);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });
}

function buildMediaId(pathText) {
  return `media:${normalizeSlashes(pathText).replace(/[^A-Za-z0-9._/-]+/g, "_")}`;
}

function inferProject(pathText) {
  const rel = normalizeSlashes(pathText);
  if (rel.startsWith("bluespace/")) return "bluespace";
  if (rel.startsWith("t3-art/")) return "t3-art";
  if (rel.startsWith("tools/")) return "tools";
  return "workspace";
}

function inferSyncGroup(pathText) {
  const rel = normalizeSlashes(pathText);
  if (rel.startsWith("bluespace/outputs/")) return "bluespace-outputs";
  if (rel.startsWith("bluespace/refs/")) return "bluespace-refs";
  if (rel.startsWith("bluespace/edit/")) return "bluespace-edit";
  if (rel.startsWith("bluespace/trash/")) return "bluespace-trash";
  if (rel.startsWith("t3-art/concepts/current/")) return "t3-art-concepts-current";
  if (rel.startsWith("t3-art/research/unity-render/")) return "t3-art-unity-render-media";
  if (rel.startsWith("tools/")) return "tools-media";
  return "workspace-media";
}

function inferRole(pathText) {
  const rel = normalizeSlashes(pathText);
  const name = basename(rel).toLowerCase();
  if (rel.includes("/refs/")) return "reference";
  if (rel.startsWith("t3-art/concepts/current/")) return "concept";
  if (rel.includes("/trash/")) return "trash";
  if (rel.includes("/edit/")) return "edit_source";
  if (rel.includes("/review/")) return "review_candidate";
  if (rel.startsWith("tools/")) return "tool_test_media";
  if (name.includes("selected")) return "selected";
  if (rel.includes("/outputs/")) return "production_output";
  return "media";
}

function inferStatus(pathText) {
  const rel = normalizeSlashes(pathText).toLowerCase();
  if (rel.includes("/trash/")) return "trash";
  if (rel.includes("/_legacy/")) return "legacy";
  if (rel.includes("/review/")) return "review";
  if (rel.includes("/selected/") || basename(rel).includes("selected")) return "selected";
  return "active";
}

function parseArgs(args) {
  const parsed = {
    command: "check",
    help: false,
    projectRoot: null,
    output: null,
    manifest: null,
    roots: [],
    hash: false,
    verifyHash: false,
    dryRun: false,
    json: false,
    warnOnly: false,
    limit: 20,
  };
  if (args[0] && !args[0].startsWith("-")) parsed.command = args.shift();
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
    else if (key === "--output") parsed.output = readValue();
    else if (key === "--manifest") parsed.manifest = readValue();
    else if (key === "--root") parsed.roots.push(readValue());
    else if (arg === "--hash") parsed.hash = true;
    else if (arg === "--no-hash") parsed.hash = false;
    else if (arg === "--verify-hash") parsed.verifyHash = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--warn-only") parsed.warnOnly = true;
    else if (key === "--limit") parsed.limit = Number.parseInt(readValue(), 10);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!["scan", "check", "missing"].includes(parsed.command)) throw new Error(`Unknown command: ${parsed.command}`);
  if (!Number.isFinite(parsed.limit) || parsed.limit < 1) throw new Error("--limit must be a positive integer");
  return parsed;
}

function findProjectRoot(startDir) {
  let current = resolve(startDir);
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(current, "AGENTS.md")) && existsSync(join(current, "bluespace"))) return current;
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
  return resolve(SCRIPT_DIR, "..", "..");
}

function resolveProjectPath(pathText) {
  if (!pathText) return null;
  if (/^[A-Za-z]:[\\/]/.test(pathText) || pathText.startsWith("/")) return resolve(pathText);
  return resolve(projectRoot, pathText);
}

function toProjectRel(pathText) {
  const rel = normalizeSlashes(relative(projectRoot, pathText));
  return rel && !rel.startsWith("..") ? rel : normalizeSlashes(pathText);
}

function normalizeSlashes(pathText) {
  return pathText ? String(pathText).replace(/\\/g, "/") : "";
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function printHelp() {
  process.stdout.write(`Media manifest utility

Usage:
  node tools/project-harness/media-manifest.mjs scan [options]
  node tools/project-harness/media-manifest.mjs check [options]
  node tools/project-harness/media-manifest.mjs missing [options]

Commands:
  scan      Scan media files and write a manifest.
  check     Check local media completeness against the manifest.
  missing   Write a missing-media report for manual pull/sync.

Options:
  --project-root <path>  Defaults to nearest trae_projects root.
  --manifest <path>      Defaults to bluespace/_media/media-manifest.json.
  --output <path>        Output for scan/missing.
  --root <path>          Additional scan root. Repeatable. Defaults to known media roots.
  --hash                 Compute sha256 during scan.
  --verify-hash          Verify sha256 during check.
  --warn-only            Do not exit non-zero when media is missing.
  --limit <n>            Issue rows to print. Default 20.
  --json                 Print JSON.
  --dry-run              Print without writing.
  -h, --help             Show this help.
`);
}
