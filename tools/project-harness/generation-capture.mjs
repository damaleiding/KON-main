#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCENE = "blue_space_bridge_0421";
const DEFAULT_LEDGER = `bluespace/outputs/${DEFAULT_SCENE}/_ledger/production-ledger.jsonl`;

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
const sceneSlug = opts.sceneSlug || DEFAULT_SCENE;
const ledgerPath = resolveMaybeProjectRelative(opts.ledger || DEFAULT_LEDGER);

try {
  if (opts.command === "record") {
    await commandRecord();
  } else {
    throw new Error(`Unknown command: ${opts.command}`);
  }
} catch (error) {
  console.error(`generation-capture: ${error.message}`);
  process.exit(1);
}

async function commandRecord() {
  if (!opts.title) throw new Error("--title is required");
  if (!opts.output) throw new Error("--output is required");
  if (!opts.tool) throw new Error("--tool is required, for example gpt-image2 or imagine-cli");
  if (!opts.model) throw new Error("--model is required, for example image2, sd2, or kling-v3");

  const outputPath = resolveMaybeProjectRelative(opts.output);
  assertProjectPath(outputPath, "--output");
  if (!opts.allowMissingOutput && !existsSync(outputPath)) {
    throw new Error(`--output does not exist: ${toProjectRel(outputPath)}. Use --allow-missing-output only for submitted tasks that have not been fetched yet.`);
  }

  const outputRel = toProjectRel(outputPath);
  await assertNoDuplicateLedgerEntry(outputRel);

  const normalizedRefs = opts.refs.map(normalizeReferenceArg);
  const promptInfo = await preparePromptFile(outputPath, outputRel, normalizedRefs);
  const promptSummary = opts.promptSummary || summarizePrompt(opts.prompt);
  const mode = opts.mode || inferMode(outputPath);
  const assetKind = opts.assetKind || inferAssetKind(outputPath);

  if (!opts.allowIncompleteRecipe && !hasReusableRecipe(promptInfo, normalizedRefs)) {
    throw new Error("A reusable recipe is required. Add --prompt, --prompt-file, --command/--command-text, --ref, or --setting. Use --allow-incomplete-recipe only for exceptional historical repairs.");
  }

  const ledgerArgs = buildLedgerAddArgs({
    outputRel,
    promptFileRel: promptInfo.promptFileRel,
    promptInline: promptInfo.promptInline,
    promptSummary,
    refs: normalizedRefs,
    mode,
    assetKind,
  });

  const result = {
    output: outputRel,
    ledger: toProjectRel(ledgerPath),
    prompt_file: promptInfo.promptFileRel,
    dry_run: opts.dryRun,
    validate: !opts.noValidate,
    validate_strict: !opts.allowWarnings,
    review_board: !opts.noReviewBoard,
  };

  if (opts.dryRun) {
    printResult({
      ...result,
      planned_prompt_write: promptInfo.shouldWrite ? toProjectRel(promptInfo.promptFilePath) : null,
      planned_ledger_args: ledgerArgs,
    });
    return;
  }

  if (promptInfo.shouldWrite) {
    await writePromptRecipe(promptInfo.promptFilePath, {
      outputRel,
      refs: normalizedRefs,
      promptSummary,
      mode,
      assetKind,
    });
  }

  runNode("production-ledger add", join(projectRoot, "bluespace", "tools", "production-ledger", "ledger.mjs"), ledgerArgs);

  if (!opts.noValidate) {
    const validateArgs = ["validate", "--project-root", projectRoot, "--scene", sceneSlug, "--ledger", toProjectRel(ledgerPath)];
    if (!opts.allowWarnings) validateArgs.push("--strict");
    runNode("production-ledger validate", join(projectRoot, "bluespace", "tools", "production-ledger", "ledger.mjs"), validateArgs);
    runNode("production-ledger prompt-index", join(projectRoot, "bluespace", "tools", "production-ledger", "ledger.mjs"), [
      "prompt-index",
      "--project-root",
      projectRoot,
      "--scene",
      sceneSlug,
      "--ledger",
      toProjectRel(ledgerPath),
    ]);
  }

  if (!opts.noReviewBoard) {
    const boardArgs = ["--project-root", projectRoot, "--ledger", toProjectRel(ledgerPath), "--force"];
    runNode("review-board refresh", join(SCRIPT_DIR, "review-board.mjs"), boardArgs);
  }

  printResult(result);
}

