#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const DEFAULT_REFS_ROOT = "bluespace/refs";
const DEFAULT_GOVERNANCE = "bluespace/refs/_index/reference-governance.json";
const DEFAULT_OUTPUT = "bluespace/refs/_index/reference-index.json";
const DEFAULT_MARKDOWN_OUTPUT = "bluespace/refs/_index/reference-index.md";

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
const refsRoot = resolveProjectPath(opts.refsRoot || DEFAULT_REFS_ROOT);
const governancePath = resolveProjectPath(opts.governance || DEFAULT_GOVERNANCE);
const outputPath = resolveProjectPath(opts.output || DEFAULT_OUTPUT);
const markdownOutputPath = resolveProjectPath(opts.markdownOutput || DEFAULT_MARKDOWN_OUTPUT);

try {
  const index = await buildReferenceIndex();
  const markdown = buildMarkdown(index);
  if (opts.json || opts.dryRun) {
    console.log(JSON.stringify(index, null, 2));
  }
  if (!opts.dryRun) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    await writeFile(markdownOutputPath, markdown, "utf8");
  }
  if (!opts.json && !opts.dryRun) {
    console.log(`Wrote ${toProjectRel(outputPath)}`);
    console.log(`Wrote ${toProjectRel(markdownOutputPath)}`);
    console.log(`Assets: ${index.assets.length}; skipped: ${index.skipped.length}`);
    if (index.governance.warnings.length > 0) {
      console.log(`Governance warnings: ${index.governance.warnings.length}`);
    }
  }
} catch (error) {
  console.error(`reference-index: ${error.message}`);
  process.exit(1);
}

async function buildReferenceIndex() {
  if (!existsSync(refsRoot)) throw new Error(`Refs root does not exist: ${toProjectRel(refsRoot)}`);

  const files = await walkFiles(refsRoot);
  const fileLookup = buildFileLookup(files);
  const governance = await loadReferenceGovernance();
  const governanceWarnings = validateGovernance(governance, fileLookup);
  const assets = [];
  const skipped = [];

  for (const filePath of files) {
    const rel = toProjectRel(filePath);
    const refsRel = normalizeSlashes(relative(refsRoot, filePath));
    const ext = extname(filePath).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;

    const classification = classifyReference(refsRel, rel, governance);
    if (!classification.include) {
      skipped.push({
        path: rel,
        reason: classification.reason,
        governance: classification.governance || null,
      });
      continue;
    }

    const asset = {
      schema_version: 1,
      asset_id: `ref_${classification.entity.toLowerCase()}_${classification.status}_${hashText(rel).slice(0, 8)}`.replace(
        /[^a-z0-9_]+/g,
        "_",
      ),
      scope: "project",
      category: classification.category,
      entity: classification.entity,
      status: classification.status,
      path: rel,
      usage: classification.usage,
      priority: classification.priority,
      source_bucket: classification.sourceBucket,
      notes: classification.notes,
      cautions: classification.cautions,
    };
    if (classification.governance) asset.governance = classification.governance;
    assets.push(asset);
  }

  assets.sort((a, b) =>
    [a.entity, a.status, a.priority, a.path].join("|").localeCompare([b.entity, b.status, b.priority, b.path].join("|")),
  );

  return {
    kind: "bluespace_reference_index",
    schema_version: 1,
    generated_at: new Date().toISOString(),
    refs_root: toProjectRel(refsRoot),
    governance: {
      path: toProjectRel(governance.path),
      exists: governance.exists,
      schema_version: governance.schema_version,
      assets: governance.assets.length,
      rules: governance.rules.length,
      matched_assets: assets.filter((asset) => asset.governance).length,
      warnings: governanceWarnings,
    },
    output: toProjectRel(outputPath),
    markdown_output: toProjectRel(markdownOutputPath),
    counts: {
      assets: assets.length,
      skipped: skipped.length,
      by_entity: countBy(assets, (item) => item.entity),
      by_status: countBy(assets, (item) => item.status),
      by_category: countBy(assets, (item) => item.category),
      by_governance: countBy(assets, (item) => item.governance?.matched || "fallback"),
    },
    rules: {
      selected: "正式选定或优先参考，可作为 prompt/reference 的稳定入口。",
      derived: "项目内衍生候选，使用前需要确认它不覆盖 selected 参考。",
      working: "临时推敲或检查材料，不默认作为强参考。",
      source: "原始来源或辅助源图，用于追溯，不默认替代 selected。",
      deprecated: "已被文档或用户判断废弃，只用于问题追溯。",
      excluded: "review/contact/preview/compare/log/script 等派生检查材料默认不进入 reference index。",
    },
    assets,
    skipped,
  };
}

