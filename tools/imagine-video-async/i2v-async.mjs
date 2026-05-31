#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = "imagine-video-async.video-submit.v2";
const MIN_PRODUCTION_PROMPT_CHARS = 400;
const ACTIONS = new Set(["run", "submit", "status", "fetch", "doctor", "help"]);
const MULTI_VALUE_KEYS = new Set(["ref-image", "ref-video", "ref-audio", "shot"]);
const SINGLE_VALUE_KEYS = new Set([
  "duration",
  "execute-uuid",
  "first-frame",
  "last-event-id",
  "last-frame",
  "manifest",
  "model",
  "output",
  "poll-seconds",
  "prompt",
  "prompt-file",
  "ratio",
  "resolution",
  "server",
  "submit-args-file",
  "task-id",
  "timeout-minutes",
]);
const BOOLEAN_KEYS = new Set([
  "allow-short-prompt",
  "allow-media-mismatch",
  "allow-unsafe-submit-defaults",
  "generate-audio",
  "no-generate-audio",
  "no-fetch",
  "overwrite",
  "skip-if-exists",
  "stream",
  "json",
  "force-submit",
  "help",
]);

function printHelp() {
  console.log(`Usage:
  video-async.ps1 submit --output <mp4> --manifest <manifest.json> <official imagine video submit args>
  video-async.ps1 run --output <mp4> --manifest <manifest.json> <official imagine video submit args>
  video-async.ps1 submit --output <mp4> --manifest <manifest.json> --submit-args-file <args.json>
  video-async.ps1 status --manifest <manifest.json> [--stream]
  video-async.ps1 fetch --manifest <manifest.json> [--overwrite]
  video-async.ps1 doctor

Actions:
  run      Submit if needed, poll status, then fetch. Re-runs resume from manifest.
  submit   Submit only and persist task_id. Recommended for batch work.
  status   Query task status using --manifest or --task-id.
  fetch    Fetch a finished task using --manifest or --task-id + --output.
  doctor   Print current imagine version/help availability without submitting tasks.

Recommended passthrough mode:
  Pass official "imagine video submit" args directly, or use --submit-args-file
  for exact future-proof forwarding. This wrapper only records task_id, manifest,
  status/fetch history, and output path.

  video-async.ps1 submit --output out.mp4 --manifest job.json --model sd2 --prompt "camera slowly pushes in" --first-frame start.png --resolution 1080p --duration 5 --ratio 16:9 --no-generate-audio

Compatibility shorthand options:
  --prompt <text>              Prompt text.
  --prompt-file <path>         UTF-8 prompt file. Mutually exclusive with --prompt.
  --submit-args-file <json>    JSON array of official "video submit" args.
  --ref-image <path>           Reference images. Repeat or pass multiple.
  --first-frame <path>         First frame image.
  --last-frame <path>          Optional end frame.
  --output <path>              Target mp4 path.
  --manifest <path>            Manifest path. Default: <output>.imagine-video-async.json
  --resolution <480p|720p|1080p>  Default: 1080p
  --duration <4-15|-1>         Default: 5
  --ratio <ratio>              Default: 16:9
  --generate-audio             Let sd2 generate audio. Default is no audio.
  --allow-short-prompt         Bypass the production prompt length guard.
  --allow-media-mismatch       Do not fail after fetch if actual media differs.
  --allow-unsafe-submit-defaults
                               Permit passthrough submit args that omit production pins.
  --ref-video <path>           Optional reference video. Repeat or pass multiple.
  --ref-audio <path>           Optional reference audio. Repeat or pass multiple.

Async/recovery options:
  --poll-seconds <n>           Default: 20
  --timeout-minutes <n>        Default: 20
  --task-id <id>               Use without manifest for status/fetch.
  --execute-uuid <hex>         Optional caller id. Server may not dedupe retries.
  --server <url>               Pass through to imagine.
  --force-submit               Submit a new task even if manifest already has task_id.
`);
}

