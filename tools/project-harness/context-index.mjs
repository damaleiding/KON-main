#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT = "bluespace/_harness/context-index.json";
const DEFAULT_MARKDOWN_OUTPUT = "bluespace/_harness/context-index.md";
const DEFAULT_LEDGER = "bluespace/outputs/blue_space_bridge_0421/_ledger/production-ledger.jsonl";
const DEFAULT_PROMPT_INDEX = "bluespace/outputs/blue_space_bridge_0421/_ledger/prompt-index.json";
const DEFAULT_REVIEW_DECISIONS = "bluespace/outputs/blue_space_bridge_0421/_ledger/review-decisions.jsonl";
const DEFAULT_REVIEW_BOARD = "bluespace/outputs/blue_space_bridge_0421/_review/index.html";
const DEFAULT_REFERENCE_INDEX = "bluespace/refs/_index/reference-index.json";
const DEFAULT_REFERENCE_GOVERNANCE = "bluespace/refs/_index/reference-governance.json";
const DEFAULT_REFERENCE_BOARD = "bluespace/refs/_review/index.html";
const DEFAULT_REFERENCE_PICKER = "tools/project-harness/reference-picker.mjs";
const DEFAULT_WORKSPACE_PIPELINE_GUIDE = "ai-cinematic-pipeline/README.md";
const DEFAULT_WORKSPACE_PIPELINE_INDEX = "ai-cinematic-pipeline/INDEX.md";
const DEFAULT_TOOL_SKILL_PLACEMENT = "ai-cinematic-pipeline/docs/tool-skill-placement.md";
const DEFAULT_MEDIA_SYNC_STRATEGY = "ai-cinematic-pipeline/docs/media-sync-strategy.md";
const DEFAULT_TEXT_IO_ENCODING = "ai-cinematic-pipeline/docs/text-io-encoding.md";
const DEFAULT_BLUESPACE_DOCS_INDEX = "bluespace/docs/README.md";
const DEFAULT_BLUESPACE_PIPELINE_ADAPTERS = "bluespace/_pipeline/README.md";
const DEFAULT_TOOL_INDEX = "bluespace/_pipeline/tool-index.json";
const DEFAULT_SKILL_INDEX = "bluespace/_pipeline/skill-index.json";
const DEFAULT_CONTEXT_ROUTES = "bluespace/_pipeline/context-routes.json";
const DEFAULT_BOOTSTRAP_RULE_MAP = "bluespace/docs/migration/pipeline-bootstrap-rule-map.md";
const DEFAULT_BOOTSTRAP_MIGRATION = "bluespace/docs/migration/pipeline-bootstrap-migration.md";
const DEFAULT_TOOL_SKILL_GOVERNANCE = "bluespace/docs/workflow/tool-skill-governance.md";
const DEFAULT_MEDIA_SYNC_STANDARD = "bluespace/docs/standards/media-sync-standard.md";
const DEFAULT_MEDIA_MANIFEST = "bluespace/_media/media-manifest.json";

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

const projectRoot = resolvePath(opts.projectRoot || findProjectRoot(process.cwd()));
const outputPath = resolveProjectPath(opts.output || DEFAULT_OUTPUT);
const markdownOutputPath = resolveProjectPath(opts.markdownOutput || DEFAULT_MARKDOWN_OUTPUT);

try {
  const index = await buildContextIndex();
  const markdown = buildMarkdown(index);
  if (opts.json || opts.dryRun) console.log(JSON.stringify(index, null, 2));
  if (!opts.dryRun) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    await writeFile(markdownOutputPath, markdown, "utf8");
  }
  if (!opts.json && !opts.dryRun) {
    console.log(`Wrote ${toProjectRel(outputPath)}`);
    console.log(`Wrote ${toProjectRel(markdownOutputPath)}`);
    console.log(`Ledger entries: ${index.current_state.ledger.entries}`);
    console.log(`Reference assets: ${index.current_state.references.assets}`);
  }
} catch (error) {
  console.error(`context-index: ${error.message}`);
  process.exit(1);
}