async function loadReferenceGovernance() {
  if (!existsSync(governancePath)) {
    return {
      exists: false,
      path: governancePath,
      schema_version: null,
      assets: [],
      rules: [],
    };
  }

  const payload = JSON.parse(await readFile(governancePath, "utf8"));
  return {
    exists: true,
    path: governancePath,
    schema_version: payload.schema_version || null,
    assets: Array.isArray(payload.assets) ? payload.assets : [],
    rules: Array.isArray(payload.rules) ? payload.rules : [],
  };
}

function classifyReference(refsRel, projectRel, governance) {
  const exact = findExactGovernanceAsset(projectRel, refsRel, governance);
  if (exact) {
    return normalizeGovernanceClassification(exact, {
      matched: "asset",
      id: exact.id || exact.path || exact.refs_path,
    });
  }

  const base = classifyReferenceByPath(refsRel);
  return applyGovernanceRules(base, projectRel, refsRel, governance);
}

function classifyReferenceByPath(refsRel) {
  const normalized = normalizeSlashes(refsRel);
  const lower = normalized.toLowerCase();
  const parts = normalized.split("/");
  const file = basename(normalized);

  if (lower.includes("/review/")) return { include: false, reason: "review_derivative" };
  if (lower.includes("/logs/") || lower.includes("/scripts/")) return { include: false, reason: "tooling_or_log" };
  if (
    lower.includes("contact_sheet") ||
    lower.includes("preview_sheet") ||
    lower.includes("compare") ||
    lower.includes("text_test")
  ) {
    return { include: false, reason: "comparison_or_preview" };
  }

  if (parts[0] === "characters" && parts[1]) {
    const entity = parts[1];
    const bucket = parts[2] || "root";
    if (bucket === "selected") {
      return selectedCharacterReference(entity, file);
    }
    if (bucket === "derived") {
      return {
        include: true,
        entity,
        category: "character_design",
        status: "derived",
        sourceBucket: bucket,
        usage: ["candidate_reference"],
        priority: 4,
        notes: "角色衍生候选；使用前先与 selected 参考核对。",
        cautions: ["不应覆盖 selected 身份、裂纹地图或构图参考。"],
      };
    }
    if (bucket === "damage_standard") {
      return damageStandardReference(entity, normalized);
    }
  }

  if (parts[0] === "shuttle") {
    const status = lower.includes("/source_refs/") ? "source" : lower.includes("multiview") ? "working" : "selected";
    return {
      include: true,
      entity: "shuttle",
      category: "vehicle_design",
      status,
      sourceBucket: parts[1] || "root",
      usage: status === "source" ? ["source_reference"] : ["vehicle_reference", "prompt_reference"],
      priority: status === "selected" ? 2 : status === "working" ? 4 : 5,
      notes:
        status === "selected"
          ? "穿梭机本地标准参考；核心母版仍以 t3-art/concepts/current 中的穿梭机参考为准。"
          : "穿梭机来源或检查材料。",
      cautions: status === "selected" ? ["不能覆盖 t3-art/concepts/current 的核心母版。"] : ["确认前不替代核心母版。"],
    };
  }

  if (parts[0] === "4D" || parts[0] === "_working") {
    return {
      include: true,
      entity: "4D",
      category: "spatial_effect",
      status: parts[0] === "4D" ? "selected" : "working",
      sourceBucket: parts[0],
      usage: ["spatial_effect_reference", "style_reference"],
      priority: parts[0] === "4D" ? 3 : 5,
      notes: "四维线场、空间异常或视觉风格参考。",
      cautions: ["只控制 4D/空间效果语言，不负责角色身份或镜头构图。"],
    };
  }

  return {
    include: true,
    entity: "project",
    category: "loose_reference",
    status: "candidate",
    sourceBucket: "refs_root",
    usage: ["visual_reference"],
    priority: 6,
    notes: "refs 根目录中的散装参考；后续应归类到角色、载具、4D 或 _working。",
    cautions: ["未归类参考不应作为强参考直接喂给模型。"],
  };
}

