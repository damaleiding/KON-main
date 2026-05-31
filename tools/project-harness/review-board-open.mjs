#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCENE = "blue_space_bridge_0421";
const DEFAULT_OUTPUT = `bluespace/outputs/${DEFAULT_SCENE}/_review/index.html`;

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
const outputPath = resolveMaybeProjectRelative(opts.output || DEFAULT_OUTPUT);
const boardArgs = buildReviewBoardArgs();
const board = spawnSync(process.execPath, [join(SCRIPT_DIR, "review-board.mjs"), ...boardArgs], {
  cwd: projectRoot,
  encoding: "utf8",
  windowsHide: true,
});

if (board.stdout) process.stdout.write(board.stdout);
if (board.stderr) process.stderr.write(board.stderr);
if (board.status !== 0) process.exit(board.status || 1);

if (!existsSync(outputPath)) {
  console.error(`review-board-open: output was not generated: ${outputPath}`);
  process.exit(1);
}

const url = `${pathToFileURL(outputPath).href}?cache_bust=${Date.now()}`;
try {
  openUrl(url, opts.browser);
  console.log(`Opened Review Board in ${opts.browser}: ${url}`);
} catch (error) {
  console.error(`review-board-open: ${error.message}`);
  process.exit(1);
}

function buildReviewBoardArgs() {
  const args = [];
  if (opts.projectRoot) args.push("--project-root", opts.projectRoot);
  if (opts.ledger) args.push("--ledger", opts.ledger);
  if (opts.decisionLog) args.push("--decision-log", opts.decisionLog);
  if (opts.output) args.push("--output", opts.output);
  if (opts.force) args.push("--force");
  return args;
}

function openUrl(url, browser) {
  if (process.platform === "win32") {
    if (browser === "chrome") {
      const chrome = findWindowsChrome();
      if (!chrome) {
        throw new Error("Google Chrome was not found. Install Chrome or rerun with --browser default.");
      }
      spawnDetached(chrome, [url]);
      return;
    }
    spawnDetached("cmd.exe", ["/d", "/s", "/c", "start", '""', url]);
    return;
  }

  if (process.platform === "darwin") {
    if (browser === "chrome") {
      const check = spawnSync("open", ["-Ra", "Google Chrome"], {
        stdio: "ignore",
        windowsHide: true,
      });
      if (check.status !== 0) {
        throw new Error("Google Chrome was not found. Install Chrome or rerun with --browser default.");
      }
      spawnDetached("open", ["-a", "Google Chrome", url]);
      return;
    }
    spawnDetached("open", [url]);
    return;
  }

  if (browser === "chrome") {
    const chrome = findOnPath(["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]);
    if (!chrome) {
      throw new Error("Google Chrome or Chromium was not found. Install Chrome/Chromium or rerun with --browser default.");
    }
    spawnDetached(chrome, [url]);
    return;
  }
  spawnDetached("xdg-open", [url]);
}

function spawnDetached(command, args) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function findWindowsChrome() {
  const candidates = [
    process.env.ProgramFiles ? join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe") : null,
    process.env["ProgramFiles(x86)"]
      ? join(process.env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : null,
    findOnPath(["chrome.exe", "chrome"]),
  ].filter(Boolean);
  return candidates.find((item) => existsSync(item)) || null;
}

function findOnPath(names) {
  const dirs = (process.env.PATH || "").split(delimiter).filter(Boolean);
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
      : [""];
  for (const dir of dirs) {
    for (const name of names) {
      const nameHasExt = /\.[^\\/]+$/.test(name);
      const candidates = process.platform === "win32" && !nameHasExt ? extensions.map((ext) => `${name}${ext}`) : [name];
      for (const candidate of candidates) {
        const fullPath = join(dir, candidate);
        if (existsSync(fullPath)) return fullPath;
      }
    }
  }
  return null;
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
  if (/^[A-Za-z]:[\\/]/.test(pathText) || pathText.startsWith("/")) return resolve(pathText);
  return resolve(projectRoot, pathText);
}

function parseArgs(args) {
  const parsed = {
    help: false,
    browser: "chrome",
    projectRoot: null,
    ledger: null,
    decisionLog: null,
    output: null,
    force: false,
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
    else if (key === "--browser") parsed.browser = readValue();
    else if (key === "--project-root") parsed.projectRoot = readValue();
    else if (key === "--ledger") parsed.ledger = readValue();
    else if (key === "--decision-log") parsed.decisionLog = readValue();
    else if (key === "--output") parsed.output = readValue();
    else if (arg === "--force") parsed.force = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!["chrome", "default"].includes(parsed.browser)) {
    throw new Error("--browser must be chrome or default.");
  }
  return parsed;
}

function printHelp() {
  process.stdout.write(`Open Review Board

Usage:
  node tools/project-harness/review-board-open.mjs [options]
  tools/project-harness/review-board-open.ps1 [options]
  tools/project-harness/review-board-open.sh [options]

Options:
  --browser <chrome|default>  Defaults to chrome.
  --project-root <path>       Defaults to the nearest trae_projects root.
  --ledger <path>             Passed to review-board.
  --decision-log <path>       Passed to review-board.
  --output <path>             Defaults to bluespace/outputs/blue_space_bridge_0421/_review/index.html.
  --force                     Force refresh before opening.
  -h, --help                  Show this help.
`);
}
