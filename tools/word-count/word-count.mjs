#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const DEFAULT_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".text",
  ".html",
  ".htm",
  ".xml",
  ".json",
  ".jsonl",
  ".csv",
]);

const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  "out",
  ".cache",
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

try {
  const result = await run(opts);
  printResult(result, opts);
} catch (error) {
  console.error(`word-count failed: ${error.message}`);
  process.exit(1);
}

async function run(options) {
  const inputs = [];

  if (options.text !== null) {
    inputs.push({
      source: "<text>",
      text: options.text,
    });
  }

  if (options.stdin) {
    inputs.push({
      source: "<stdin>",
      text: await readStdin(),
    });
  }

  for (const pathText of options.paths) {
    for (const filePath of expandPath(pathText, options)) {
      inputs.push({
        source: filePath,
        text: readFileSync(filePath, options.encoding),
      });
    }
  }

  if (!inputs.length) {
    throw new Error("No input. Provide file paths, --text, or --stdin.");
  }

  const files = inputs.map((input) => ({
    source: input.source,
    ...countText(input.text, options.mode),
  }));

  return {
    ok: true,
    mode: options.mode,
    definition: definitionForMode(options.mode),
    files,
    total: sumCounts(files, options.mode),
  };
}

function parseArgs(args) {
  const parsed = {
    help: false,
    json: false,
    details: false,
    stdin: false,
    text: null,
    mode: "nonspace",
    encoding: "utf8",
    extensions: new Set(DEFAULT_EXTENSIONS),
    allFiles: false,
    includeHidden: false,
    paths: [],
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--details") parsed.details = true;
    else if (arg === "--stdin") parsed.stdin = true;
    else if (arg === "--all-files") parsed.allFiles = true;
    else if (arg === "--include-hidden") parsed.includeHidden = true;
    else if (arg === "--text") parsed.text = requireValue(args, ++i, arg);
    else if (arg === "--mode") parsed.mode = parseMode(requireValue(args, ++i, arg));
    else if (arg === "--encoding") parsed.encoding = requireValue(args, ++i, arg);
    else if (arg === "--ext") parsed.extensions = parseExtensions(requireValue(args, ++i, arg));
    else if (arg.startsWith("--")) throw new Error(`Unknown argument: ${arg}`);
    else parsed.paths.push(arg);
  }

  return parsed;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseMode(value) {
  const allowed = new Set(["nonspace", "cjk", "visible"]);
  if (!allowed.has(value)) {
    throw new Error("--mode must be one of: nonspace, cjk, visible.");
  }
  return value;
}

function parseExtensions(value) {
  const extensions = new Set();
  for (const raw of value.split(",")) {
    const item = raw.trim().toLowerCase();
    if (!item) continue;
    extensions.add(item.startsWith(".") ? item : `.${item}`);
  }
  if (!extensions.size) throw new Error("--ext must include at least one extension.");
  return extensions;
}

function expandPath(pathText, options) {
  const absPath = resolve(pathText);
  if (!existsSync(absPath)) throw new Error(`Path does not exist: ${pathText}`);

  const stats = statSync(absPath);
  if (stats.isFile()) return [absPath];
  if (!stats.isDirectory()) return [];

  const files = [];
  walkDirectory(absPath, files, options);
  return files;
}

function walkDirectory(dirPath, files, options) {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (!options.includeHidden && entry.name.startsWith(".")) continue;
    const childPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkDirectory(childPath, files, options);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!options.allFiles && !options.extensions.has(extname(entry.name).toLowerCase())) continue;
    files.push(childPath);
  }
}