function selectedCharacterReference(entity, file) {
  const lowerFile = file.toLowerCase();
  if (lowerFile.includes("composite") || lowerFile.includes("crack_style")) {
    return {
      include: true,
      entity,
      category: "helmet_material",
      status: "selected",
      sourceBucket: "selected",
      usage: ["material_reference", "visor_crack_style"],
      priority: 2,
      notes: "老A破损面罩复合材质裂纹效果参考。",
      cautions: ["只控制裂纹材质语言，不负责镜头机位、裂缝地图或脸部身份。"],
    };
  }
  return {
    include: true,
    entity,
    category: "helmet_damage_continuity",
    status: "selected",
    sourceBucket: "selected",
    usage: ["helmet_damage_reference", "prompt_reference"],
    priority: 1,
    notes: "老A破损头盔裂缝地图和多角度连续性首选参考。",
    cautions: ["不负责具体镜头机位；脸部身份仍应结合 Image 266。"],
  };
}

function damageStandardReference(entity, refsRel) {
  const lower = refsRel.toLowerCase();
  if (lower.includes("re_detail")) {
    return {
      include: true,
      entity,
      category: "armor_damage_standard",
      status: "deprecated",
      sourceBucket: "damage_standard",
      usage: ["trace_only"],
      priority: 9,
      notes: "老A战甲损伤 re-detail 历史链路；当前 selected_reference.md 已说明旧 re-detail 选择不再作为标准。",
      cautions: ["只用于问题追溯，不要作为当前战甲或头盔损伤参考。"],
    };
  }
  const isSelected = lower.includes("selected") || lower.endsWith("olda_original_armor_damage_identity_image2_v001d.png");
  return {
    include: true,
    entity,
    category: "armor_damage_standard",
    status: isSelected ? "selected" : "derived",
    sourceBucket: "damage_standard",
    usage: ["armor_damage_reference", "continuity_reference"],
    priority: isSelected ? 2 : 5,
    notes: isSelected ? "老A当前阶段战甲损伤选定参考或其原始选定输出。" : "老A战甲损伤候选或历史生成输出。",
    cautions: isSelected
      ? ["不替代脸部身份参考；使用前确认当前镜头是否仍沿用这一阶段战甲。"]
      : ["未选定或历史候选不能直接覆盖当前 damage standard。"],
  };
}

function findExactGovernanceAsset(projectRel, refsRel, governance) {
  return governance.assets.find((item) => {
    if (item.enabled === false) return false;
    const candidates = [item.path, item.refs_path].filter(Boolean);
    return candidates.some((candidate) => pathMatches(candidate, projectRel, refsRel));
  });
}

function applyGovernanceRules(base, projectRel, refsRel, governance) {
  const rule = findMatchingGovernanceRule(governance.rules, projectRel, refsRel, base);
  if (!rule) return base;

  const patch = rule.classification || rule;
  const marker = {
    matched: "rule",
    id: rule.id || null,
  };

  if (patch.include === false) {
    return {
      include: false,
      reason: patch.reason || rule.reason || rule.id || "governance_rule",
      governance: marker,
    };
  }

  if (!base.include) return base;

  const merged = { ...base };
  for (const key of ["entity", "category", "status", "notes"]) {
    if (patch[key] !== undefined) merged[key] = patch[key];
  }
  if (patch.source_bucket !== undefined || patch.sourceBucket !== undefined) {
    merged.sourceBucket = patch.source_bucket || patch.sourceBucket;
  }
  if (patch.priority !== undefined) merged.priority = Number(patch.priority);
  if (patch.usage !== undefined) merged.usage = asArray(patch.usage);
  if (patch.append_usage !== undefined) merged.usage = unique([...merged.usage, ...asArray(patch.append_usage)]);
  if (patch.cautions !== undefined) merged.cautions = asArray(patch.cautions);
  if (patch.append_cautions !== undefined) merged.cautions = unique([...merged.cautions, ...asArray(patch.append_cautions)]);
  merged.governance = marker;
  return merged;
}

