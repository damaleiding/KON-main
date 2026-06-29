#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const wordCountTool = resolve(repoRoot, "tools/word-count/word-count.mjs");

const work = {
  project: "story-engine",
  work: "人偶番外",
  output: "projects/story-canvas/_ledger/story-canvas/人偶番外.canvas.json",
  published: "projects/story-engine/人偶番外/发布/发布版_人偶番外.md",
  publishedSections: [
    { title: "第一章：防腐剂、死物与冷光长廊（上）", canonical: 1, part: "上" },
    { title: "第一章：防腐剂、死物与冷光长廊（下）", canonical: 1, part: "下" },
    { title: "第二章：漏斗形的白瓷与盲端通道（上）", canonical: 2, part: "上" },
    { title: "第二章：漏斗形的白瓷与盲端通道（下）", canonical: 2, part: "下" },
    { title: "第三章：残缺的白瓷与午夜的空白记录（上）", canonical: 3, part: "上" },
    { title: "第三章：残缺的白瓷与午夜的空白记录（下）", canonical: 3, part: "下" },
    { title: "第四章：双线并行的感官与代行者（上）", canonical: 4, part: "上" },
    { title: "第四章：双线并行的感官与代行者（中）", canonical: 4, part: "中" },
    { title: "第四章：双线并行的感官与代行者（下）", canonical: 4, part: "下" }
  ],
  publishedStandaloneSections: [
    {
      title: "第八章：白瓷重塑、极效精油与双线崩坏的抛光（成人化重设版·下）",
      nextTitle: "第八章（成人化重设·增补上）：双生陈列与自愿剥离的遗言",
      canonical: 8,
      part: "成人化重设·下",
      sourceBranch: "发布正式线整合段"
    }
  ],
  files: [
    { path: "projects/story-engine/人偶番外/分支/成人化重设/第五章（成人化重设·上）.md", canonical: 5, part: "成人化重设·上" },
    { path: "projects/story-engine/人偶番外/分支/成人化重设/第五章（成人化重设·中）.md", canonical: 5, part: "成人化重设·中" },
    { path: "projects/story-engine/人偶番外/分支/成人化重设/第五章（成人化重设·下）.md", canonical: 5, part: "成人化重设·下" },
    { path: "projects/story-engine/人偶番外/分支/成人化重设/第六章（成人化重设）.md", canonical: 6, part: "成人化重设" },
    { path: "projects/story-engine/人偶番外/分支/成人化重设/第七章（成人化重设·上）.md", canonical: 7, part: "成人化重设·上" },
    { path: "projects/story-engine/人偶番外/分支/成人化重设/第七章（成人化重设·下）.md", canonical: 7, part: "成人化重设·下" },
    { path: "projects/story-engine/人偶番外/分支/成人化重设/第八章（成人化重设·上）.md", canonical: 8, part: "成人化重设·上" },
    { path: "projects/story-engine/人偶番外/分支/成人化重设/第八章（成人化重设·中）.md", canonical: 8, part: "成人化重设·中" },
    { path: "projects/story-engine/人偶番外/分支/增补/第八章（增补·上）.md", canonical: 8, part: "增补·上" },
    { path: "projects/story-engine/人偶番外/分支/成人化重设/终章：完美倒错与感官的最终剥离.md", canonical: 9, part: "终章" }
  ]
};

const publishedNodes = buildPublishedNodes(work);
const fileNodes = buildFileNodes(work);
const standalonePublishedNodes = buildPublishedStandaloneNodes(work);
const nodes = [
  ...publishedNodes,
  ...fileNodes.slice(0, 8),
  ...standalonePublishedNodes,
  ...fileNodes.slice(8)
].map((node, index) => completeNode(node, index));

const canvas = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  project: work.project,
  work: work.work,
  source_policy: "节点只保存来源路径、行号和统计，不复制整章正文；在工具中按节点载入正文文件后再做剧情段 reroll。",
  count_definition: "nonspace Unicode characters, measured by tools/word-count/word-count.mjs after stripping trailing chapter count blocks.",
  structure: { chapters_per_arc: 10, arcs_per_volume: 5, chapters_per_volume: 50 },
  volumes: [
    {
      id: "renou-v01",
      title: "人偶番外：正式完结线",
      core_direction: "前四章沿用发布线既有事实，第五章至终章采用成人化重设正式完结线；后日谈不进入本卷核心方向。",
      direction_locked: true,
      arcs: [
        { id: "renou-v01-a01", title: "篇章一：前四章与第五章转折", node_range: "001-010" },
        { id: "renou-v01-a02", title: "篇章二：正式线推进与完结", node_range: "011-020" }
      ]
    }
  ],
  nodes,
  edges: nodes.slice(1).map((node, index) => ({
    from: nodes[index].id,
    to: node.id,
    type: "mainline"
  }))
};