async function buildContextIndex() {
  const ledgerPath = resolveProjectPath(DEFAULT_LEDGER);
  const promptIndexPath = resolveProjectPath(DEFAULT_PROMPT_INDEX);
  const decisionsPath = resolveProjectPath(DEFAULT_REVIEW_DECISIONS);
  const referenceIndexPath = resolveProjectPath(DEFAULT_REFERENCE_INDEX);

  const ledger = await summarizeLedger(ledgerPath);
  const promptIndex = await summarizePromptIndex(promptIndexPath);
  const reviewDecisions = await summarizeJsonl(decisionsPath);
  const references = await summarizeReferenceIndex(referenceIndexPath);

  return {
    kind: "bluespace_context_index",
    schema_version: 1,
    generated_at: new Date().toISOString(),
    project_root_marker: "AGENTS.md + bluespace/",
    output: toProjectRel(outputPath),
    markdown_output: toProjectRel(markdownOutputPath),
    startup_protocol: {
      default: "tools/project-harness/startup-brief.ps1",
      shot: "tools/project-harness/startup-brief.ps1 --shot-id <shot_id>",
      topic: "tools/project-harness/startup-brief.ps1 --topic status|generation|review-board|references|ledger|prompt|harness|media-sync",
      rule: "Read complete rule/index files only when the brief is insufficient or when modifying/debugging the harness itself.",
    },
    startup_sequence: [
      "tools/project-harness/startup-brief.ps1",
      "tools/project-harness/startup-brief.ps1 --shot-id <shot_id>",
      "tools/project-harness/startup-brief.ps1 --topic <topic>",
      "bluespace/_harness/context-index.json",
      "bluespace/_pipeline/context-routes.json",
      "bluespace/docs/workflow/harness-workflow-index.md",
    ],
    pipeline_hierarchy: {
      world: {
        label: "World",
        route: "t3-art/concepts/current/INDEX.md + bluespace/docs/references/concept-index.md",
        rule: "Cross-project T3 art canon source; do not put derived AI references back into t3-art/concepts/current/.",
      },
      film: {
        label: "Film",
        route: "bluespace/ + bluespace/AGENTS.md + bluespace/WORKFLOW.md",
        rule: "Bluespace project root carries film-level rules; do not create a parallel film directory for this migration.",
      },
      sequence: {
        label: "Sequence",
        route: "bluespace/outputs/blue_space_bridge_0421/SHOT_FOLDER_INDEX.md + storyboard/SPACE_SCENE_REVIEW_INDEX.md",
        rule: "Use sequence INDEX files as navigation routes before reading deeper shot folders.",
      },
      shot: {
        label: "Shot",
        route: "startup-brief --shot-id <shot_id> + shots/<shot_id>*/_shot.md + ledger find --shot-id <shot_id>",
        rule: "Local shot context overrides global assumptions; _shot.md currently carries shot-level CONTEXT without bulk renaming.",
      },
      generation: {
        label: "Generation",
        route: "production ledger + _ledger/prompt-index.json + generation-capture + prompt files",
        rule: "Prompts are durable generation records; preserve prompt/prompt_file, model, seed, refs, task_id, settings, and outputs.",
      },
    },
    retrieval_layers: [
      {
        layer: "AGENTS.md",
        role: "Global conventions only.",
        current_routes: ["AGENTS.md", "bluespace/AGENTS.md"],
      },
      {
        layer: "*_INDEX.md",
        role: "Navigation and retrieval routing, not prose dumps.",
        current_routes: [
          "t3-art/concepts/current/INDEX.md",
          "bluespace/outputs/blue_space_bridge_0421/SHOT_FOLDER_INDEX.md",
          "bluespace/scenes/blue-space-bridge-0421/storyboard/SPACE_SCENE_REVIEW_INDEX.md",
          "bluespace/_harness/context-index.md",
        ],
      },
      {
        layer: "*_CONTEXT.md",
        role: "Local creative context. Existing shot _shot.md files currently carry shot-level local context.",
        current_routes: ["bluespace/outputs/blue_space_bridge_0421/shots/<shot_id>*/_shot.md"],
        migration_note: "Do not bulk rename _shot.md to *_CONTEXT.md; add local context files only when a new workflow needs them.",
      },
      {
        layer: "tools",
        role: "Executable deterministic utilities.",
        current_routes: ["bluespace/_pipeline/tool-index.json", "tools/project-harness/", "tools/imagine-video-async/", "bluespace/tools/production-ledger/"],
      },
      {
        layer: "skills",
        role: "Model-side reusable workflows; load only when a task matches the project skill index.",
        current_routes: ["bluespace/_pipeline/skill-index.json"],
      },
      {
        layer: ".scratch",
        role: "Temporary outputs only.",
        current_routes: ["tmp/"],
        migration_note: "No stable .scratch directory is created in P2; tmp remains the current isolated fixture area.",
      },
    ],
    source_of_truth: {
      workspace_rules: "AGENTS.md",
      workspace_pipeline_guide: DEFAULT_WORKSPACE_PIPELINE_GUIDE,
      workspace_pipeline_index: DEFAULT_WORKSPACE_PIPELINE_INDEX,
      tool_skill_placement: DEFAULT_TOOL_SKILL_PLACEMENT,
      media_sync_strategy: DEFAULT_MEDIA_SYNC_STRATEGY,
      text_io_encoding: DEFAULT_TEXT_IO_ENCODING,
      bluespace_rules: "bluespace/AGENTS.md",
      workflow: "bluespace/WORKFLOW.md",
      harness_index: "bluespace/docs/workflow/harness-workflow-index.md",
      bluespace_docs_index: DEFAULT_BLUESPACE_DOCS_INDEX,
      bluespace_pipeline_adapters: DEFAULT_BLUESPACE_PIPELINE_ADAPTERS,
      tool_index: DEFAULT_TOOL_INDEX,
      skill_index: DEFAULT_SKILL_INDEX,
      context_routes: DEFAULT_CONTEXT_ROUTES,
      pipeline_bootstrap_rule_map: DEFAULT_BOOTSTRAP_RULE_MAP,
      pipeline_bootstrap_migration: DEFAULT_BOOTSTRAP_MIGRATION,
      tool_skill_governance: DEFAULT_TOOL_SKILL_GOVERNANCE,
      media_sync_standard: DEFAULT_MEDIA_SYNC_STANDARD,
      media_manifest: DEFAULT_MEDIA_MANIFEST,
      startup_brief: "tools/project-harness/startup-brief.ps1",
      token_meter: "tools/project-harness/token-meter.ps1",
      generation_review_modes: "bluespace/docs/workflow/generation-review-modes.md",
      production_log: "bluespace/docs/production/production-log.md",
      troubleshooting: "bluespace/docs/production/troubleshooting.md",
      ledger: DEFAULT_LEDGER,
      prompt_index: DEFAULT_PROMPT_INDEX,
      review_decisions: DEFAULT_REVIEW_DECISIONS,
      review_board: DEFAULT_REVIEW_BOARD,
      reference_index: DEFAULT_REFERENCE_INDEX,
      reference_governance: DEFAULT_REFERENCE_GOVERNANCE,
      reference_board: DEFAULT_REFERENCE_BOARD,
      reference_picker: DEFAULT_REFERENCE_PICKER,
    },
    phase_status: [
      { phase: 1, name: "Preflight and cross-host entrypoints", status: "done_windows", next: "macOS实机验证留到 Phase 10" },
      { phase: 2, name: "Media Review cards", status: "done", next: "按需优化展示样式" },
      { phase: 3, name: "Production ledger", status: "done", next: "使用 ledger find/recipe 定向查询" },
      { phase: 4, name: "Review Board", status: "done", next: "后续优化 stale 提示和 shot 摘要视图" },
      { phase: 5, name: "Review decision persistence", status: "done_windows", next: "macOS协议留到 Phase 10" },
      { phase: 6, name: "Generation capture and prompt tracking", status: "done", next: "生成结果继续强制记录 prompt/prompt_file" },
      { phase: 7, name: "Harness self-test", status: "done_windows", next: "继续纳入 Phase 9+ 回归点" },
      { phase: 8, name: "Context efficiency", status: "done_windows", next: "默认使用 startup-brief 启动新对话，再按需点查索引" },
      { phase: 9, name: "Reference governance", status: "done_windows", next: "后续按用户判断维护 reference-governance.json" },
      { phase: 10, name: "Cross-system verification", status: "waiting_mac", next: "在 macOS 跑 doctor/self-test/review-board" },
      { phase: 11, name: "Reference Review Board", status: "done_windows", next: "按需把 prompt reference picker 接到治理索引" },
      { phase: 12, name: "Prompt Reference Picker", status: "done_windows", next: "后续可接入具体 shot prompt 模板" },
    ],
    default_excludes: [
      "_review/data/**",
      "_legacy/**",
      "review/**",
      "**/*contact_sheet*",
      "**/*preview_sheet*",
      "**/*compare*",
      "logs/**",
      "node_modules/**",
      "tmp/**",
    ],
    query_recipes: {
      ledger_by_shot: ".\\bluespace\\tools\\production-ledger\\ledger.ps1 find --shot-id s071 --limit 10",
      ledger_by_output: ".\\bluespace\\tools\\production-ledger\\ledger.ps1 find --output <file> --json",
      ledger_recipe: ".\\bluespace\\tools\\production-ledger\\ledger.ps1 recipe --entry-id <entry_id>",
      reference_by_entity: "在 reference-index.json 中按 entity/status/usage 过滤。",
      reference_governance: "先看 bluespace/refs/_index/reference-governance.json，再看 reference-index.json 的 governance 字段。",
      reference_board: ".\\tools\\project-harness\\reference-board.ps1",
      prompt_reference_picker: ".\\tools\\project-harness\\reference-picker.ps1 --entity oldA --usage prompt_reference",
      token_meter: ".\\tools\\project-harness\\token-meter.ps1",
      tool_lookup: "在 bluespace/_pipeline/tool-index.json 中按任务类型找到工具，再点读命中的 docs/config。",
      skill_lookup: "在 bluespace/_pipeline/skill-index.json 中按生成/Prompt 任务找到 skill，再只加载对应 skill。",
      media_check: ".\\tools\\project-harness\\media-manifest.ps1 check --warn-only",
      media_missing: ".\\tools\\project-harness\\media-manifest.ps1 missing --output bluespace/_media/missing-media.json --warn-only",
    },
    current_state: {
      ledger,
      prompt_index: promptIndex,
      review_decisions: reviewDecisions,
      references,
    },
  };
}