function parseArgv(argv) {
  let action = "run";
  let args = [...argv];
  if (args[0] && !args[0].startsWith("-") && ACTIONS.has(args[0])) {
    action = args.shift();
  }

  const separatorIndex = args.indexOf("--");
  const passthrough = separatorIndex === -1 ? [] : args.slice(separatorIndex + 1);
  args = separatorIndex === -1 ? args : args.slice(0, separatorIndex);

  const opts = {};
  for (let i = 0; i < args.length; i += 1) {
    const raw = args[i];
    if (raw === "-h") {
      opts.help = true;
      continue;
    }
    if (!raw.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${raw}`);
    }
    const eq = raw.indexOf("=");
    const key = raw.slice(2, eq === -1 ? undefined : eq);
    if (BOOLEAN_KEYS.has(key)) {
      opts[key] = eq === -1 ? true : parseBoolean(raw.slice(eq + 1));
      continue;
    }

    if (MULTI_VALUE_KEYS.has(key)) {
      const values = [];
      if (eq !== -1) {
        values.push(raw.slice(eq + 1));
      } else {
        i += 1;
        if (i >= args.length || args[i].startsWith("--")) {
          throw new Error(`Missing value for --${key}`);
        }
        values.push(args[i]);
      }
      if (!opts[key]) opts[key] = [];
      opts[key].push(...values);
      while (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        i += 1;
        opts[key].push(args[i]);
      }
      continue;
    }

    if (SINGLE_VALUE_KEYS.has(key)) {
      let value;
      if (eq !== -1) {
        value = raw.slice(eq + 1);
      } else {
        i += 1;
        if (i >= args.length || args[i].startsWith("--")) {
          throw new Error(`Missing value for --${key}`);
        }
        value = args[i];
      }
      opts[key] = value;
      continue;
    }

    const values = [];
    if (eq !== -1) {
      values.push(raw.slice(eq + 1));
    } else {
      while (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        i += 1;
        values.push(args[i]);
      }
    }
    opts.__extraArgs ||= [];
    opts.__extraArgs.push(`--${key}`, ...values);
    opts[key] = values.length === 0 ? true : values.length === 1 ? values[0] : values;
  }

  opts.__passthrough = passthrough;
  opts.__extraArgs ||= [];
  return { action, opts };
}

function parseBoolean(value) {
  const normalized = String(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function now() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDirFor(filePath) {
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function readSubmitArgsFile(filePath) {
  const parsed = readJson(filePath);
  const args = Array.isArray(parsed) ? parsed : parsed.args;
  if (!Array.isArray(args) || !args.every((arg) => typeof arg === "string")) {
    throw new Error(`--submit-args-file must contain a JSON string array, or {"args":[...]}`);
  }
  return args;
}

function getRawSubmitArgs(opts, { includeExtra = true } = {}) {
  const args = [];
  if (opts["submit-args-file"]) args.push(...readSubmitArgsFile(opts["submit-args-file"]));
  args.push(...(opts.__passthrough || []));
  if (includeExtra) args.push(...(opts.__extraArgs || []));
  return args;
}

function writeJson(filePath, data) {
  ensureDirFor(filePath);
  fs.writeFileSync(`${filePath}.tmp`, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(`${filePath}.tmp`, filePath);
}

function defaultManifestPath(output) {
  if (!output) return null;
  return `${output}.imagine-video-async.json`;
}

function requireOption(opts, key) {
  const value = opts[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required option: --${key}`);
  }
  return value;
}

function readPrompt(opts) {
  const passthroughPrompt = getFlagValue(getRawSubmitArgs(opts), "--prompt");
  if (passthroughPrompt && opts["prompt-file"] === undefined && opts.prompt === undefined) {
    return { prompt: passthroughPrompt, promptFile: null };
  }

  const hasPrompt = opts.prompt !== undefined;
  const hasPromptFile = opts["prompt-file"] !== undefined;
  if (hasPrompt && hasPromptFile) {
    throw new Error("--prompt and --prompt-file are mutually exclusive.");
  }
  if (!hasPrompt && !hasPromptFile) {
    throw new Error("Missing required option: --prompt or --prompt-file");
  }
  if (hasPromptFile) {
    return {
      prompt: fs.readFileSync(opts["prompt-file"], "utf8").trim(),
      promptFile: opts["prompt-file"],
    };
  }
  return { prompt: String(opts.prompt).trim(), promptFile: null };
}

