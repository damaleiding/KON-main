#!/usr/bin/env node

import { existsSync, readdirSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONTEXT_INDEX = "bluespace/_harness/context-index.json";
const DEFAULT_LEDGER = "bluespace/outputs/blue_space_bridge_0421/_ledger/production-ledger.jsonl";
const DEFAULT_SHOTS_ROOT = "bluespace/outputs/blue_space_bridge_0421/shots";
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

const projectRoot = resolve(opts.projectRoot || findProjectRoot(process.cwd()));
const contextPath = resolveMaybeProjectRelative(opts.context || DEFAULT_CONTEXT_INDEX);
const context = await readJsonIfExists(contextPath);
const ledgerPath = resolveMaybeProjectRelative(context?.source_of_truth?.ledger || DEFAULT_LEDGER);
const ledgerEntries = await readLedgerIfExists(ledgerPath);
const mediaManifestPath = resolveMaybeProjectRelative(context?.source_of_truth?.media_manifest || DEFAULT_MEDIA_MANIFEST);
const mediaSync = await summarizeMediaManifest(mediaManifestPath);
const topic = normalizeTopic(opts.topic || (opts.shotId ? "shot" : "status"));
const shotEntries = opts.shotId
  ? ledgerEntries.filter((entry) => entry.shot_id === opts.shotId)
  : [];
const shotFolder = opts.shotId ? findShotFolder(opts.shotId) : null;
const shotNote = shotFolder ? await readShotNote(shotFolder) : null;
const brief = buildBrief({ context, ledgerEntries, shotEntries, shotFolder, shotNote, topic, mediaSync });

if (opts.json) {
  console.log(JSON.stringify(brief, null, 2));
} else {
  console.log(formatBrief(brief));
}

function buildBrief({ context, ledgerEntries, shotEntries, shotFolder, shotNote, topic, mediaSync }) {
  const limit = opts.limit;
  const topicInfo = buildTopicInfo(topic, opts.shotId, shotFolder);
  const nextSteps = [...topicInfo.nextSteps];
  if (mediaSync?.status === "needs_sync") {
    nextSteps.unshift(
      `媒体库不完整：缺 ${mediaSync.missing} 个文件，约 ${mediaSync.missing_gib} GiB。运行 media-manifest check/missing 后用同步工具补拉。`,
    );
  } else if (mediaSync?.status === "manifest_missing" && topic === "media-sync") {
    nextSteps.unshift("尚未找到 media manifest；先运行 media-manifest scan 建立媒体清单。");
  }
  const recentSource = opts.shotId
    ? shotEntries
    : shouldShowGlobalRecent(topic)
      ? ledgerEntries
      : [];
  const recent = sortEntries(recentSource).slice(0, limit).map(compactEntry);
  const sourceOfTruth = context?.source_of_truth || {};
  const currentState = context?.current_state || {};

  return {
    kind: "bluespace_startup_brief",
    generated_at: new Date().toISOString(),
    project_root: normalizeSlashes(projectRoot),
    topic: topicInfo.key,
    topic_label: topicInfo.label,
    topic_description: topicInfo.description,
    mode_hint: "低 token 启动包：先看本简报；只按本轮 topic 点查事实源。",
    source_of_truth: {
      workspace_pipeline_guide: sourceOfTruth.workspace_pipeline_guide,
      workspace_pipeline_index: sourceOfTruth.workspace_pipeline_index,
      workflow: sourceOfTruth.workflow,
      tool_skill_placement: sourceOfTruth.tool_skill_placement,
      text_io_encoding: sourceOfTruth.text_io_encoding,
      generation_review_modes: sourceOfTruth.generation_review_modes,
      ledger: sourceOfTruth.ledger || toProjectRel(ledgerPath),
      prompt_index: sourceOfTruth.prompt_index,
      review_board: sourceOfTruth.review_board,
      reference_index: sourceOfTruth.reference_index,
      reference_governance: sourceOfTruth.reference_governance,
      tool_index: sourceOfTruth.tool_index,
      skill_index: sourceOfTruth.skill_index,
      context_routes: sourceOfTruth.context_routes,
      media_manifest: sourceOfTruth.media_manifest || DEFAULT_MEDIA_MANIFEST,
      media_sync_strategy: sourceOfTruth.media_sync_strategy,
      media_sync_standard: sourceOfTruth.media_sync_standard,
    },
    current_state: {
      ledger_entries: currentState.ledger?.entries ?? ledgerEntries.length,
      prompt_coverage: currentState.ledger?.prompt_coverage || countBy(ledgerEntries, promptCoverage),
      references: currentState.references?.assets ?? null,
      review_decisions: currentState.review_decisions?.entries ?? null,
      media_sync: mediaSync,
    },
    shot: opts.shotId
      ? {
          shot_id: opts.shotId,
          folder: shotFolder ? toProjectRel(shotFolder) : null,
          note: shotNote,
          ledger_matches: shotEntries.length,
          recent_assets: recent,
        }
      : null,
    recent_assets: opts.shotId ? [] : recent,
    next_steps: nextSteps,
    on_demand_sources: topicInfo.sources,
    // Kept for older consumers that already read startup_files.
    startup_files: topicInfo.sources,
    token_rules: [
      "不要读取完整 production-ledger.jsonl、prompt-index.json、review-data.js 或 _review/data/*.json。",
      "查媒体先用 ledger find，并带 --shot-id / --kind / --role / --limit。",
      "查旧 prompt 先用 ledger recipe 的单条 entry，不要把所有 prompt 文件读进聊天。",
      "Review Board 和 Reference Board 只给页面入口和短摘要，不把完整媒体清单贴进对话。",
      "只有修改规则、工具或排查索引问题时，才读取完整 AGENTS、WORKFLOW 或 harness-workflow-index。",
    ],
    useful_commands: topicInfo.commands,
  };
}

function buildTopicInfo(topic, shotId, shotFolder) {
  const shot = shotId || "<shot_id>";
  const topics = {
    status: {
      key: "status",
      label: "项目状态",
      description: "用于新会话第一问、问进度、问 token 或确认下一步。",
      nextSteps: [
        "先用本简报判断当前项目规模和事实源位置。",
        "如果用户给了 shot id，再重新运行 startup-brief --shot-id。",
        "只有要修改 harness 规则或工具时，才读完整 harness-workflow-index。",
      ],
      sources: [
        "tools/project-harness/startup-brief.ps1 --help",
        "bluespace/_harness/context-index.json",
        "bluespace/_pipeline/context-routes.json",
        "bluespace/docs/production/production-log.md",
        "bluespace/docs/production/troubleshooting.md",
      ],
      commands: [
        ".\\tools\\project-harness\\startup-brief.ps1 --shot-id <shot_id>",
        ".\\tools\\project-harness\\startup-brief.ps1 --topic generation --limit 3",
        ".\\tools\\project-harness\\token-meter.ps1",
        ".\\tools\\project-harness\\doctor.ps1",
      ],
    },
    shot: {
      key: "shot",
      label: "单镜头接手",
      description: "用于接手某个 shot，查看 shot note、少量 ledger 命中和下一步查询入口。",
      nextSteps: [
        "先看 shot note 和最近资产是否足够回答问题。",
        "需要媒体细节时用 ledger find 缩小到单镜头。",
        "需要复用旧生成时，用 ledger recipe 查单条配方。",
      ],
      sources: [
        shotFolder ? `${toProjectRel(shotFolder)}/_shot.md` : `${DEFAULT_SHOTS_ROOT}/${shot}_*/_shot.md`,
        "bluespace/outputs/blue_space_bridge_0421/_ledger/production-ledger.jsonl (用 ledger find 定向查)",
        "bluespace/outputs/blue_space_bridge_0421/_ledger/prompt-index.json (只查目标条目)",
      ],
      commands: [
        `.\\bluespace\\tools\\production-ledger\\ledger.ps1 find --shot-id ${shot} --limit 10`,
        `.\\bluespace\\tools\\production-ledger\\ledger.ps1 find --shot-id ${shot} --kind video --limit 10`,
        ".\\bluespace\\tools\\production-ledger\\ledger.ps1 recipe --entry-id <entry_id>",
        ".\\tools\\project-harness\\review-board-data.ps1",
        `.\\tools\\project-harness\\startup-brief.ps1 --shot-id ${shot}`,
      ],
    },
    generation: {
      key: "generation",
      label: "生成收口",
      description: "用于生图、生视频、记录 prompt、入账和刷新 Review Board。",
      nextSteps: [
        "提交前先让用户看到本轮中文 Prompt。",
        "正式结果用 generation-capture record 收口。",
        "生成后刷新 ledger / prompt index / Review Board 数据包。",
      ],
      sources: [
        "bluespace/WORKFLOW.md (只查生成节奏章节)",
        "bluespace/_pipeline/skill-index.json",
        "bluespace/_pipeline/tool-index.json",
        "bluespace/docs/workflow/generation-review-modes.md",
        "bluespace/docs/standards/generation-recipe-standard.md",
        "tools/project-harness/generation-capture.mjs",
      ],
      commands: [
        ".\\tools\\project-harness\\reference-picker.ps1 --entity <entity> --usage prompt_reference",
        ".\\tools\\project-harness\\generation-capture.ps1 record --output <project-relative-output> --tool <tool> --model <model> --prompt <prompt>",
        ".\\bluespace\\tools\\production-ledger\\ledger.ps1 validate --strict",
        ".\\tools\\project-harness\\review-board-data.ps1",
      ],
    },
    "review-board": {
      key: "review-board",
      label: "Review Board",
      description: "用于审片页面、喜欢/不喜欢回写、数据包刷新和显示问题排查。",
      nextSteps: [
        "先判断问题是未入账、数据包未刷新，还是浏览器缓存/筛选状态。",
        "普通账本变化只跑 review-board-data，不重建页面壳。",
        "不要把 _review/data/*.json 全量读入聊天。",
      ],
      sources: [
        "tools/project-harness/REVIEW_BOARD.md",
        "bluespace/_pipeline/tool-index.json (review_board 条目)",
        "bluespace/outputs/blue_space_bridge_0421/_review/index.html",
        "bluespace/outputs/blue_space_bridge_0421/_ledger/review-decisions.jsonl",
        "bluespace/outputs/blue_space_bridge_0421/_review/manifest.json",
      ],
      commands: [
        ".\\tools\\project-harness\\review-board-data.ps1",
        ".\\tools\\project-harness\\review-board-open.ps1",
        ".\\tools\\project-harness\\review-decision.ps1 import --file <review-marks.json>",
        `.\\bluespace\\tools\\production-ledger\\ledger.ps1 find --shot-id ${shot} --limit 10`,
      ],
    },
    references: {
      key: "references",
      label: "参考图",
      description: "用于查 selected / deprecated / usage / governance，不全量列 refs。",
      nextSteps: [
        "先按 entity / usage / status 用 reference-picker 或 reference-index 定位。",
        "需要批量可视化时打开 Reference Board 页面。",
        "只有治理规则不清楚时，才读 reference-governance。",
      ],
      sources: [
        "bluespace/refs/_index/reference-governance.json",
        "bluespace/refs/_index/reference-index.json",
        "bluespace/_pipeline/tool-index.json (reference_* 条目)",
        "bluespace/refs/_review/index.html",
        "tools/project-harness/reference-picker.mjs",
      ],
      commands: [
        ".\\tools\\project-harness\\reference-picker.ps1 --entity <entity> --usage prompt_reference",
        ".\\tools\\project-harness\\reference-picker.ps1 --entity <entity> --paths-only",
        ".\\tools\\project-harness\\reference-board.ps1",
        ".\\tools\\project-harness\\reference-index.ps1",
      ],
    },
    "media-sync": {
      key: "media-sync",
      label: "媒体同步",
      description: "用于检查媒体库是否完整、生成缺失清单、决定 Git 与点对点同步边界。",
      nextSteps: [
        "先用 media-manifest check 看本机缺多少媒体。",
        "需要补拉时生成 missing-media.json，再按 sync_group 用 Syncthing、Resilio 或 rclone 同步。",
        "新生成或整理媒体后运行 media-manifest scan 刷新清单，再提交文本事实。",
      ],
      sources: [
        "ai-cinematic-pipeline/docs/media-sync-strategy.md",
        "bluespace/docs/standards/media-sync-standard.md",
        "bluespace/_media/media-manifest.json",
        "bluespace/_pipeline/tool-index.json (media_manifest 条目)",
      ],
      commands: [
        ".\\tools\\project-harness\\media-manifest.ps1 check --warn-only",
        ".\\tools\\project-harness\\media-manifest.ps1 missing --output bluespace/_media/missing-media.json --warn-only",
        ".\\tools\\project-harness\\media-manifest.ps1 scan --hash",
      ],
    },
    ledger: {
      key: "ledger",
      label: "账本查询",
      description: "用于查媒体是否入账、查单条资产、查配方和补历史素材。",
      nextSteps: [
        "先用 find 按 shot、output、entry 或 task id 定位。",
        "需要生成配方时查单条 recipe。",
        "补历史素材前先 dry-run ingest。",
      ],
      sources: [
        "bluespace/tools/production-ledger/README.md",
        "bluespace/_pipeline/tool-index.json (production_ledger 条目)",
        "bluespace/docs/standards/production-ledger-standard.md",
        "bluespace/outputs/blue_space_bridge_0421/_ledger/production-ledger.jsonl (用 ledger 命令定向查)",
        "bluespace/outputs/blue_space_bridge_0421/_ledger/prompt-index.json (只查目标条目)",
      ],
      commands: [
        `.\\bluespace\\tools\\production-ledger\\ledger.ps1 find --shot-id ${shot} --limit 10`,
        ".\\bluespace\\tools\\production-ledger\\ledger.ps1 find --output <project-relative-output> --json",
        ".\\bluespace\\tools\\production-ledger\\ledger.ps1 recipe --entry-id <entry_id>",
        ".\\bluespace\\tools\\production-ledger\\ledger.ps1 ingest --dry-run --json",
        ".\\bluespace\\tools\\production-ledger\\ledger.ps1 validate --strict",
      ],
    },
    prompt: {
      key: "prompt",
      label: "Prompt 和配方",
      description: "用于复用旧 prompt、检查 prompt_file、补生成配方。",
      nextSteps: [
        "先定位 entry id 或 output path。",
        "用 ledger recipe 读取单条配方。",
        "长 prompt 放 prompt 文件，账本只引用路径。",
      ],
      sources: [
        "bluespace/outputs/blue_space_bridge_0421/_ledger/prompt-index.json (只查目标条目)",
        "bluespace/_pipeline/skill-index.json",
        "bluespace/_pipeline/tool-index.json",
        "bluespace/docs/standards/generation-recipe-standard.md",
        "bluespace/docs/workflow/generation-review-modes.md",
      ],
      commands: [
        ".\\bluespace\\tools\\production-ledger\\ledger.ps1 find --output <project-relative-output> --json",
        ".\\bluespace\\tools\\production-ledger\\ledger.ps1 recipe --entry-id <entry_id>",
        `.\\bluespace\\tools\\production-ledger\\ledger.ps1 find --shot-id ${shot} --prompt-status prompt_file --limit 10`,
        ".\\bluespace\\tools\\production-ledger\\ledger.ps1 prompt-index",
      ],
    },
    harness: {
      key: "harness",
      label: "Harness 工程",
      description: "用于修改工具、入口、规则、doctor/self-test 或上下文索引。",
      nextSteps: [
        "修改工程规则前读 harness-workflow-index 的相关章节。",
        "改入口或索引后刷新 context-index。",
        "重要改动后跑 doctor 和 self-test。",
      ],
      sources: [
        "bluespace/docs/workflow/harness-workflow-index.md",
        "bluespace/_pipeline/context-routes.json",
        "bluespace/_pipeline/tool-index.json",
        "tools/project-harness/README.md",
        "tools/project-harness/doctor.mjs",
        "tools/project-harness/self-test.mjs",
        "tools/project-harness/context-index.mjs",
      ],
      commands: [
        ".\\tools\\project-harness\\doctor.ps1",
        ".\\tools\\project-harness\\self-test.ps1",
        ".\\tools\\project-harness\\context-index.ps1",
        ".\\tools\\project-harness\\startup-brief.ps1 --help",
      ],
    },
  };

  return topics[topic];
}

function shouldShowGlobalRecent(topic) {
  if (opts.recent === true) return true;
  if (opts.recent === false) return false;
  return topic === "generation" || topic === "ledger" || topic === "prompt";
}

function formatBrief(brief) {
  const lines = [];
  lines.push("# Bluespace Startup Brief");
  lines.push("");
  lines.push(brief.mode_hint);
  lines.push("");
  lines.push("## 本轮主题");
  lines.push(`- Topic: ${brief.topic} (${brief.topic_label})`);
  lines.push(`- 用途: ${brief.topic_description}`);
  lines.push("");
  lines.push("## 状态");
  lines.push(`- Ledger entries: ${brief.current_state.ledger_entries}`);
  lines.push(`- Prompt coverage: ${formatCounts(brief.current_state.prompt_coverage)}`);
  if (brief.current_state.references !== null) lines.push(`- Reference assets: ${brief.current_state.references}`);
  if (brief.current_state.review_decisions !== null) lines.push(`- Review decisions: ${brief.current_state.review_decisions}`);
  if (brief.current_state.media_sync) {
    const media = brief.current_state.media_sync;
    if (media.status === "ok") lines.push(`- Media sync: OK (${media.ok}/${media.entries})`);
    else if (media.status === "needs_sync") lines.push(`- Media sync: NEEDS SYNC missing=${media.missing}, size_mismatch=${media.size_mismatch}, missing=${media.missing_gib} GiB`);
    else lines.push(`- Media sync: ${media.status}`);
  }

  if (brief.shot) {
    lines.push("");
    lines.push(`## Shot ${brief.shot.shot_id}`);
    lines.push(`- Folder: ${brief.shot.folder || "(not found)"}`);
    lines.push(`- Ledger matches: ${brief.shot.ledger_matches}`);
    if (brief.shot.note) lines.push(`- Note: ${brief.shot.note}`);
    if (brief.shot.recent_assets.length) {
      lines.push("");
      lines.push("### Recent Assets");
      for (const item of brief.shot.recent_assets) lines.push(formatEntry(item));
    }
  } else if (brief.recent_assets.length) {
    lines.push("");
    lines.push("## Recent Assets");
    for (const item of brief.recent_assets) lines.push(formatEntry(item));
  }

  lines.push("");
  lines.push("## 建议下一步");
  for (const step of brief.next_steps) lines.push(`- ${step}`);
  lines.push("");
  lines.push("## 按需事实源");
  for (const file of brief.on_demand_sources) lines.push(`- ${file}`);
  lines.push("");
  lines.push("## Token 规则");
  for (const rule of brief.token_rules) lines.push(`- ${rule}`);
  lines.push("");
  lines.push("## 推荐命令");
  for (const command of brief.useful_commands) lines.push(`- \`${command}\``);
  return `${lines.join("\n")}\n`;
}

function formatEntry(item) {
  return `- ${item.entry_id} | ${item.shot_id || "(no-shot)"} | ${item.review || "unknown"} | ${item.kind || "asset"} | ${item.model || "unknown"} | ${item.prompt_status} | ${item.output_path}`;
}

function compactEntry(entry) {
  return {
    entry_id: entry.entry_id,
    shot_id: entry.shot_id || null,
    review: entry.review?.verdict || null,
    kind: entry.asset?.kind || null,
    role: entry.asset?.spec?.role || entry.generation?.mode || entry.asset?.kind || null,
    model: entry.asset?.model || null,
    prompt_status: promptStatus(entry),
    output_path: normalizeSlashes(entry.asset?.output_path || ""),
    task_id: entry.generation?.task_id || null,
    title: entry.title || basename(entry.asset?.output_path || entry.entry_id || ""),
  };
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => entryTime(b).localeCompare(entryTime(a)));
}