async function summarizeLedger(pathText) {
  const entries = await readJsonlIfExists(pathText);
  return {
    path: toProjectRel(pathText),
    exists: existsSync(pathText),
    entries: entries.length,
    by_review: countBy(entries, (entry) => entry.review?.verdict || "unknown"),
    by_kind: countBy(entries, (entry) => entry.asset?.kind || "unknown"),
    by_model: countBy(entries, (entry) => entry.asset?.model || "unknown"),
    prompt_coverage: countBy(entries, (entry) => {
      if (entry.generation?.prompt || entry.generation?.prompt_file) return "full";
      if (entry.generation?.prompt_summary) return "summary_only";
      return "missing";
    }),
    hash: existsSync(pathText) ? hashText(await readFile(pathText, "utf8")) : null,
  };
}

async function summarizePromptIndex(pathText) {
  if (!existsSync(pathText)) {
    return { path: toProjectRel(pathText), exists: false, assets: 0, counts: {} };
  }
  const payload = JSON.parse(await readFile(pathText, "utf8"));
  return {
    path: toProjectRel(pathText),
    exists: true,
    assets: Array.isArray(payload.assets) ? payload.assets.length : 0,
    counts: payload.counts || {},
    generated_at: payload.generated_at || null,
  };
}

async function summarizeReferenceIndex(pathText) {
  if (!existsSync(pathText)) {
    return { path: toProjectRel(pathText), exists: false, assets: 0, counts: {} };
  }
  const payload = JSON.parse(await readFile(pathText, "utf8"));
  return {
    path: toProjectRel(pathText),
    exists: true,
    assets: Array.isArray(payload.assets) ? payload.assets.length : 0,
    skipped: Array.isArray(payload.skipped) ? payload.skipped.length : 0,
    counts: payload.counts || {},
    governance: payload.governance || null,
    generated_at: payload.generated_at || null,
  };
}

