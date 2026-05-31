#!/usr/bin/env node

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATE_PATH = join(SCRIPT_DIR, "token-meter.local.json");
const DEFAULT_TAIL_BYTES = 1024 * 1024;
const MAX_TAIL_BYTES = 8 * 1024 * 1024;

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
const statePath = resolveMaybeProjectRelative(opts.statePath || DEFAULT_STATE_PATH);
const sessionPath = resolveSessionPath(opts.session);
const latest = sessionPath ? readLatestTokenCount(sessionPath) : null;

if (!latest) {
  const result = {
    ok: false,
    reason: sessionPath ? "no_token_count_found" : "no_session_found",
    session_path: sessionPath,
  };
  printResult(result);
  process.exit(opts.optional ? 0 : 1);
}

const previous = !opts.reset && !opts.noState ? readState(statePath) : null;
const sameSession = previous?.session_path && normalizePath(previous.session_path) === normalizePath(sessionPath);
const delta = sameSession ? diffUsage(latest.total_token_usage, previous.total_token_usage) : null;
const context = buildContext(latest);
const result = {
  ok: true,
  mode: opts.noState ? "stateless" : opts.reset || !sameSession ? "baseline" : "delta",
  note: "本轮统计截至 token 计数事件；当前最终回复本身可能要到下一轮才完全计入。",
  session_path: sessionPath,
  token_timestamp: latest.timestamp,
  delta,
  current_context: context,
  last_token_usage: latest.last_token_usage,
  total_token_usage: latest.total_token_usage,
};

if (!opts.noState) {
  writeState(statePath, {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    session_path: sessionPath,
    token_timestamp: latest.timestamp,
    total_token_usage: latest.total_token_usage,
  });
}

printResult(result);

function parseArgs(args) {
  const parsed = {
    help: false,
    json: false,
    reset: false,
    noState: false,
    optional: false,
    session: "latest",
    projectRoot: null,
    statePath: null,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--reset") parsed.reset = true;
    else if (arg === "--no-state") parsed.noState = true;
    else if (arg === "--optional") parsed.optional = true;
    else if (arg === "--session") parsed.session = requireValue(args, ++i, arg);
    else if (arg === "--project-root") parsed.projectRoot = requireValue(args, ++i, arg);
    else if (arg === "--state-path") parsed.statePath = requireValue(args, ++i, arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function printHelp() {
  console.log(`Usage: token-meter [options]

Read the latest Codex token_count event and print a one-line token status.
It reads only token accounting events from the local Codex session log.

Options:
  --session <latest|path>    Session jsonl to inspect. Default: latest.
  --reset                    Record the current token counter as a new baseline.
  --no-state                 Do not read or write the local baseline file.
  --state-path <path>        Baseline state path. Default: tools/project-harness/token-meter.local.json.
  --project-root <path>      Project root. Default: auto-detect.
  --json                     Print machine-readable output.
  --optional                 Return success when no session/token_count is found.
  -h, --help                 Show this help.

Typical use:
  .\\tools\\project-harness\\token-meter.ps1
  .\\tools\\project-harness\\token-meter.ps1 --reset
`);
}

function printResult(result) {
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!result.ok) {
    console.log(`Token: unavailable (${result.reason})`);
    return;
  }

  const current = result.current_context;
  const cacheText = Number.isFinite(current.cache_percent)
    ? `缓存 ${formatPercent(current.cache_percent)}`
    : "缓存 n/a";
  const levelText = current.level === "ok" ? "" : ` | ${contextAdvice(current.level)}`;
  const currentText = `当前 ${formatTokenCount(current.input_tokens)}/${formatTokenCount(current.window)} ${formatPercent(
    current.percent,
  )}`;

  if (result.mode === "stateless") {
    console.log(`Token: ${currentText} | ${cacheText}${levelText}`);
    return;
  }

  if (result.mode === "baseline" || !result.delta) {
    console.log(`Token: 已记录基线 | ${currentText} | ${cacheText}${levelText}`);
    return;
  }

  const delta = result.delta;
  const deltaText = `本轮约 +${formatTokenCount(delta.total_tokens)}（截至回复前）`;
  const outputText = `输出 +${formatTokenCount(delta.output_tokens)}`;
  console.log(`Token: ${deltaText} | ${currentText} | ${outputText} | ${cacheText}${levelText}`);
}

function contextAdvice(level) {
  if (level === "critical") return "上下文已接近满载，建议新开轻量会话";
  if (level === "warning") return "上下文偏高，建议减少大段读取";
  if (level === "notice") return "上下文进入观察区";
  return "";
}

function resolveSessionPath(sessionArg) {
  if (!sessionArg || sessionArg === "latest") return findLatestSession();
  const direct = resolveMaybeProjectRelative(sessionArg);
  return existsSync(direct) ? direct : null;
}

function findLatestSession() {
  const home = process.env.CODEX_HOME || join(process.env.USERPROFILE || process.env.HOME || "", ".codex");
  const sessionsRoot = join(home, "sessions");
  if (!existsSync(sessionsRoot)) return null;

  let latest = null;
  const stack = [sessionsRoot];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const pathText = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(pathText);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      let stats;
      try {
        stats = statSync(pathText);
      } catch {
        continue;
      }
      if (!latest || stats.mtimeMs > latest.mtimeMs) latest = { path: pathText, mtimeMs: stats.mtimeMs };
    }
  }
  return latest?.path || null;
}

