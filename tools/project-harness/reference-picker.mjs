#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_INDEX = "bluespace/refs/_index/reference-index.json";

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
  const indexPath = resolveMaybeProjectRelative(opts.index || DEFAULT_INDEX);
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  const result = buildPickerResult(index, indexPath);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (opts.pathsOnly) {
    console.log(result.assets.map((asset) => asset.path).join("\n"));
  } else {
    console.log(buildMarkdown(result));
  }
} catch (error) {
  console.error(`reference-picker: ${error.message}`);
  process.exit(1);
}

function buildPickerResult(index, indexPath) {
  const assets = (index.assets || [])
    .filter((asset) => matchesFilters(asset))
    .sort(compareReferencePriority)
    .slice(0, opts.limit || undefined)
    .map(normalizeAsset);

  return {
    kind: "bluespace_prompt_reference_picker",
    schema_version: 1,
    generated_at: new Date().toISOString(),
    index: toProjectRel(indexPath),
    source_generated_at: index.generated_at || null,
    filters: {
      entity: opts.entity,
      status: opts.status,
      usage: opts.usage,
      category: opts.category,
      governance: opts.governance,
      governance_id: opts.governanceId,
      include_deprecated: opts.includeDeprecated,
      limit: opts.limit,
    },
    counts: {
      matched: assets.length,
      source_assets: Array.isArray(index.assets) ? index.assets.length : 0,
      governance_warnings: index.governance?.warnings?.length || 0,
      by_entity: countBy(assets, (asset) => asset.entity),
      by_status: countBy(assets, (asset) => asset.status),
      by_usage: countUsage(assets),
    },
    assets,
    prompt_block: buildPromptBlock(assets),
    cautions: buildGlobalCautions(assets),
  };
}

function matchesFilters(asset) {
  if (!opts.includeDeprecated && asset.status === "deprecated") return false;
  if (opts.entity.length > 0 && !opts.entity.includes(asset.entity)) return false;
  if (opts.status.length > 0) {
    if (!opts.status.includes(asset.status)) return false;
  } else if (asset.status !== "selected") {
    return false;
  }
  if (opts.usage.length > 0 && !opts.usage.some((usage) => (asset.usage || []).includes(usage))) return false;
  if (opts.category.length > 0 && !opts.category.includes(asset.category)) return false;
  if (opts.governance.length > 0 && !opts.governance.includes(asset.governance?.matched || "fallback")) return false;
  if (opts.governanceId.length > 0 && !opts.governanceId.includes(asset.governance?.id || "")) return false;
  if (!opts.includeMissing && !existsSync(resolveMaybeProjectRelative(asset.path))) return false;
  return true;
}

function normalizeAsset(asset) {
  return {
    asset_id: asset.asset_id || "",
    entity: asset.entity || "project",
    status: asset.status || "candidate",
    category: asset.category || "loose_reference",
    usage: asset.usage || [],
    priority: asset.priority ?? 99,
    path: asset.path,
    exists: existsSync(resolveMaybeProjectRelative(asset.path)),
    notes: asset.notes || "",
    cautions: asset.cautions || [],
    governance: asset.governance || { matched: "fallback", id: null },
  };
}

function compareReferencePriority(a, b) {
  return (
    statusRank(a.status) - statusRank(b.status) ||
    (a.priority ?? 99) - (b.priority ?? 99) ||
    String(a.entity || "").localeCompare(String(b.entity || "")) ||
    String(a.category || "").localeCompare(String(b.category || "")) ||
    String(a.path || "").localeCompare(String(b.path || ""))
  );
}

function statusRank(status) {
  return { selected: 1, working: 2, derived: 3, source: 4, candidate: 5, deprecated: 9 }[status] || 8;
}

function buildPromptBlock(assets) {
  return assets.map((asset) => {
    const usage = asset.usage.length ? asset.usage.join(", ") : "visual_reference";
    return {
      usage,
      path: asset.path,
      instruction: buildPromptInstruction(asset),
      avoid: asset.cautions,
    };
  });
}

function buildPromptInstruction(asset) {
  const note = asset.notes ? ` ${asset.notes}` : "";
  if (asset.status === "deprecated") return `Trace-only reference. Do not use as current prompt reference.${note}`;
  if (asset.status === "selected") return `Use as controlled ${asset.category} reference for ${asset.entity}.${note}`;
  return `Use only as supporting ${asset.status} reference for ${asset.entity}; verify against selected refs first.${note}`;
}

function buildGlobalCautions(assets) {
  const cautions = [];
  if (assets.some((asset) => asset.status === "deprecated")) {
    cautions.push("包含 deprecated 参考；默认不要喂给当前生成，只能用于问题追溯。");
  }
  const loose = assets.filter((asset) => asset.governance?.matched === "fallback");
  if (loose.length > 0) {
    cautions.push("部分参考来自 fallback 分类；关键生成前应核对 reference-governance.json 或目录说明。");
  }
  return [...new Set(cautions)];
}