async function summarizeJsonl(pathText) {
  const entries = await readJsonlIfExists(pathText);
  return {
    path: toProjectRel(pathText),
    exists: existsSync(pathText),
    entries: entries.length,
    by_mark: countBy(entries, (entry) => entry.mark || "unknown"),
    by_verdict: countBy(entries, (entry) => entry.ledger_verdict || "unknown"),
  };
}

async function readJsonlIfExists(pathText) {
  if (!existsSync(pathText)) return [];
  const text = await readFile(pathText, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function buildMarkdown(index) {
  const lines = [
    "---",
    "description: Bluespace machine-readable context index summary.",
    `updated: ${new Date().toISOString().slice(0, 10)}`,
    "---",
    "",
    "# Project Context Index",
    "",
    "这个文件由 `tools/project-harness/context-index.*` 生成。新对话默认先运行 `tools/project-harness/startup-brief.ps1`，只有简报不足或修改/排查 harness 本身时才读完整索引。",
    "",
    "## Startup",
    "",
    `- Default: \`${index.startup_protocol.default}\``,
    `- Shot: \`${index.startup_protocol.shot}\``,
    `- Topic: \`${index.startup_protocol.topic}\``,
    `- Rule: ${index.startup_protocol.rule}`,
    "",
    "## On-Demand Index Files",
    "",
    ...index.startup_sequence.map((item, i) => `${i + 1}. \`${item}\``),
    "",
    "## Pipeline Hierarchy",
    "",
    "| Layer | Route | Rule |",
    "| --- | --- | --- |",
    ...Object.values(index.pipeline_hierarchy).map((item) => `| ${item.label} | \`${item.route}\` | ${item.rule} |`),
    "",
    "## Retrieval Layers",
    "",
    "| Layer | Role | Current Routes | Notes |",
    "| --- | --- | --- | --- |",
    ...index.retrieval_layers.map((item) => {
      const routes = item.current_routes.map((route) => `\`${route}\``).join("<br>");
      return `| ${item.layer} | ${item.role} | ${routes} | ${item.migration_note || ""} |`;
    }),
    "",
    "## Current State",
    "",
    `- Ledger entries: ${index.current_state.ledger.entries}`,
    `- Prompt index assets: ${index.current_state.prompt_index.assets}`,
    `- Review decisions: ${index.current_state.review_decisions.entries}`,
    `- Reference assets: ${index.current_state.references.assets}`,
    `- Reference governance warnings: ${index.current_state.references.governance?.warnings?.length ?? "unknown"}`,
    "",
    "## Phase Status",
    "",
    "| Phase | Name | Status | Next |",
    "| --- | --- | --- | --- |",
  ];

  for (const item of index.phase_status) {
    lines.push(`| ${item.phase} | ${item.name} | ${item.status} | ${item.next} |`);
  }

  lines.push("", "## Query Recipes", "");
  for (const [key, value] of Object.entries(index.query_recipes)) {
    lines.push(`- ${key}: \`${value}\``);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function countBy(items, getter) {
  const counts = {};
  for (const item of items) {
    const key = getter(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function hashText(text) {
  return createHash("sha1").update(text).digest("hex");
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

function resolvePath(pathText) {
  return isAbsolute(pathText) ? pathText : resolve(process.cwd(), pathText);
}

function resolveProjectPath(pathText) {
  if (!pathText) return null;
  if (isAbsolute(pathText)) return pathText;
  return resolve(projectRoot, pathText.replace(/^\.?[\\/]/, ""));
}

function toProjectRel(pathText) {
  const rel = relative(projectRoot, resolvePath(pathText));
  return normalizeSlashes(rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : pathText);
}

function normalizeSlashes(pathText) {
  return pathText ? pathText.replace(/\\/g, "/") : pathText;
}

function parseArgs(args) {
  const parsed = {
    help: false,
    projectRoot: null,
    output: null,
    markdownOutput: null,
    dryRun: false,
    json: false,
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
    else if (key === "--output") parsed.output = readValue();
    else if (key === "--markdown-output") parsed.markdownOutput = readValue();
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--json") parsed.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function printHelp() {
  process.stdout.write(`Bluespace context index generator

Usage:
  node tools/project-harness/context-index.mjs [options]
  tools/project-harness/context-index.ps1 [options]
  tools/project-harness/context-index.sh [options]

Options:
  --project-root <path>       Defaults to the nearest trae_projects root.
  --output <path>             Defaults to bluespace/_harness/context-index.json.
  --markdown-output <path>    Defaults to bluespace/_harness/context-index.md.
  --dry-run                   Print JSON without writing files.
  --json                      Print machine-readable JSON.
  -h, --help                  Show this help.
`);
}