function normalizeGovernanceClassification(item, marker) {
  if (item.include === false) {
    return {
      include: false,
      reason: item.reason || item.id || "governance_asset",
      governance: marker,
    };
  }

  return {
    include: true,
    entity: item.entity || "project",
    category: item.category || "loose_reference",
    status: item.status || "candidate",
    sourceBucket: item.source_bucket || item.sourceBucket || inferSourceBucket(item.path || item.refs_path),
    usage: asArray(item.usage, ["visual_reference"]),
    priority: item.priority !== undefined ? Number(item.priority) : 6,
    notes: item.notes || "",
    cautions: asArray(item.cautions),
    governance: marker,
  };
}

function findMatchingGovernanceRule(rules, projectRel, refsRel, base) {
  return rules.find((rule) => {
    if (rule.enabled === false) return false;
    return matchesGovernanceRule(rule, projectRel, refsRel, base);
  });
}

function matchesGovernanceRule(rule, projectRel, refsRel, base) {
  const match = rule.match || {};
  if (match.entity && !asArray(match.entity).includes(base.entity)) return false;
  if (match.status && !asArray(match.status).includes(base.status)) return false;
  if (match.category && !asArray(match.category).includes(base.category)) return false;

  if (match.path && !pathMatches(match.path, projectRel, refsRel)) return false;
  if (match.path_prefix && !pathHasPrefix(match.path_prefix, projectRel, refsRel)) return false;
  if (match.path_ends_with && !pathEndsWith(match.path_ends_with, projectRel, refsRel)) return false;

  if (match.path_contains) {
    const tokens = asArray(match.path_contains).map((item) => normalizeLookupPath(item));
    if (!tokens.every((token) => pathTargets(projectRel, refsRel).some((target) => target.includes(token)))) return false;
  }

  if (match.path_contains_any) {
    const tokens = asArray(match.path_contains_any).map((item) => normalizeLookupPath(item));
    if (!tokens.some((token) => pathTargets(projectRel, refsRel).some((target) => target.includes(token)))) return false;
  }

  if (match.path_regex) {
    const pattern = new RegExp(match.path_regex, "i");
    if (!pathTargets(projectRel, refsRel).some((target) => pattern.test(target))) return false;
  }

  return true;
}

function validateGovernance(governance, fileLookup) {
  const warnings = [];
  if (!governance.exists) {
    warnings.push({
      code: "missing_governance_file",
      message: `Reference governance file not found: ${toProjectRel(governance.path)}`,
    });
    return warnings;
  }

  for (const item of governance.assets) {
    const candidates = [item.path, item.refs_path].filter(Boolean);
    if (candidates.length === 0) {
      warnings.push({
        code: "governance_asset_missing_path",
        id: item.id || null,
        message: "Governance asset has no path or refs_path.",
      });
      continue;
    }
    if (!candidates.some((candidate) => fileLookup.has(normalizeLookupPath(candidate)))) {
      warnings.push({
        code: "governance_asset_not_found",
        id: item.id || null,
        path: candidates[0],
        message: `Governance asset path was not found: ${candidates[0]}`,
      });
    }
  }

  return warnings;
}