function entryTime(entry) {
  return (
    entry.provenance?.ingested_at ||
    entry.provenance?.production_date ||
    entry.provenance?.source_modified_at ||
    ""
  );
}

function findShotFolder(shotId) {
  const shotsRoot = resolveMaybeProjectRelative(DEFAULT_SHOTS_ROOT);
  if (!existsSync(shotsRoot)) return null;
  const candidates = [];
  try {
    const names = readdirSync(shotsRoot, { withFileTypes: true });
    for (const name of names) {
      if (name.isDirectory() && name.name.startsWith(`${shotId}_`)) candidates.push(join(shotsRoot, name.name));
    }
  } catch {
    return null;
  }
  return candidates[0] || null;
}

async function readShotNote(shotFolder) {
  const pathText = join(shotFolder, "_shot.md");
  if (!existsSync(pathText)) return null;
  const text = await readFile(pathText, "utf8");
  const withoutFrontmatter = text.replace(/^---\s*[\s\S]*?\n---\s*/m, "");
  const lines = withoutFrontmatter
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line !== "---");
  return truncate(lines.find((line) => !line.startsWith("#")) || lines[0] || null, 180);
}

async function readJsonIfExists(pathText) {
  if (!existsSync(pathText)) return null;
  return JSON.parse(await readFile(pathText, "utf8"));
}