function hashText(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function validatePromptForSubmit(promptInfo, opts) {
  const prompt = promptInfo.prompt || "";
  if (!prompt) {
    throw new Error("Prompt is empty after trimming.");
  }
  if (opts["allow-short-prompt"]) return;
  if (prompt.length < MIN_PRODUCTION_PROMPT_CHARS) {
    throw new Error(
      `Prompt is only ${prompt.length} chars; production video prompts must be at least ${MIN_PRODUCTION_PROMPT_CHARS} chars. ` +
        "Use --prompt-file with shot-specific visual anchors, motion limits, and negatives, or pass --allow-short-prompt for a deliberate quick test."
    );
  }
}

function assertReadable(inputPath, label) {
  if (!inputPath) return;
  if (!fs.existsSync(path.resolve(inputPath))) {
    throw new Error(`${label} does not exist: ${inputPath}`);
  }
}

function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function quoteArg(arg) {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(arg)) return arg;
  return `"${String(arg).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function formatCommand(args) {
  return ["imagine", ...args].map((arg) => quoteArg(String(arg))).join(" ");
}

function getPathEnv() {
  const key = Object.keys(process.env).find((name) => name.toLowerCase() === "path");
  return key ? process.env[key] : "";
}

function resolveExecutable(name) {
  if (process.env.IMAGINE_BIN) return process.env.IMAGINE_BIN;
  if (name.includes("/") || name.includes("\\")) return name;

  const searchDirs = getPathEnv().split(path.delimiter).filter(Boolean);
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .filter(Boolean)
          .concat([""])
      : [""];

  for (const dir of searchDirs) {
    for (const ext of extensions) {
      const candidate = path.join(dir, `${name}${ext.toLowerCase()}`);
      if (fs.existsSync(candidate)) return candidate;
      const upperCandidate = path.join(dir, `${name}${ext.toUpperCase()}`);
      if (fs.existsSync(upperCandidate)) return upperCandidate;
    }
  }
  return name;
}

function directNodeImagineInvocation(command, args) {
  if (process.platform !== "win32") return null;
  const base = path.basename(command).toLowerCase();
  if (!/^imagine(?:\.(cmd|bat|ps1|exe))?$/.test(base)) return null;

  const basedir = path.dirname(command);
  const cliJs = path.join(basedir, "node_modules", "@bytedance-dev", "imagine-cli", "dist", "bin", "imagine.js");
  if (!fs.existsSync(cliJs)) return null;

  const bundledNode = path.join(basedir, "node.exe");
  return {
    command: fs.existsSync(bundledNode) ? bundledNode : "node.exe",
    args: [cliJs, ...args],
    transport: "direct-node-imagine-cli",
  };
}

function isImagineCommandShim(command) {
  if (process.platform !== "win32") return false;
  const base = path.basename(command).toLowerCase();
  return /^imagine\.(cmd|bat)$/.test(base);
}

function buildSpawnInvocation(command, args) {
  const directImagine = directNodeImagineInvocation(command, args);
  if (directImagine) return directImagine;
  if (isImagineCommandShim(command)) {
    throw new Error(
      "Refusing to run Imagine CLI through the Windows cmd.exe shim because multiline --prompt can be truncated. " +
        "Use a CLI install with node_modules/@bytedance-dev/imagine-cli/dist/bin/imagine.js reachable next to imagine.cmd, or use the direct JS/API JSON path."
    );
  }
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", command, ...args], transport: "cmd-shim" };
  }
  return { command, args, transport: "direct-exec" };
}

function truncate(text, max = 4000) {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
}

function probeMedia(filePath) {
  if (!fs.existsSync(filePath)) return null;
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
    {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8,
    }
  );
  if ((result.status ?? 1) !== 0) {
    return { error: truncate(result.stderr || result.stdout || (result.error ? String(result.error) : "ffprobe failed"), 1000) };
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return { error: truncate(`ffprobe returned invalid JSON: ${result.stdout || result.stderr}`, 1000) };
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

function validateFetchedMedia(manifest, output, opts) {
  const media = probeMedia(output);
  if (manifest) manifest.media_probe = media;
  if (opts["allow-media-mismatch"]) return [];

  const settings = manifest?.generation?.settings || {};
  const issues = [];
  if (!media) {
    issues.push("fetched output is missing");
    return issues;
  }
  if (media.error) {
    issues.push(`ffprobe failed: ${media.error}`);
    return issues;
  }
  if (/1080p/i.test(String(settings.resolution || "")) && Number(media.height || 0) < 1080) {
    issues.push(`requested 1080p but fetched ${media.width}x${media.height}`);
  }
  if (String(settings.ratio || "") === "16:9" && media.width && media.height && !matchesRatio(media.width, media.height, 16 / 9)) {
    issues.push(`requested 16:9 but fetched ${media.width}x${media.height}`);
  }
  if (settings.generate_audio === false && media.has_audio) {
    issues.push("requested no audio but fetched media contains an audio stream");
  }
  const requestedDuration = Number(settings.duration);
  const actualDuration = Number(media.duration);
  if (Number.isFinite(requestedDuration) && requestedDuration > 0 && Number.isFinite(actualDuration) && actualDuration > requestedDuration + 0.75) {
    issues.push(`requested ${requestedDuration}s but fetched ${actualDuration.toFixed(2)}s`);
  }
  return issues;
}

function matchesRatio(width, height, expectedRatio) {
  const actual = Number(width) / Number(height);
  return Number.isFinite(actual) && Math.abs(actual - expectedRatio) < 0.02;
}

function parseJsonLine(stdout) {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line);
    } catch {
      // Keep scanning; progress output should not be fatal if another JSON line follows.
    }
  }
  throw new Error(`Could not parse JSON from stdout:\n${stdout}`);
}

function runImagine(args, stage, manifest) {
  const executable = resolveExecutable("imagine");
  const spawnSpec = buildSpawnInvocation(executable, args);
  const result = spawnSync(spawnSpec.command, spawnSpec.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 32,
  });

  if (manifest) {
    manifest.history ||= [];
    manifest.history.push({
      at: now(),
      stage,
      command: formatCommand(args),
      imagine_path: executable,
      transport: spawnSpec.transport,
      exit_code: result.status,
      signal: result.signal,
      stdout: truncate(result.stdout),
      stderr: truncate(result.stderr || (result.error ? String(result.error) : "")),
    });
    manifest.updated_at = now();
  }

  if ((result.status ?? 1) !== 0) {
    const err = new Error(`imagine ${stage} failed with exit code ${result.status ?? 1}`);
    err.result = result;
    throw err;
  }
  return result;
}

function runImagineOptional(args) {
  try {
    const executable = resolveExecutable("imagine");
    const spawnSpec = buildSpawnInvocation(executable, args);
    const result = spawnSync(spawnSpec.command, spawnSpec.args, {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8,
    });
    return {
      ok: (result.status ?? 1) === 0,
      exit_code: result.status ?? 1,
      stdout: result.stdout || "",
      stderr: result.stderr || (result.error ? String(result.error) : ""),
      imagine_path: executable,
      transport: spawnSpec.transport,
    };
  } catch (err) {
    return { ok: false, exit_code: 1, stdout: "", stderr: String(err) };
  }
}

function hasFlag(args, flag) {
  return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

function getFlagValue(args, flag) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === flag) return args[i + 1] || null;
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  }
  return null;
}

function getAllFlagValues(args, flag) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === flag) {
      while (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        i += 1;
        values.push(args[i]);
      }
    } else if (arg.startsWith(`${flag}=`)) {
      values.push(arg.slice(flag.length + 1));
    }
  }
  return values;
}

function removeFlagWithSingleValue(args, flag) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === flag) {
      i += 1;
      continue;
    }
    if (arg.startsWith(`${flag}=`)) continue;
    out.push(arg);
  }
  return out;
}

function pushIfMissing(args, flag, value) {
  if (value === undefined || value === null || value === "" || hasFlag(args, flag)) return;
  args.push(flag, String(value));
}

function validateProductionSubmitPins(args, opts) {
  if (opts["allow-unsafe-submit-defaults"]) return;

  const missing = [];
  if (!getFlagValue(args, "--model")) missing.push("--model");
  if (!getFlagValue(args, "--resolution")) missing.push("--resolution");
  if (!getFlagValue(args, "--duration")) missing.push("--duration");
  if (!getFlagValue(args, "--ratio")) missing.push("--ratio");
  if (!hasFlag(args, "--no-generate-audio") && opts["generate-audio"] !== true) {
    missing.push("--no-generate-audio or --generate-audio");
  }

  if (missing.length) {
    throw new Error(
      `Unsafe video submit args: missing ${missing.join(", ")}. ` +
        "Production sd2 submits must pin model, resolution, duration, ratio, and audio behavior. " +
        "Add the explicit flags, or pass --allow-unsafe-submit-defaults for a deliberate diagnostics-only test."
    );
  }
}

function normalizeSubmitPassthrough(rawArgs, opts, promptInfo) {
  let args = [...rawArgs];
  if (args[0] === "imagine") args = args.slice(1);
  if (args[0] === "video" && args[1] === "submit") args = args.slice(2);
  if (args[0] === "submit") args = args.slice(1);

  const passthroughOutput = getFlagValue(args, "--output");
  if (!opts.output && passthroughOutput) opts.output = passthroughOutput;
  if (passthroughOutput) args = removeFlagWithSingleValue(args, "--output");

  if (!hasFlag(args, "--prompt") && promptInfo?.prompt) args.push("--prompt", promptInfo.prompt);
  pushIfMissing(args, "--model", opts.model);
  pushIfMissing(args, "--resolution", opts.resolution);
  pushIfMissing(args, "--duration", opts.duration);
  pushIfMissing(args, "--ratio", opts.ratio);
  if (!hasFlag(args, "--no-generate-audio") && opts["no-generate-audio"]) args.push("--no-generate-audio");
  if (!hasFlag(args, "--execute-uuid") && opts["execute-uuid"]) args.push("--execute-uuid", opts["execute-uuid"]);
  if (!hasFlag(args, "--server") && opts.server) args.push("--server", opts.server);
  const submitArgs = ["video", "submit", ...args];
  validateProductionSubmitPins(submitArgs, opts);
  return submitArgs;
}

function buildSubmitArgs(opts, promptInfo) {
  const explicitRawSubmitArgs = getRawSubmitArgs(opts, { includeExtra: false });
  const rawSubmitArgs = getRawSubmitArgs(opts);
  if (explicitRawSubmitArgs.length) {
    return normalizeSubmitPassthrough(rawSubmitArgs, opts, promptInfo);
  }

  const prompt = promptInfo?.prompt ?? readPrompt(opts).prompt;
  const model = opts.model || "sd2";

  if (opts["first-frame"]) assertReadable(opts["first-frame"], "--first-frame");
  if (opts["last-frame"]) assertReadable(opts["last-frame"], "--last-frame");
  for (const ref of asArray(opts["ref-image"])) assertReadable(ref, "--ref-image");
  for (const ref of asArray(opts["ref-video"])) assertReadable(ref, "--ref-video");
  for (const ref of asArray(opts["ref-audio"])) assertReadable(ref, "--ref-audio");

  const args = [
    "video",
    "submit",
    "--model",
    model,
    "--prompt",
    prompt,
    "--resolution",
    opts.resolution || "1080p",
    "--duration",
    String(opts.duration || "5"),
    "--ratio",
    opts.ratio || "16:9",
  ];

  for (const ref of asArray(opts["ref-image"])) args.push("--ref-image", ref);
  if (opts["first-frame"]) args.push("--first-frame", opts["first-frame"]);
  if (opts["last-frame"]) args.push("--last-frame", opts["last-frame"]);
  for (const ref of asArray(opts["ref-video"])) args.push("--ref-video", ref);
  for (const ref of asArray(opts["ref-audio"])) args.push("--ref-audio", ref);
  if (!opts["generate-audio"]) args.push("--no-generate-audio");
  if (opts["execute-uuid"]) args.push("--execute-uuid", opts["execute-uuid"]);
  if (opts.server) args.push("--server", opts.server);
  args.push(...(opts.__extraArgs || []));
  validateProductionSubmitPins(args, opts);
  return args;
}

function buildStatusArgs(taskId, opts) {
  const args = ["task", "status", taskId];
  if (opts.stream) args.push("--stream");
  if (opts["last-event-id"]) args.push("--last-event-id", opts["last-event-id"]);
  if (opts.server) args.push("--server", opts.server);
  return args;
}

function buildFetchArgs(taskId, output, opts) {
  const args = ["task", "fetch", taskId, "--output", output];
  if (opts.overwrite) args.push("--overwrite");
  if (!opts.overwrite && opts["skip-if-exists"] !== false) args.push("--skip-if-exists");
  if (opts.server) args.push("--server", opts.server);
  return args;
}

function makeManifest(opts, promptInfo, manifestPath) {
  const output = requireOption(opts, "output");
  const executeUuid = opts["execute-uuid"] || randomBytes(16).toString("hex");
  opts["execute-uuid"] = executeUuid;
  const submitArgs = buildSubmitArgs(opts, promptInfo);
  const taskId = opts["task-id"] || null;
  const model = getFlagValue(submitArgs, "--model") || opts.model || "sd2";
  const versionResult = runImagineOptional(["--version"]);

  return {
    schema: SCHEMA,
    created_at: now(),
    updated_at: now(),
    state: taskId ? "submitted" : "draft",
    manifest: manifestPath,
    output,
    task_id: taskId,
    execute_uuid: executeUuid,
    imagine: {
      path: resolveExecutable("imagine"),
      version: versionResult.ok ? versionResult.stdout.trim() : null,
      transport: versionResult.transport || null,
      version_error: versionResult.ok ? null : truncate(versionResult.stderr, 1000),
    },
    generation: {
      model,
      prompt: promptInfo.prompt,
      prompt_file: promptInfo.promptFile,
      prompt_length: promptInfo.prompt.length,
      prompt_sha256: hashText(promptInfo.prompt),
      task_id: taskId,
      execute_uuid: executeUuid,
      references: {
        first_frame: getFlagValue(submitArgs, "--first-frame") || null,
        last_frame: getFlagValue(submitArgs, "--last-frame") || null,
        ref_image: getAllFlagValues(submitArgs, "--ref-image"),
        ref_video: getAllFlagValues(submitArgs, "--ref-video"),
        ref_audio: getAllFlagValues(submitArgs, "--ref-audio"),
      },
      raw_submit_args: getRawSubmitArgs(opts),
      settings: {
        resolution: getFlagValue(submitArgs, "--resolution") || null,
        duration: getFlagValue(submitArgs, "--duration") || null,
        ratio: getFlagValue(submitArgs, "--ratio") || null,
        generate_audio: !hasFlag(submitArgs, "--no-generate-audio"),
      },
      submit_command: formatCommand(submitArgs),
      fetch_command: taskId ? formatCommand(buildFetchArgs(taskId, output, opts)) : null,
    },
    history: [],
  };
}

function resolveManifest(opts) {
  const manifestPath = opts.manifest || defaultManifestPath(opts.output);
  if (!manifestPath) {
    throw new Error("Missing --manifest, or --output from which a manifest path can be derived.");
  }
  return manifestPath;
}

function loadOrCreateManifestForSubmit(opts) {
  if (!opts.output) {
    const passthroughOutput = getFlagValue(getRawSubmitArgs(opts), "--output");
    if (passthroughOutput) opts.output = passthroughOutput;
  }
  const manifestPath = resolveManifest(opts);
  if (fs.existsSync(manifestPath) && !opts["force-submit"]) {
    const existing = readJson(manifestPath);
    if (existing.task_id) return { manifest: existing, manifestPath, reused: true };
  }

  const promptInfo = readPrompt(opts);
  validatePromptForSubmit(promptInfo, opts);
  const manifest = makeManifest(opts, promptInfo, manifestPath);
  writeJson(manifestPath, manifest);
  return { manifest, manifestPath, reused: false };
}

function taskIdFrom(opts, manifest) {
  const taskId = opts["task-id"] || manifest?.task_id;
  if (!taskId) throw new Error("Missing task id. Pass --task-id or use --manifest.");
  return taskId;
}

function outputFrom(opts, manifest) {
  const output = opts.output || manifest?.output;
  if (!output) throw new Error("Missing output path. Pass --output or use --manifest.");
  return output;
}

function updateStateFromStatus(manifest, statusJson) {
  const status = statusJson.status || statusJson.data?.status;
  if (!status) return;
  manifest.remote_status = statusJson;
  if (status === "success") manifest.state = "success";
  if (status === "error") {
    manifest.state = "failed";
    manifest.error = statusJson.message || statusJson.data?.message || "Task status is error.";
  }
}

async function submit(opts) {
  const { manifest, manifestPath, reused } = loadOrCreateManifestForSubmit(opts);
  if (reused) {
    return { manifest, manifestPath, submitted: false };
  }

  manifest.state = "submitting";
  writeJson(manifestPath, manifest);
  const submitArgs = buildSubmitArgs(opts, {
    prompt: manifest.generation.prompt,
    promptFile: manifest.generation.prompt_file,
  });
  const result = runImagine(submitArgs, "submit", manifest);
  const json = parseJsonLine(result.stdout);

  manifest.state = "submitted";
  manifest.task_id = json.task_id;
  manifest.execute_uuid = json.execute_uuid || manifest.execute_uuid;
  manifest.submitted_at = json.submitted_at || now();
  manifest.generation.task_id = manifest.task_id;
  manifest.generation.execute_uuid = manifest.execute_uuid;
  manifest.generation.fetch_command = formatCommand(buildFetchArgs(manifest.task_id, manifest.output, opts));
  manifest.submit_result = json;
  manifest.updated_at = now();
  writeJson(manifestPath, manifest);
  return { manifest, manifestPath, submitted: true };
}

async function status(opts, manifestPath = null, manifest = null) {
  if (!manifest && manifestPath && fs.existsSync(manifestPath)) manifest = readJson(manifestPath);
  const taskId = taskIdFrom(opts, manifest);
  const result = runImagine(buildStatusArgs(taskId, opts), "status", manifest);

  if (opts.stream) {
    if (manifest && manifestPath) writeJson(manifestPath, manifest);
    process.stdout.write(result.stdout);
    return { manifest, statusJson: null };
  }

  const statusJson = parseJsonLine(result.stdout);
  if (manifest) {
    updateStateFromStatus(manifest, statusJson);
    manifest.updated_at = now();
    if (manifestPath) writeJson(manifestPath, manifest);
  }
  return { manifest, statusJson };
}

async function fetchResult(opts, manifestPath = null, manifest = null) {
  if (!manifest && manifestPath && fs.existsSync(manifestPath)) manifest = readJson(manifestPath);
  const taskId = taskIdFrom(opts, manifest);
  const output = outputFrom(opts, manifest);
  ensureDirFor(output);

  try {
    const result = runImagine(buildFetchArgs(taskId, output, opts), "fetch", manifest);
    const fetchJson = parseJsonLine(result.stdout);
    if (manifest) {
      const mediaIssues = validateFetchedMedia(manifest, output, opts);
      manifest.state = "fetched";
      manifest.fetched_at = fetchJson.downloaded_at || now();
      manifest.fetch_result = fetchJson;
      manifest.media_issues = mediaIssues;
      if (mediaIssues.length) {
        manifest.state = "fetched_with_mismatch";
        manifest.error = `Fetched media failed validation: ${mediaIssues.join("; ")}`;
      }
      manifest.updated_at = now();
      if (manifestPath) writeJson(manifestPath, manifest);
      if (mediaIssues.length) {
        throw new Error(manifest.error);
      }
    }
    return { manifest, fetchJson };
  } catch (err) {
    if (manifest) {
      if (manifest.state !== "fetched_with_mismatch") {
        manifest.state = "fetch_failed";
        manifest.error = truncate(err.result?.stderr || err.message, 2000);
      }
      manifest.updated_at = now();
      if (manifestPath) writeJson(manifestPath, manifest);
    }
    throw err;
  }
}

async function run(opts) {
  const { manifest, manifestPath, submitted } = await submit(opts);
  if (opts["no-fetch"]) {
    return { manifest, manifestPath, submitted, fetched: false };
  }

  const pollSeconds = Number(opts["poll-seconds"] || 20);
  const timeoutMinutes = Number(opts["timeout-minutes"] || 20);
  const deadline = Date.now() + timeoutMinutes * 60 * 1000;

  while (Date.now() < deadline) {
    const { statusJson } = await status(opts, manifestPath, manifest);
    const remoteStatus = statusJson?.status || statusJson?.data?.status;
    if (remoteStatus === "success") {
      const { fetchJson } = await fetchResult(opts, manifestPath, manifest);
      return { manifest, manifestPath, submitted, fetched: true, fetch: fetchJson };
    }
    if (remoteStatus === "error") {
      throw new Error(`Task failed: ${statusJson.message || JSON.stringify(statusJson)}`);
    }
    await sleep(pollSeconds * 1000);
  }

  manifest.state = "submitted";
  manifest.error = `Timed out after ${timeoutMinutes} minutes; rerun with --manifest ${manifestPath}`;
  manifest.updated_at = now();
  writeJson(manifestPath, manifest);
  return { manifest, manifestPath, submitted, fetched: false, timed_out: true };
}

async function doctor() {
  const checks = [
    { name: "version", args: ["--version"] },
    { name: "video_submit_help", args: ["video", "submit", "--help"] },
    { name: "task_status_help", args: ["task", "status", "--help"] },
    { name: "task_fetch_help", args: ["task", "fetch", "--help"] },
    { name: "video_kling_v3_help", args: ["video", "kling-v3", "--help"] },
  ];
  const results = {};
  for (const check of checks) {
    const result = runImagineOptional(check.args);
    results[check.name] = {
      ok: result.ok,
      exit_code: result.exit_code,
      transport: result.transport || null,
      stdout: truncate(result.stdout, 6000),
      stderr: truncate(result.stderr, 2000),
    };
  }

  return {
    manifest: null,
    doctor: {
      imagine_path: resolveExecutable("imagine"),
      results,
      async_available:
        Boolean(results.video_submit_help?.ok) &&
        Boolean(results.task_status_help?.ok) &&
        Boolean(results.task_fetch_help?.ok),
      checked_at: now(),
    },
  };
}

async function main() {
  const { action, opts } = parseArgv(process.argv.slice(2));
  if (action === "help" || opts.help) {
    printHelp();
    return;
  }

  let result;
  if (action === "submit") {
    result = await submit(opts);
  } else if (action === "status") {
    const manifestPath = opts.manifest || null;
    result = await status(opts, manifestPath, manifestPath && fs.existsSync(manifestPath) ? readJson(manifestPath) : null);
  } else if (action === "fetch") {
    const manifestPath = opts.manifest || null;
    result = await fetchResult(opts, manifestPath, manifestPath && fs.existsSync(manifestPath) ? readJson(manifestPath) : null);
  } else if (action === "run") {
    result = await run(opts);
  } else if (action === "doctor") {
    result = await doctor();
  } else {
    throw new Error(`Unknown action: ${action}`);
  }

  if (!opts.stream) {
    const payload = {
      ok: true,
      action,
      manifest: result.manifestPath || opts.manifest || null,
      state: result.manifest?.state || null,
      task_id: result.manifest?.task_id || opts["task-id"] || null,
      output: result.manifest?.output || opts.output || null,
      submitted: result.submitted ?? null,
      fetched: result.fetched ?? null,
      timed_out: result.timed_out ?? null,
    };
    if (result.doctor) payload.doctor = result.doctor;
    console.log(JSON.stringify(payload));
  }
}

main().catch((err) => {
  const payload = {
    ok: false,
    error: err.message,
    exit_code: err.result?.status ?? 1,
    stderr: truncate(err.result?.stderr || (err.result?.error ? String(err.result.error) : ""), 2000),
  };
  console.error(JSON.stringify(payload));
  process.exit(err.result?.status ?? 1);
});