function buildMarkdown(index) {
  const lines = [
    "---",
    "description: Bluespace reference index generated from refs/.",
    `updated: ${new Date().toISOString().slice(0, 10)}`,
    "---",
    "",
    "# Reference Index",
    "",
    "这个文件由 `tools/project-harness/reference-index.*` 生成。它是参考图治理的轻量入口，正式边界来自 `reference-governance.json` 与各目录 README，用户最新判断优先。",
    "",
    "## Summary",
    "",
    `- Assets: ${index.assets.length}`,
    `- Skipped derived checks: ${index.skipped.length}`,
    `- Governance file: ${index.governance.exists ? index.governance.path : "missing"}`,
    `- Governance assets: ${index.governance.assets}`,
    `- Governance rules: ${index.governance.rules}`,
    `- Governance matched assets: ${index.governance.matched_assets}`,
    `- Governance warnings: ${index.governance.warnings.length}`,
    "",
    "## Counts",
    "",
    "### By Entity",
    "",
    ...countLines(index.counts.by_entity),
    "",
    "### By Status",
    "",
    ...countLines(index.counts.by_status),
    "",
    "### By Governance Source",
    "",
    ...countLines(index.counts.by_governance),
  ];

  if (index.governance.warnings.length > 0) {
    lines.push("", "## Governance Warnings", "");
    for (const warning of index.governance.warnings) {
      lines.push(`- ${warning.code}: ${warning.path || warning.id || warning.message}`);
    }
  }

  lines.push(
    "",
    "## Selected References",
    "",
    "| Asset | Entity | Category | Usage | Governance | Path | Cautions |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );

  for (const item of index.assets.filter((asset) => asset.status === "selected")) {
    lines.push(
      `| ${item.asset_id} | ${item.entity} | ${item.category} | ${item.usage.join(", ")} | ${governanceLabel(item)} | \`${item.path}\` | ${item.cautions.join("; ")} |`,
    );
  }

  lines.push(
    "",
    "## All Assets",
    "",
    "| Asset | Status | Entity | Category | Governance | Path |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const item of index.assets) {
    lines.push(`| ${item.asset_id} | ${item.status} | ${item.entity} | ${item.category} | ${governanceLabel(item)} | \`${item.path}\` |`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function governanceLabel(item) {
  if (!item.governance) return "fallback";
  return item.governance.id ? `${item.governance.matched}:${item.governance.id}` : item.governance.matched;
}

function countLines(counts) {
  return Object.entries(counts).map(([key, value]) => `- ${key}: ${value}`);
}

async function walkFiles(root) {
  const result = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walkFiles(fullPath)));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result;
}

function buildFileLookup(files) {
  const lookup = new Set();
  for (const filePath of files) {
    lookup.add(normalizeLookupPath(toProjectRel(filePath)));
    lookup.add(normalizeLookupPath(relative(refsRoot, filePath)));
  }
  return lookup;
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

function inferSourceBucket(pathText) {
  const normalized = normalizeSlashes(pathText || "");
  const parts = normalized.split("/");
  const refsIndex = parts.findIndex((part) => part === "refs");
  if (refsIndex >= 0 && parts[refsIndex + 1]) return parts[refsIndex + 1];
  return parts[0] || "refs_root";
}

function asArray(value, fallback = []) {
  if (value === undefined || value === null) return fallback;
  return Array.isArray(value) ? value : [value];
}

function unique(items) {
  return [...new Set(items.filter((item) => item !== undefined && item !== null && item !== ""))];
}

function pathTargets(projectRel, refsRel) {
  return [projectRel, refsRel].filter(Boolean).map((item) => normalizeLookupPath(item));
}

function pathMatches(candidate, projectRel, refsRel) {
  const normalized = normalizeLookupPath(candidate);
  return pathTargets(projectRel, refsRel).some((target) => target === normalized);
}

function pathHasPrefix(candidate, projectRel, refsRel) {
  const normalized = normalizeLookupPath(candidate);
  return pathTargets(projectRel, refsRel).some((target) => target.startsWith(normalized));
}

function pathEndsWith(candidate, projectRel, refsRel) {
  const normalized = normalizeLookupPath(candidate);
  return pathTargets(projectRel, refsRel).some((target) => target.endsWith(normalized));
}

function normalizeLookupPath(pathText) {
  return normalizeSlashes(String(pathText || ""))
    .replace(/^\.?\//, "")
    .toLowerCase();
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
    refsRoot: null,
    governance: null,
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
    else if (key === "--refs-root") parsed.refsRoot = readValue();
    else if (key === "--governance") parsed.governance = readValue();
    else if (key === "--output") parsed.output = readValue();
    else if (key === "--markdown-output") parsed.markdownOutput = readValue();
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--json") parsed.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function printHelp() {
  process.stdout.write(`Bluespace reference index generator

Usage:
  node tools/project-harness/reference-index.mjs [options]
  tools/project-harness/reference-index.ps1 [options]
  tools/project-harness/reference-index.sh [options]

Options:
  --project-root <path>       Defaults to the nearest trae_projects root.
  --refs-root <path>          Defaults to bluespace/refs.
  --governance <path>         Defaults to bluespace/refs/_index/reference-governance.json.
  --output <path>             Defaults to bluespace/refs/_index/reference-index.json.
  --markdown-output <path>    Defaults to bluespace/refs/_index/reference-index.md.
  --dry-run                   Print JSON without writing files.
  --json                      Print machine-readable JSON.
  -h, --help                  Show this help.
`);
}