function readLatestTokenCount(pathText) {
  let bytes = DEFAULT_TAIL_BYTES;
  const size = statSync(pathText).size;
  while (bytes <= MAX_TAIL_BYTES) {
    const tail = readTail(pathText, Math.min(bytes, size));
    const found = parseLatestTokenLine(tail);
    if (found) return found;
    if (bytes >= size) break;
    bytes *= 2;
  }
  return null;
}

function readTail(pathText, bytes) {
  const size = statSync(pathText).size;
  const length = Math.min(bytes, size);
  const start = Math.max(0, size - length);
  const buffer = Buffer.alloc(length);
  const fd = openSync(pathText, "r");
  try {
    readSync(fd, buffer, 0, length, start);
  } finally {
    closeSync(fd);
  }
  return buffer.toString("utf8");
}

function parseLatestTokenLine(text) {
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line || !line.includes('"token_count"')) continue;
    try {
      const event = JSON.parse(line);
      if (event?.type !== "event_msg" || event?.payload?.type !== "token_count") continue;
      const info = event.payload.info || {};
      return {
        timestamp: event.timestamp || null,
        total_token_usage: normalizeUsage(info.total_token_usage),
        last_token_usage: normalizeUsage(info.last_token_usage),
        model_context_window: Number(info.model_context_window) || null,
      };
    } catch {
      continue;
    }
  }
  return null;
}

function normalizeUsage(usage) {
  return {
    input_tokens: Number(usage?.input_tokens) || 0,
    cached_input_tokens: Number(usage?.cached_input_tokens) || 0,
    output_tokens: Number(usage?.output_tokens) || 0,
    reasoning_output_tokens: Number(usage?.reasoning_output_tokens) || 0,
    total_tokens: Number(usage?.total_tokens) || 0,
  };
}

function diffUsage(current, previous) {
  return {
    input_tokens: Math.max(0, current.input_tokens - Number(previous?.input_tokens || 0)),
    cached_input_tokens: Math.max(0, current.cached_input_tokens - Number(previous?.cached_input_tokens || 0)),
    output_tokens: Math.max(0, current.output_tokens - Number(previous?.output_tokens || 0)),
    reasoning_output_tokens: Math.max(0, current.reasoning_output_tokens - Number(previous?.reasoning_output_tokens || 0)),
    total_tokens: Math.max(0, current.total_tokens - Number(previous?.total_tokens || 0)),
  };
}

function buildContext(latest) {
  const input = latest.last_token_usage.input_tokens;
  const cached = latest.last_token_usage.cached_input_tokens;
  const windowSize = latest.model_context_window || 0;
  const percent = windowSize > 0 ? input / windowSize : NaN;
  const cachePercent = input > 0 ? cached / input : NaN;
  return {
    input_tokens: input,
    cached_input_tokens: cached,
    window: windowSize,
    percent,
    cache_percent: cachePercent,
    level: contextLevel(percent),
  };
}

function contextLevel(percent) {
  if (!Number.isFinite(percent)) return "unknown";
  if (percent >= 0.95) return "critical";
  if (percent >= 0.85) return "warning";
  if (percent >= 0.7) return "notice";
  return "ok";
}

function readState(pathText) {
  if (!existsSync(pathText)) return null;
  try {
    return JSON.parse(readFileSync(pathText, "utf8"));
  } catch {
    return null;
  }
}

function writeState(pathText, state) {
  mkdirSync(dirname(pathText), { recursive: true });
  writeFileSync(pathText, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function findProjectRoot(startDir) {
  let current = resolve(startDir);
  while (current && current !== dirname(current)) {
    if (existsSync(join(current, "AGENTS.md")) && existsSync(join(current, "bluespace"))) return current;
    current = dirname(current);
  }
  return process.cwd();
}

function resolveMaybeProjectRelative(pathText) {
  if (!pathText) return pathText;
  if (/^[A-Za-z]:[\\/]/.test(pathText) || pathText.startsWith("/") || pathText.startsWith("\\\\")) return pathText;
  return resolve(projectRoot || process.cwd(), pathText);
}

function normalizePath(pathText) {
  return resolve(pathText).toLowerCase();
}

function formatTokenCount(value) {
  const num = Number(value) || 0;
  if (num >= 1_000_000) return `${trimNumber(num / 1_000_000)}M`;
  if (num >= 1_000) return `${trimNumber(num / 1_000)}k`;
  return String(num);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "n/a";
  return `${Math.round(value * 100)}%`;
}

function trimNumber(value) {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}
