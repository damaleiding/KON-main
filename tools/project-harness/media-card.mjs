#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_LEDGER = "bluespace/outputs/blue_space_bridge_0421/_ledger/production-ledger.jsonl";

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
  const assets = opts.fromLedger ? await assetsFromLedger() : assetsFromPaths();
  if (assets.length === 0) {
    console.log("没有找到可展示的媒体资产。");
    process.exit(0);
  }
  console.log(renderMediaCards(assets.slice(0, opts.limit)));
} catch (error) {
  console.error(`media-card: ${error.message}`);
  process.exit(1);
}

async function assetsFromLedger() {
  const ledgerPath = resolveMaybeProjectRelative(opts.ledger || DEFAULT_LEDGER);
  const text = await readFile(ledgerPath, "utf8");
  const entries = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      entries.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`Invalid ledger JSON on line ${index + 1}: ${error.message}`);
    }
  });

  return entries
    .filter((entry) => {
      if (!entry.asset?.output_path) return false;
      if (opts.review !== "all" && entry.review?.verdict !== opts.review) return false;
      if (opts.shotId && entry.shot_id !== opts.shotId) return false;
      if (opts.model && entry.asset?.model !== opts.model) return false;
      return true;
    })
    .map((entry) => {
      const absPath = resolveMaybeProjectRelative(entry.asset.output_path);
      return {
        title: entry.title || basename(absPath),
        path: absPath,
        relativePath: normalizeSlashes(relative(projectRoot, absPath)),
        kind: entry.asset.kind || inferKind(absPath),
        model: entry.asset.model || null,
        review: entry.review?.verdict || null,
        note: firstNote(entry),
      };
    });
}

function assetsFromPaths() {
  return opts.paths.map((pathText) => {
    const absPath = resolveMaybeProjectRelative(pathText);
    return {
      title: opts.title || basename(absPath),
      path: absPath,
      relativePath: normalizeSlashes(relative(projectRoot, absPath)),
      kind: inferKind(absPath),
      model: null,
      review: null,
      note: opts.note || null,
    };
  });
}

function renderMediaCards(assets) {
  const lines = [];
  if (opts.heading) {
    lines.push(`**${opts.heading}**`);
  }

  assets.forEach((asset, index) => {
    if (lines.length > 0) lines.push("");
    const title = assets.length === 1 ? asset.title : `${index + 1}. ${asset.title}`;
    const exists = existsSync(asset.path);
    const absolutePath = normalizeSlashes(asset.path);
    const target = markdownTarget(absolutePath);
    const alt = escapeAlt(asset.title);

    lines.push(`**${title}**`);
    if (exists && isPreviewable(asset.path) && !opts.noPreview) {
      lines.push(`![${alt}](${target})`);
    }

    const chips = [
      asset.kind,
      asset.model,
      asset.review,
      exists ? null : "missing",
    ].filter(Boolean);
    const chipText = chips.length ? ` · ${chips.map((chip) => `\`${chip}\``).join(" · ")}` : "";
    lines.push(`[打开文件](${target})${chipText}`);

    if (asset.note && !opts.compact) {
      lines.push(`说明：${asset.note}`);
    }
  });

  if (!opts.compact) {
    lines.push("");
    lines.push("规则：以后图片/视频结果统一按这个格式给你，避免只丢裸路径。");
  }

  return `${lines.join("\n")}\n`;
}

function firstNote(entry) {
  const notes = entry.review?.notes || [];
  if (notes.length > 0) return notes[0];
  return entry.generation?.prompt_summary || null;
}

function inferKind(pathText) {
  const ext = extname(pathText).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return "image";
  if ([".mp4", ".mov", ".webm", ".avi"].includes(ext)) return "video";
  return "asset";
}

function isPreviewable(pathText) {
  const ext = extname(pathText).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".mov", ".webm"].includes(ext);
}

function markdownTarget(pathText) {
  return `<${pathText.replace(/>/g, "%3E")}>`;
}

function escapeAlt(text) {
  return String(text).replace(/\]/g, "\\]");
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

function parseArgs(args) {
  const parsed = {
    help: false,
    projectRoot: null,
    ledger: null,
    paths: [],
    fromLedger: false,
    review: "selected",
    shotId: null,
    model: null,
    limit: 6,
    title: null,
    note: null,
    heading: "媒体 Review",
    noPreview: false,
    compact: false,
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
    else if (arg === "--from-ledger") parsed.fromLedger = true;
    else if (key === "--review") parsed.review = readValue();
    else if (key === "--shot-id") parsed.shotId = readValue();
    else if (key === "--model") parsed.model = readValue();
    else if (key === "--limit") parsed.limit = Number.parseInt(readValue(), 10);
    else if (key === "--path") parsed.paths.push(readValue());
    else if (key === "--title") parsed.title = readValue();
    else if (key === "--note") parsed.note = readValue();
    else if (key === "--heading") parsed.heading = readValue();
    else if (arg === "--no-preview") parsed.noPreview = true;
    else if (arg === "--compact") parsed.compact = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!parsed.fromLedger && parsed.paths.length === 0) {
    parsed.fromLedger = true;
  }
  if (!Number.isFinite(parsed.limit) || parsed.limit < 1) {
    throw new Error("--limit must be a positive integer");
  }
  return parsed;
}

function printHelp() {
  process.stdout.write(`Media review card generator

Usage:
  node tools/project-harness/media-card.mjs [options]
  tools/project-harness/media-card.ps1 [options]
  tools/project-harness/media-card.sh [options]

Default:
  Reads the production ledger and renders selected media cards.

Options:
  --from-ledger             Read assets from production-ledger.jsonl.
  --ledger <path>           Ledger path. Defaults to current bridge ledger.
  --review <verdict|all>    selected, needs_review, rejected, all. Default selected.
  --shot-id <id>            Filter by shot id, for example s270.
  --model <name>            Filter by model, for example sd2.
  --limit <n>               Max cards. Default 6.
  --path <path>             Render a specific media path. Can be repeated.
  --title <text>            Title for --path mode.
  --note <text>             Note for --path mode.
  --heading <text>          Heading text. Default 媒体 Review.
  --no-preview              Only render clickable file links.
  --compact                 Omit notes and footer rule.
`);
}