function buildLedgerAddArgs({ outputRel, promptFileRel, promptInline, promptSummary, refs, mode, assetKind }) {
  const args = [
    "add",
    "--project-root",
    projectRoot,
    "--scene",
    sceneSlug,
    "--ledger",
    toProjectRel(ledgerPath),
    "--title",
    opts.title,
    "--output",
    outputRel,
    "--tool",
    opts.tool,
    "--model",
    opts.model,
    "--mode",
    mode,
    "--asset-kind",
    assetKind,
  ];

  pushOpt(args, "--shot-id", opts.shotId);
  pushOpt(args, "--legacy-id", opts.legacyId);
  pushOpt(args, "--task-id", opts.taskId);
  pushOpt(args, "--command-text", opts.commandText);
  pushOpt(args, "--prompt", promptInline);
  pushOpt(args, "--prompt-file", promptFileRel);
  pushOpt(args, "--negative-prompt", opts.negativePrompt);
  pushOpt(args, "--prompt-summary", promptSummary);
  pushOpt(args, "--seed", opts.seed);
  pushOpt(args, "--resolution", opts.resolution);
  pushOpt(args, "--aspect-ratio", opts.aspectRatio);
  pushOpt(args, "--duration-seconds", opts.durationSeconds);
  pushOpt(args, "--audio", opts.audio);
  pushOpt(args, "--version", opts.version);
  pushOpt(args, "--status", opts.status);
  pushOpt(args, "--review", opts.review);
  for (const [key, value] of Object.entries(opts.settings)) {
    args.push("--setting", `${key}=${formatSettingValue(value)}`);
  }
  for (const ref of refs) {
    args.push("--ref", `${ref.role}:${ref.path}`);
  }
  for (const note of opts.notes) {
    args.push("--note", note);
  }
  return args;
}

async function preparePromptFile(outputPath, outputRel, refs) {
  const promptFilePath = opts.promptFile ? resolveMaybeProjectRelative(opts.promptFile) : defaultPromptFile(outputPath);
  let promptFileRel = null;
  let promptInline = opts.inlinePrompt ? opts.prompt || null : null;
  let shouldWrite = false;

  if (opts.promptFile) {
    assertProjectPath(promptFilePath, "--prompt-file");
    promptFileRel = toProjectRel(promptFilePath);
    if (!opts.prompt && !existsSync(promptFilePath)) {
      throw new Error(`--prompt-file does not exist: ${promptFileRel}`);
    }
  }

  if (opts.prompt && !opts.inlinePrompt) {
    promptFileRel = toProjectRel(promptFilePath);
    if (existsSync(promptFilePath) && !opts.overwritePrompt) {
      const existing = await readFile(promptFilePath, "utf8");
      if (!existing.includes(opts.prompt)) {
        throw new Error(`Prompt file already exists and differs: ${promptFileRel}. Use --overwrite-prompt or choose another --prompt-file.`);
      }
    } else {
      shouldWrite = true;
    }
  }

  return {
    promptFilePath,
    promptFileRel,
    promptInline,
    shouldWrite,
    refs,
    outputRel,
  };
}

async function writePromptRecipe(promptFilePath, context) {
  await mkdir(dirname(promptFilePath), { recursive: true });
  const lines = [
    "---",
    `title: ${yamlScalar(opts.title)}`,
    `tool: ${yamlScalar(opts.tool)}`,
    `model: ${yamlScalar(opts.model)}`,
    `mode: ${yamlScalar(context.mode)}`,
    `asset_kind: ${yamlScalar(context.assetKind)}`,
    opts.taskId ? `task_id: ${yamlScalar(opts.taskId)}` : null,
    `output_path: ${yamlScalar(context.outputRel)}`,
    `created_at: ${new Date().toISOString()}`,
    "---",
    "",
    "# Prompt",
    "",
    opts.prompt || "",
    "",
  ].filter((line) => line !== null);

  if (opts.negativePrompt) {
    lines.push("# Negative Prompt", "", opts.negativePrompt, "");
  }
  if (context.promptSummary) {
    lines.push("# Summary", "", context.promptSummary, "");
  }
  if (Object.keys(opts.settings).length > 0) {
    lines.push("# Settings", "");
    for (const [key, value] of Object.entries(opts.settings)) {
      lines.push(`- ${key}: ${formatSettingValue(value)}`);
    }
    lines.push("");
  }
  if (context.refs.length > 0) {
    lines.push("# References", "");
    for (const ref of context.refs) {
      lines.push(`- ${ref.role}: ${ref.path}`);
    }
    lines.push("");
  }
  if (opts.commandText) {
    lines.push("# Command", "", "```bash", opts.commandText, "```", "");
  }

  await writeFile(promptFilePath, `${lines.join("\n").trimEnd()}\n`, "utf8");
}

function hasReusableRecipe(promptInfo, refs) {
  return Boolean(
    promptInfo.promptInline ||
      promptInfo.promptFileRel ||
      opts.commandText ||
      refs.length > 0 ||
      Object.keys(opts.settings).length > 0,
  );
}