const outputPath = resolve(repoRoot, work.output);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(canvas, null, 2)}\n`, "utf8");
console.log(`Wrote ${relative(repoRoot, outputPath)} (${nodes.length} nodes)`);

function buildPublishedNodes(config) {
  const sourcePath = resolve(repoRoot, config.published);
  const text = readFileSync(sourcePath, "utf8");
  const lines = splitLines(text);
  return config.publishedSections.map((section, index) => {
    const startLine = findLine(lines, section.title);
    const nextTitle = config.publishedSections[index + 1]?.title || "第五章：代行者的自我解析与崩坏的初体验（成人化重设·上）";
    const endLine = findLine(lines, nextTitle) - 1;
    const body = stripStats(lines.slice(startLine - 1, endLine).join("\n"));
    return {
      title: section.title,
      source_path: config.published,
      source_line_start: startLine,
      source_line_end: endLine,
      source_branch: "发布正式线前四章",
      source_file_name: basename(config.published),
      canonical_chapter_no: section.canonical,
      part_label: section.part,
      current_chars: countText(body),
      paragraph_count: countParagraphs(body)
    };
  });
}

function buildFileNodes(config) {
  return config.files.map(file => {
    const sourcePath = resolve(repoRoot, file.path);
    const text = readFileSync(sourcePath, "utf8");
    const lines = splitLines(text);
    const body = stripStats(text);
    return {
      title: firstNonEmptyLine(lines) || basename(file.path),
      source_path: file.path,
      source_line_start: 1,
      source_line_end: splitLines(body).length,
      source_branch: file.path.includes("/分支/增补/") ? "增补分支" : "成人化重设正式线",
      source_file_name: basename(file.path),
      canonical_chapter_no: file.canonical,
      part_label: file.part,
      current_chars: countText(body),
      paragraph_count: countParagraphs(body)
    };
  });
}

function buildPublishedStandaloneNodes(config) {
  const sourcePath = resolve(repoRoot, config.published);
  const text = readFileSync(sourcePath, "utf8");
  const lines = splitLines(text);
  return config.publishedStandaloneSections.map(section => {
    const startLine = findLine(lines, section.title);
    const endLine = findLine(lines, section.nextTitle) - 1;
    const body = stripStats(lines.slice(startLine - 1, endLine).join("\n"));
    return {
      title: section.title,
      source_path: config.published,
      source_line_start: startLine,
      source_line_end: endLine,
      source_branch: section.sourceBranch,
      source_file_name: basename(config.published),
      canonical_chapter_no: section.canonical,
      part_label: section.part,
      current_chars: countText(body),
      paragraph_count: countParagraphs(body)
    };
  });
}

function completeNode(node, index) {
  const sequence = index + 1;
  const arcNo = Math.floor(index / 10) + 1;
  const nodeNo = String(sequence).padStart(3, "0");
  return {
    id: `renou-v01-a${String(arcNo).padStart(2, "0")}-n${nodeNo}`,
    volume_id: "renou-v01",
    arc_id: `renou-v01-a${String(arcNo).padStart(2, "0")}`,
    chapter_no: sequence,
    canonical_chapter_no: node.canonical_chapter_no,
    part_label: node.part_label,
    title: node.title,
    target_chars: `当前 ${node.current_chars} / 目标 3000-6000`,
    current_chars: node.current_chars,
    paragraph_count: node.paragraph_count,
    status: "loaded",
    source_path: node.source_path,
    source_file_name: node.source_file_name,
    source_branch: node.source_branch,
    source_line_start: node.source_line_start,
    source_line_end: node.source_line_end,
    mainline_step: `${node.source_branch}：${node.title}`,
    subplot_steps: ["待按正文细化角色状态变化", "待按正文细化环境与设定增量"],
    chapter_start_hook: "已定位来源行；载入正文后补首段承接锚点。",
    chapter_end_hook: "已定位来源行；载入正文后补尾段钩子锚点。",
    selected_version: "source",
    reroll_slots: [
      {
        version_id: "source",
        status: "selected",
        difference_note: "当前来源版本，未生成新候选。"
      }
    ],
    segment_reroll_table: [],
    character_delta_table: [],
    environment_delta_table: [],
    plot_delta_table: [
      {
        plot_node: "正式线来源节点",
        progress: `来源：${node.source_branch}`,
        mainline_impact: "待编辑时细化",
        subplot_impact: "待编辑时细化",
        future_dependency: "后续节点首尾衔接需检查",
        sync_status: "pending"
      }
    ],
    setting_delta_table: [
      {
        setting_type: "source",
        target: node.source_file_name,
        new_detail: `来源行 ${node.source_line_start}-${node.source_line_end}`,
        state_change: "已载入画布索引，未改正文",
        reusable_scope: "本次人偶番外编辑",
        sync_status: "pending"
      }
    ],
    sync_status: "pending",
    canvas_position: {
      x: 80 + ((sequence - 1) % 10) * 300,
      y: 100 + Math.floor((sequence - 1) / 10) * 260
    }
  };
}

function countText(text) {
  const result = spawnSync(process.execPath, [wordCountTool, "--json", "--stdin"], {
    input: text,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "word-count failed");
  }
  return JSON.parse(result.stdout).total.nonspace_count;
}

function splitLines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function findLine(lines, title) {
  const index = lines.findIndex(line => line.trim() === title);
  if (index === -1) {
    throw new Error(`Missing title: ${title}`);
  }
  return index + 1;
}

function firstNonEmptyLine(lines) {
  return lines.map(line => line.trim()).find(Boolean) || "";
}

function stripStats(text) {
  const normalized = Array.isArray(text) ? text.join("\n") : String(text);
  return normalized.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n# 本章字数统计[\s\S]*$/u, "").trim();
}

function countParagraphs(text) {
  const trimmed = stripStats(text);
  if (!trimmed) return 0;
  return trimmed.split(/\n\s*\n/u).filter(part => part.trim()).length;
}