async function readLedgerIfExists(pathText) {
  if (!existsSync(pathText)) return [];
  const text = await readFile(pathText, "utf8");
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Keep the startup brief resilient; ledger validate reports exact JSON errors.
    }
  }
  return entries;
}

async function summarizeMediaManifest(pathText) {
  if (!pathText || !existsSync(pathText)) {
    return { status: "manifest_missing", manifest: pathText ? toProjectRel(pathText) : DEFAULT_MEDIA_MANIFEST };
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(pathText, "utf8"));
  } catch {
    return { status: "manifest_invalid", manifest: toProjectRel(pathText) };
  }
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  let ok = 0;
  let missing = 0;
  let sizeMismatch = 0;
  let missingBytes = 0;
  const byGroup = {};
  for (const entry of entries) {
    const filePath = resolveMaybeProjectRelative(entry.path);
    const group = entry.sync_group || "unknown";
    if (!existsSync(filePath)) {
      missing += 1;
      missingBytes += entry.bytes || 0;
      byGroup[group] = byGroup[group] || { missing: 0, bytes: 0, gib: 0 };
      byGroup[group].missing += 1;
      byGroup[group].bytes += entry.bytes || 0;
      continue;
    }
    try {
      const fileStat = await stat(filePath);
      if (Number.isFinite(entry.bytes) && fileStat.size !== entry.bytes) {
        sizeMismatch += 1;
      } else {
        ok += 1;
      }
    } catch {
      missing += 1;
      missingBytes += entry.bytes || 0;
    }
  }
  for (const item of Object.values(byGroup)) item.gib = round(item.bytes / 1024 / 1024 / 1024, 3);
  const notOk = missing + sizeMismatch;
  return {
    status: notOk ? "needs_sync" : "ok",
    manifest: toProjectRel(pathText),
    entries: entries.length,
    ok,
    missing,
    size_mismatch: sizeMismatch,
    missing_gib: round(missingBytes / 1024 / 1024 / 1024, 3),
    by_sync_group: byGroup,
  };
}