async function assertNoDuplicateLedgerEntry(outputRel) {
  if (!existsSync(ledgerPath) || opts.allowDuplicate) return;
  const text = await readFile(ledgerPath, "utf8");
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (normalizeSlashes(entry.asset?.output_path || "") === normalizeSlashes(outputRel)) {
      throw new Error(`Output already exists in ledger at line ${index + 1}: ${outputRel}. Use --allow-duplicate only for deliberate variant bookkeeping.`);
    }
    if (opts.taskId && entry.generation?.task_id === opts.taskId) {
      throw new Error(`task_id already exists in ledger at line ${index + 1}: ${opts.taskId}. Use --allow-duplicate only for deliberate duplicate task bookkeeping.`);
    }
  }
}

function runNode(label, scriptPath, args) {
  const child = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.status !== 0) {
    throw new Error(`${label} exited with code ${child.status || 1}`);
  }
}

function normalizeReferenceArg(value) {
  const { role, path } = parseRolePath(value);
  if (isUrl(path)) return { role, path };
  const refPath = resolveMaybeProjectRelative(path);
  assertProjectPath(refPath, "--ref");
  return { role, path: toProjectRel(refPath) };
}

function parseRolePath(value) {
  if (isUrl(value)) return { role: "unspecified", path: value };
  if (/^[A-Za-z]:[\\/]/.test(value)) return { role: "unspecified", path: value };
  const [maybeRole, rest] = value.split(/:(.*)/s, 2);
  if (rest && /^[a-z][a-z0-9_-]*$/i.test(maybeRole)) {
    return { role: maybeRole, path: rest };
  }
  return { role: "unspecified", path: value };
}

function parseSettingArg(value) {
  const match = value.match(/^([^=]+)=(.*)$/s);
  if (!match) throw new Error(`--setting must use key=value format: ${value}`);
  const key = match[1].trim();
  if (!key) throw new Error(`--setting key cannot be empty: ${value}`);
  return [key, coerceSettingValue(match[2].trim())];
}

function coerceSettingValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function formatSettingValue(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function pushOpt(args, key, value) {
  if (value !== undefined && value !== null && value !== "") args.push(key, String(value));
}

function defaultPromptFile(outputPath) {
  const stem = safeStem(basename(outputPath, extname(outputPath)));
  return join(dirname(outputPath), "_prompts", `${stem}.md`);
}

function safeStem(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "generation";
}

function summarizePrompt(prompt) {
  if (!prompt) return null;
  return prompt.replace(/\s+/g, " ").trim().slice(0, 180);
}

function inferAssetKind(pathText) {
  const ext = extname(pathText).toLowerCase();
  if ([".mp4", ".mov", ".webm", ".avi"].includes(ext)) return "video";
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return "image";
  return "asset";
}

function inferMode(pathText) {
  const kind = inferAssetKind(pathText);
  return kind === "video" ? "video" : kind === "image" ? "image" : "asset";
}

function assertProjectPath(pathText, label) {
  const rel = normalizeSlashes(relative(projectRoot, pathText));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`${label} must be inside the project root for cross-host portability: ${pathText}`);
  }
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

function toProjectRel(pathText) {
  const rel = normalizeSlashes(relative(projectRoot, pathText));
  return rel && !rel.startsWith("..") ? rel : normalizeSlashes(pathText);
}

function normalizeSlashes(pathText) {
  return pathText ? pathText.replace(/\\/g, "/") : pathText;
}

function isUrl(value) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function yamlScalar(value) {
  return JSON.stringify(String(value));
}

function printResult(result) {
  if (opts.json || opts.dryRun) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("Generation captured");
  console.log(`Output: ${result.output}`);
  console.log(`Ledger: ${result.ledger}`);
  if (result.prompt_file) console.log(`Prompt file: ${result.prompt_file}`);
  console.log(`Validate: ${result.validate ? result.validate_strict ? "strict" : "warnings allowed" : "skipped"}`);
  console.log(`Review Board: ${result.review_board ? "refreshed" : "skipped"}`);
}