function buildMarkdown(result) {
  const lines = [
    "# Prompt Reference Picker",
    "",
    `- Index: \`${result.index}\``,
    `- Matched: ${result.counts.matched}`,
    `- Governance warnings: ${result.counts.governance_warnings}`,
    "",
  ];

  if (result.assets.length === 0) {
    lines.push("No references matched the current filters.");
    return `${lines.join("\n").trimEnd()}\n`;
  }

  lines.push("## References", "");
  for (const asset of result.assets) {
    const governance = asset.governance?.id ? `${asset.governance.matched}:${asset.governance.id}` : asset.governance?.matched || "fallback";
    lines.push(`- \`${asset.path}\``);
    lines.push(`  - entity/status/category: ${asset.entity} / ${asset.status} / ${asset.category}`);
    lines.push(`  - usage: ${asset.usage.join(", ") || "visual_reference"}`);
    lines.push(`  - governance: ${governance}`);
    if (asset.notes) lines.push(`  - notes: ${asset.notes}`);
    if (asset.cautions.length > 0) lines.push(`  - cautions: ${asset.cautions.join("; ")}`);
  }

  lines.push("", "## Prompt Reference Block", "");
  for (const item of result.prompt_block) {
    lines.push(`- ${item.usage}: \`${item.path}\``);
    lines.push(`  - ${item.instruction}`);
    if (item.avoid.length > 0) lines.push(`  - Avoid: ${item.avoid.join("; ")}`);
  }

  if (result.cautions.length > 0) {
    lines.push("", "## Global Cautions", "");
    for (const caution of result.cautions) lines.push(`- ${caution}`);
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

function countUsage(items) {
  const counts = {};
  for (const item of items) {
    for (const usage of item.usage || []) counts[usage] = (counts[usage] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
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
  if (isAbsolute(pathText) || /^[A-Za-z]:[\\/]/.test(pathText)) return resolve(pathText);
  return resolve(projectRoot, pathText.replace(/^\.?[\\/]/, ""));
}

function toProjectRel(pathText) {
  const rel = relative(projectRoot, resolve(pathText));
  return normalizeSlashes(rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : pathText);
}

function normalizeSlashes(pathText) {
  return String(pathText || "").replace(/\\/g, "/");
}

function parseArgs(args) {
  const parsed = {
    help: false,
    projectRoot: null,
    index: null,
    json: false,
    pathsOnly: false,
    includeDeprecated: false,
    includeMissing: false,
    limit: null,
    entity: [],
    status: [],
    usage: [],
    category: [],
    governance: [],
    governanceId: [],
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
    const readList = () => splitList(readValue());

    if (arg === "-h" || arg === "--help") parsed.help = true;
    else if (key === "--project-root") parsed.projectRoot = readValue();
    else if (key === "--index") parsed.index = readValue();
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--paths-only") parsed.pathsOnly = true;
    else if (arg === "--include-deprecated") parsed.includeDeprecated = true;
    else if (arg === "--include-missing") parsed.includeMissing = true;
    else if (key === "--limit") parsed.limit = Number(readValue());
    else if (key === "--entity") parsed.entity.push(...readList());
    else if (key === "--status") parsed.status.push(...readList());
    else if (key === "--usage") parsed.usage.push(...readList());
    else if (key === "--category") parsed.category.push(...readList());
    else if (key === "--governance") parsed.governance.push(...readList());
    else if (key === "--governance-id") parsed.governanceId.push(...readList());
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (parsed.limit !== null && (!Number.isFinite(parsed.limit) || parsed.limit <= 0)) {
    throw new Error("--limit must be a positive number.");
  }
  for (const key of ["entity", "status", "usage", "category", "governance", "governanceId"]) {
    parsed[key] = [...new Set(parsed[key].filter(Boolean))];
  }

  return parsed;
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function printHelp() {
  process.stdout.write(`Bluespace prompt reference picker

Usage:
  node tools/project-harness/reference-picker.mjs [options]
  tools/project-harness/reference-picker.ps1 [options]
  tools/project-harness/reference-picker.sh [options]

Default behavior:
  Picks existing status=selected references only. Deprecated assets are excluded unless
  --include-deprecated is explicitly set.

Options:
  --project-root <path>       Defaults to the nearest trae_projects root.
  --index <path>              Defaults to bluespace/refs/_index/reference-index.json.
  --entity <name[,name]>      Filter by entity, such as oldA or shuttle.
  --status <name[,name]>      Filter by status. Defaults to selected.
  --usage <name[,name]>       Filter by usage, such as prompt_reference.
  --category <name[,name]>    Filter by category.
  --governance <source>       Filter by governance source: asset, rule, fallback.
  --governance-id <id>        Filter by exact governance id.
  --limit <number>            Limit returned references.
  --include-deprecated        Allow deprecated references when status filter matches.
  --include-missing           Include indexed files that are missing on disk.
  --paths-only                Print only project-relative paths.
  --json                      Print machine-readable JSON.
  -h, --help                  Show this help.
`);
}