function promptCoverage(entry) {
  if (entry.generation?.prompt || entry.generation?.prompt_file) return "full";
  if (entry.generation?.prompt_summary) return "summary_only";
  return "missing";
}

function promptStatus(entry) {
  if (entry.generation?.prompt_file) return "prompt_file";
  if (entry.generation?.prompt) return "inline_prompt";
  if (entry.generation?.command || entry.generation?.references?.length || Object.keys(entry.generation?.settings || {}).length) {
    return "recipe_without_prompt";
  }
  if (entry.generation?.prompt_summary) return "summary_only";
  return "missing";
}

function countBy(items, fn) {
  const counts = {};
  for (const item of items) {
    const key = fn(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function formatCounts(counts) {
  if (!counts || Object.keys(counts).length === 0) return "(none)";
  return Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(", ");
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
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

function resolveMaybeProjectRelative(pathText) {
  if (!pathText) return null;
  if (/^[A-Za-z]:[\\/]/.test(pathText) || pathText.startsWith("/")) return resolve(pathText);
  return resolve(projectRoot, pathText);
}

function toProjectRel(pathText) {
  const rel = normalizeSlashes(pathText).replace(normalizeSlashes(projectRoot) + "/", "");
  return rel || normalizeSlashes(pathText);
}

function normalizeSlashes(pathText) {
  return pathText ? pathText.replace(/\\/g, "/") : "";
}

function normalizeTopic(value) {
  const normalized = String(value || "status").trim().toLowerCase().replace(/[\s_]+/g, "-");
  const aliases = {
    board: "review-board",
    review: "review-board",
    reviewboard: "review-board",
    refs: "references",
    reference: "references",
    generate: "generation",
    gen: "generation",
    recipe: "prompt",
    prompts: "prompt",
    context: "harness",
    media: "media-sync",
    mediasync: "media-sync",
    "media-check": "media-sync",
  };
  const topic = aliases[normalized] || normalized;
  const known = new Set(["status", "shot", "generation", "review-board", "references", "ledger", "prompt", "harness", "media-sync"]);
  if (!known.has(topic)) {
    throw new Error(`Unknown --topic: ${value}. Use status, shot, generation, review-board, references, ledger, prompt, harness, or media-sync.`);
  }
  return topic;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseArgs(args) {
  const parsed = {
    help: false,
    projectRoot: null,
    context: null,
    shotId: null,
    topic: null,
    limit: 5,
    json: false,
    recent: null,
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
    else if (key === "--context") parsed.context = readValue();
    else if (key === "--shot-id") parsed.shotId = readValue();
    else if (key === "--topic") parsed.topic = readValue();
    else if (key === "--limit") parsed.limit = Number.parseInt(readValue(), 10);
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--recent") parsed.recent = true;
    else if (arg === "--no-recent") parsed.recent = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(parsed.limit) || parsed.limit < 1) throw new Error("--limit must be a positive integer");
  return parsed;
}

function printHelp() {
  process.stdout.write(`Bluespace startup brief

Usage:
  node tools/project-harness/startup-brief.mjs [options]
  tools/project-harness/startup-brief.ps1 [options]
  tools/project-harness/startup-brief.sh [options]

Options:
  --project-root <path>  Defaults to the nearest trae_projects root.
  --context <path>       Defaults to bluespace/_harness/context-index.json.
  --shot-id <id>         Include a compact shot-specific ledger summary.
  --topic <name>         status, shot, generation, review-board, references, ledger, prompt, harness, media-sync.
  --limit <n>            Max compact assets to show. Default 5.
  --recent               Include recent global assets when no --shot-id is provided.
  --no-recent            Hide recent global assets.
  --json                 Print machine-readable output.
  -h, --help             Show this help.
`);
}