function parseArgs(args) {
  const parsed = {
    command: null,
    help: false,
    projectRoot: null,
    sceneSlug: null,
    ledger: null,
    refs: [],
    notes: [],
    settings: {},
    dryRun: false,
    noValidate: false,
    allowWarnings: false,
    noReviewBoard: false,
    allowDuplicate: false,
    allowMissingOutput: false,
    allowIncompleteRecipe: false,
    overwritePrompt: false,
    inlinePrompt: false,
    json: false,
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
    else if (key === "--project-root") parsed.projectRoot = readValue();
    else if (key === "--scene") parsed.sceneSlug = readValue();
    else if (key === "--ledger") parsed.ledger = readValue();
    else if (key === "--title") parsed.title = readValue();
    else if (key === "--output") parsed.output = readValue();
    else if (key === "--shot-id") parsed.shotId = readValue();
    else if (key === "--legacy-id") parsed.legacyId = readValue();
    else if (key === "--tool") parsed.tool = readValue();
    else if (key === "--model") parsed.model = readValue();
    else if (key === "--mode") parsed.mode = readValue();
    else if (key === "--asset-kind") parsed.assetKind = readValue();
    else if (key === "--task-id") parsed.taskId = readValue();
    else if (key === "--command" || key === "--command-text") parsed.commandText = readValue();
    else if (key === "--prompt") parsed.prompt = readValue();
    else if (key === "--prompt-file") parsed.promptFile = readValue();
    else if (key === "--negative-prompt") parsed.negativePrompt = readValue();
    else if (key === "--prompt-summary") parsed.promptSummary = readValue();
    else if (key === "--seed") parsed.seed = readValue();
    else if (key === "--resolution") parsed.resolution = readValue();
    else if (key === "--aspect-ratio") parsed.aspectRatio = readValue();
    else if (key === "--duration-seconds") parsed.durationSeconds = readValue();
    else if (key === "--audio") parsed.audio = readValue();
    else if (key === "--version") parsed.version = readValue();
    else if (key === "--status") parsed.status = readValue();
    else if (key === "--review") parsed.review = readValue();
    else if (key === "--setting") {
      const [settingKey, settingValue] = parseSettingArg(readValue());
      parsed.settings[settingKey] = settingValue;
    } else if (key === "--ref") parsed.refs.push(readValue());
    else if (key === "--note") parsed.notes.push(readValue());
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--no-validate") parsed.noValidate = true;
    else if (arg === "--allow-warnings") parsed.allowWarnings = true;
    else if (arg === "--no-review-board") parsed.noReviewBoard = true;
    else if (arg === "--allow-duplicate") parsed.allowDuplicate = true;
    else if (arg === "--allow-missing-output") parsed.allowMissingOutput = true;
    else if (arg === "--allow-incomplete-recipe") parsed.allowIncompleteRecipe = true;
    else if (arg === "--overwrite-prompt") parsed.overwritePrompt = true;
    else if (arg === "--inline-prompt") parsed.inlinePrompt = true;
    else if (arg === "--json") parsed.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printHelp() {
  process.stdout.write(`Generation capture

Usage:
  node tools/project-harness/generation-capture.mjs record [options]
  tools/project-harness/generation-capture.ps1 record [options]
  tools/project-harness/generation-capture.sh record [options]

Required:
  --title <text>           Human-readable generation direction.
  --output <path>          Generated image or video path. Must be inside the project.
  --tool <name>            Generator tool, for example gpt-image2 or imagine-cli.
  --model <name>           Generator model, for example image2, sd2, or kling-v3.

Recipe:
  --prompt <text>          Full prompt. By default it is written to <output-dir>/_prompts/*.md.
  --prompt-file <path>     Existing or target prompt file. Must be project-relative/inside project.
  --inline-prompt          Store --prompt directly in the ledger instead of writing a prompt file.
  --prompt-summary <text>  Short human scan summary. Auto-derived from --prompt when omitted.
  --negative-prompt <text> Negative prompt when supported.
  --command <text>         Submitted generator command. Alias: --command-text.
  --task-id <id>           Async task id.
  --seed <value>           Seed or generator seed id.
  --setting <key=value>    Generator setting. Can be repeated.
  --ref <role:path>        Reference image/video path. Can be repeated.

Ledger:
  --shot-id <id>           Formal shot id, for example s030.
  --legacy-id <id>         Old storyboard id, for example R4-11.
  --mode <value>           image, video, i2v, etc. Inferred from output extension when omitted.
  --asset-kind <kind>      image, video, sheet, reference, etc. Inferred when omitted.
  --resolution <value>     1080p, 720p, 2k, etc.
  --aspect-ratio <value>   16:9, 1:1, etc.
  --duration-seconds <n>   Video duration.
  --audio <value>          no_audio, muted, with_audio, etc.
  --version <value>        Version label.
  --review <value>         needs_review, selected, rejected, reference_only.
  --note <text>            Review note. Can be repeated.

Workflow:
  --dry-run                Print planned ledger args without writing.
  --allow-warnings         Run validate without --strict.
  --no-validate            Skip ledger validate.
  --no-review-board        Skip Review Board refresh.
  --allow-duplicate        Allow duplicate output_path/task_id.
  --allow-missing-output   Allow recording a submitted task before output is fetched.
  --allow-incomplete-recipe Allow recording without reusable recipe signals.
  --overwrite-prompt       Overwrite an existing prompt file.
  --json                   Print machine-readable summary.
`);
}