function countText(text, mode) {
  const chars = Array.from(text);
  const nonspace = chars.filter((char) => !/\s/u.test(char)).length;
  const visible = chars.filter((char) => !/[\r\n\t]/u.test(char)).length;
  const cjk = chars.filter((char) => /\p{Script=Han}/u.test(char)).length;
  const punctuation = chars.filter((char) => /\p{P}/u.test(char)).length;
  const latinWords = text.match(/[\p{Script=Latin}\p{Number}]+(?:['-][\p{Script=Latin}\p{Number}]+)*/gu) || [];
  const numbers = text.match(/\p{Number}+/gu) || [];

  return {
    primary_count: primaryCountForMode(mode, { nonspace, cjk, visible }),
    nonspace_count: nonspace,
    cjk_count: cjk,
    visible_count: visible,
    latin_word_count: latinWords.length,
    number_count: numbers.length,
    punctuation_count: punctuation,
    line_count: text.length ? text.split(/\r\n|\r|\n/u).length : 0,
    paragraph_count: countParagraphs(text),
  };
}

function primaryCountForMode(mode, counts) {
  if (mode === "cjk") return counts.cjk;
  if (mode === "visible") return counts.visible;
  return counts.nonspace;
}

function countParagraphs(text) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return 0;
  return normalized.split(/\n\s*\n/u).filter((part) => part.trim()).length;
}

function sumCounts(files, mode) {
  const total = {
    source: "<total>",
    primary_count: 0,
    nonspace_count: 0,
    cjk_count: 0,
    visible_count: 0,
    latin_word_count: 0,
    number_count: 0,
    punctuation_count: 0,
    line_count: 0,
    paragraph_count: 0,
  };

  for (const file of files) {
    for (const key of Object.keys(total)) {
      if (key === "source") continue;
      total[key] += file[key] || 0;
    }
  }

  total.primary_count = primaryCountForMode(mode, total);
  return total;
}

function definitionForMode(mode) {
  if (mode === "cjk") return "Primary count is Han/CJK ideographs only.";
  if (mode === "visible") return "Primary count excludes line breaks and tabs, but keeps spaces.";
  return "Primary count is Unicode characters excluding whitespace.";
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function printResult(result, options) {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const total = result.total;
  console.log(`Word Count: ${total.primary_count} (${result.mode})`);
  console.log(`Definition: ${result.definition}`);
  console.log(
    `Breakdown: nonspace ${total.nonspace_count} | CJK ${total.cjk_count} | Latin words ${total.latin_word_count} | numbers ${total.number_count} | punctuation ${total.punctuation_count}`,
  );
  console.log(`Structure: files ${result.files.length} | lines ${total.line_count} | paragraphs ${total.paragraph_count}`);

  if (options.details && result.files.length > 1) {
    console.log("");
    for (const file of result.files) {
      console.log(`${file.primary_count}\t${file.source}`);
    }
  }
}

function printHelp() {
  console.log(`Usage: word-count [options] <file-or-directory...>

Count text with deterministic rules. Use this tool instead of model-estimated counts.

Primary modes:
  nonspace    Unicode characters excluding whitespace. Default, recommended for Chinese drafts.
  cjk         Han/CJK ideographs only.
  visible     Excludes line breaks and tabs, keeps spaces.

Options:
  --text <text>          Count an inline text string.
  --stdin                Read text from stdin.
  --mode <mode>          Count mode: nonspace, cjk, visible. Default: nonspace.
  --json                 Print machine-readable JSON.
  --details              Print per-file counts when multiple files are read.
  --ext <list>           Directory extension allowlist. Default: md,markdown,txt,text,html,htm,xml,json,jsonl,csv.
  --all-files            Include all files when reading directories.
  --include-hidden       Include hidden files and directories.
  --encoding <encoding>  File encoding for Node.js readFileSync. Default: utf8.
  -h, --help             Show this help.

Examples:
  .\\tools\\word-count\\word-count.ps1 .\\projects\\novel\\outputs\\chapter01.md
  .\\tools\\word-count\\word-count.ps1 --mode cjk --json .\\projects\\novel\\outputs
  "第一章开始。" | .\\tools\\word-count\\word-count.ps1 --stdin
`);
}
