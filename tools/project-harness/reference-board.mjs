#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_INDEX = "bluespace/refs/_index/reference-index.json";
const DEFAULT_OUTPUT = "bluespace/refs/_review/index.html";
const DATA_FILE_NAME = "reference-data.js";
const MANIFEST_FILE_NAME = "manifest.json";
const GENERATOR_VERSION = 1;
const DATA_SCHEMA_VERSION = 1;
const MANIFEST_SCHEMA_VERSION = 1;

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
  const outputPath = resolveMaybeProjectRelative(opts.output || DEFAULT_OUTPUT);
  const outputDir = dirname(outputPath);
  const dataPath = join(outputDir, DATA_FILE_NAME);
  const manifestPath = join(outputDir, MANIFEST_FILE_NAME);
  const indexText = await readFile(indexPath, "utf8");
  const referenceIndex = JSON.parse(indexText);
  const data = buildData(referenceIndex, indexPath, indexText, outputDir);
  const html = buildHtml();
  const manifest = buildManifest({ outputPath, dataPath, indexPath, indexText, html, data });
  const currentManifest = await readJsonIfExists(manifestPath);
  const fresh = !opts.force && isCacheFresh(currentManifest, manifest, outputPath, dataPath);

  if (opts.dataOnly && !existsSync(outputPath)) {
    throw new Error(`Reference Board page is missing: ${toProjectRel(outputPath)}. Run reference-board once before data-only refresh.`);
  }

  if (fresh) {
    console.log(`Reference Board is current: ${toProjectRel(outputPath)}`);
  } else {
    await writeBundle({ outputPath, dataPath, manifestPath, html, data, manifest, dataOnly: opts.dataOnly });
    if (!opts.dataOnly) console.log(`Wrote ${toProjectRel(outputPath)}`);
    console.log(`Wrote ${toProjectRel(dataPath)}`);
  }

  console.log(
    `References: ${data.assets.length}; selected: ${data.counts.byStatus.selected || 0}; deprecated: ${data.counts.byStatus.deprecated || 0}; governance warnings: ${data.governance.warnings.length}`,
  );
  console.log(pathToFileURL(outputPath).href);
} catch (error) {
  console.error(`reference-board: ${error.message}`);
  process.exit(1);
}

function buildData(referenceIndex, indexPath, indexText, outputDir) {
  const assets = (referenceIndex.assets || []).map((asset) => normalizeAsset(asset, outputDir));
  return {
    kind: "reference_board_data",
    schemaVersion: DATA_SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    generatedAt: new Date().toISOString(),
    projectRoot: normalizeSlashes(projectRoot),
    index: toProjectRel(indexPath),
    indexHash: hashText(indexText),
    sourceGeneratedAt: referenceIndex.generated_at || null,
    refsRoot: referenceIndex.refs_root || null,
    governance: {
      ...(referenceIndex.governance || {}),
      warnings: referenceIndex.governance?.warnings || [],
    },
    rules: referenceIndex.rules || {},
    assets,
    skipped: referenceIndex.skipped || [],
    counts: {
      total: assets.length,
      byEntity: countBy(assets, (asset) => asset.entity),
      byStatus: countBy(assets, (asset) => asset.status),
      byCategory: countBy(assets, (asset) => asset.category),
      byGovernance: countBy(assets, (asset) => asset.governanceSource || "fallback"),
      selected: assets.filter((asset) => asset.status === "selected").length,
      deprecated: assets.filter((asset) => asset.status === "deprecated").length,
      missing: assets.filter((asset) => !asset.exists).length,
    },
  };
}

function normalizeAsset(asset, outputDir) {
  const absPath = resolveMaybeProjectRelative(asset.path);
  const relFromOutput = normalizeSlashes(relative(outputDir, absPath));
  const governance = asset.governance || null;
  const usage = Array.isArray(asset.usage) ? asset.usage : [];
  const cautions = Array.isArray(asset.cautions) ? asset.cautions : [];
  return {
    assetId: asset.asset_id || "",
    entity: asset.entity || "project",
    status: asset.status || "candidate",
    category: asset.category || "loose_reference",
    sourceBucket: asset.source_bucket || "",
    usage,
    priority: asset.priority ?? 99,
    path: asset.path,
    fileName: basename(asset.path || ""),
    imageSrc: encodePathForHtml(relFromOutput),
    fileUrl: pathToFileURL(absPath).href,
    exists: existsSync(absPath),
    notes: asset.notes || "",
    cautions,
    governanceSource: governance?.matched || "fallback",
    governanceId: governance?.id || "",
    searchText: [
      asset.asset_id,
      asset.entity,
      asset.status,
      asset.category,
      asset.source_bucket,
      asset.path,
      asset.notes,
      ...(usage || []),
      ...(cautions || []),
      governance?.matched,
      governance?.id,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

function buildManifest({ outputPath, dataPath, indexPath, indexText, html, data }) {
  return {
    kind: "reference_board_manifest",
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    generatedAt: new Date().toISOString(),
    output: toProjectRel(outputPath),
    data: toProjectRel(dataPath),
    index: toProjectRel(indexPath),
    indexHash: hashText(indexText),
    htmlHash: hashText(html),
    dataHash: hashJson(stableDataForHash(data)),
    counts: data.counts,
    governance: {
      path: data.governance.path || null,
      warnings: data.governance.warnings.length,
      matchedAssets: data.governance.matched_assets || 0,
    },
  };
}

function stableDataForHash(data) {
  const { generatedAt, ...stable } = data;
  return stable;
}

function isCacheFresh(currentManifest, nextManifest, outputPath, dataPath) {
  if (!currentManifest || !existsSync(outputPath) || !existsSync(dataPath)) return false;
  return (
    currentManifest.generatorVersion === nextManifest.generatorVersion &&
    currentManifest.indexHash === nextManifest.indexHash &&
    currentManifest.htmlHash === nextManifest.htmlHash &&
    currentManifest.dataHash === nextManifest.dataHash
  );
}

async function writeBundle({ outputPath, dataPath, manifestPath, html, data, manifest, dataOnly }) {
  await mkdir(dirname(outputPath), { recursive: true });
  if (!dataOnly) await writeFile(outputPath, html, "utf8");
  await writeFile(dataPath, `window.BLUESPACE_REFERENCE_BOARD_DATA = ${JSON.stringify(data, null, 2)};\n`, "utf8");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function readJsonIfExists(pathText) {
  if (!existsSync(pathText)) return null;
  try {
    return JSON.parse(await readFile(pathText, "utf8"));
  } catch {
    return null;
  }
}

function buildHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bluespace Reference Board</title>
  <style>
    :root {
      --bg: #f5f3ef;
      --panel: #ffffff;
      --ink: #242321;
      --muted: #6f6a61;
      --line: #d8d2c8;
      --field: #fbfaf7;
      --selected: #1d7f5b;
      --selected-bg: #e5f4ec;
      --working: #7a5a12;
      --working-bg: #fbf1cc;
      --deprecated: #a43c32;
      --deprecated-bg: #f7e3df;
      --source: #416a84;
      --source-bg: #e3eff5;
      --candidate: #6f6256;
      --candidate-bg: #eee7de;
      --accent: #2f6f73;
      --shadow: 0 10px 24px rgba(48, 44, 38, 0.08);
      color-scheme: light;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.45;
    }
    button, input, select {
      font: inherit;
    }
    button {
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--ink);
      border-radius: 6px;
      min-height: 36px;
      padding: 0 10px;
      cursor: pointer;
    }
    button:hover { border-color: var(--accent); }
    a { color: inherit; }
    .app {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto auto 1fr;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 5;
      background: rgba(245, 243, 239, 0.94);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(8px);
    }
    .topbar {
      max-width: 1500px;
      margin: 0 auto;
      padding: 14px 18px;
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto;
      gap: 16px;
      align-items: center;
    }
    h1 {
      margin: 0;
      font-size: 21px;
      font-weight: 680;
      letter-spacing: 0;
    }
    .subhead {
      margin-top: 3px;
      color: var(--muted);
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .stats {
      max-width: 1500px;
      margin: 0 auto;
      padding: 10px 18px 14px;
      display: grid;
      grid-template-columns: repeat(6, minmax(110px, 1fr));
      gap: 8px;
    }
    .stat {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      padding: 9px 10px;
      min-width: 0;
    }
    .stat-value {
      font-size: 20px;
      font-weight: 720;
    }
    .stat-label {
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .filters-wrap {
      border-bottom: 1px solid var(--line);
      background: #ebe7df;
    }
    .filters {
      max-width: 1500px;
      margin: 0 auto;
      padding: 12px 18px;
      display: grid;
      grid-template-columns: minmax(220px, 1.6fr) repeat(6, minmax(130px, 1fr));
      gap: 10px;
      align-items: end;
    }
    label {
      display: grid;
      gap: 4px;
      color: var(--muted);
      font-size: 12px;
      min-width: 0;
    }
    input, select {
      width: 100%;
      border: 1px solid var(--line);
      background: var(--field);
      color: var(--ink);
      border-radius: 6px;
      min-height: 36px;
      padding: 0 9px;
    }
    main {
      max-width: 1500px;
      width: 100%;
      margin: 0 auto;
      padding: 16px 18px 28px;
    }
    .notice {
      display: none;
      margin-bottom: 12px;
      border: 1px solid var(--deprecated);
      background: var(--deprecated-bg);
      border-radius: 8px;
      padding: 10px 12px;
      color: #5c211c;
    }
    .notice.show { display: block; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
      align-items: start;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: var(--shadow);
      min-width: 0;
    }
    .card.hidden { display: none; }
    .card.selected { border-color: rgba(29, 127, 91, 0.58); }
    .card.deprecated { border-color: rgba(164, 60, 50, 0.68); }
    .media {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 10;
      object-fit: contain;
      background: #ded7cc;
      border-bottom: 1px solid var(--line);
    }
    .missing-media {
      width: 100%;
      aspect-ratio: 16 / 10;
      display: grid;
      place-items: center;
      background: #ddd5c9;
      color: var(--muted);
      border-bottom: 1px solid var(--line);
    }
    .body {
      padding: 11px;
      display: grid;
      gap: 9px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      min-width: 0;
    }
    .title {
      font-weight: 680;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .path {
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      border-radius: 999px;
      padding: 0 8px;
      font-size: 12px;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .badge.selected { background: var(--selected-bg); color: #13543e; border-color: rgba(29, 127, 91, 0.28); }
    .badge.working { background: var(--working-bg); color: #5c4208; border-color: rgba(122, 90, 18, 0.24); }
    .badge.deprecated { background: var(--deprecated-bg); color: #6d251f; border-color: rgba(164, 60, 50, 0.3); }
    .badge.source { background: var(--source-bg); color: #294e63; border-color: rgba(65, 106, 132, 0.25); }
    .badge.derived, .badge.candidate { background: var(--candidate-bg); color: #51473d; border-color: rgba(111, 98, 86, 0.22); }
    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 21px;
      border-radius: 5px;
      padding: 0 6px;
      font-size: 12px;
      background: #f2eee7;
      border: 1px solid var(--line);
      color: #4a4640;
      overflow-wrap: anywhere;
    }
    .note, .caution {
      font-size: 13px;
      color: #37332e;
      overflow-wrap: anywhere;
    }
    .caution {
      border-left: 3px solid var(--deprecated);
      padding-left: 8px;
      color: #5c211c;
    }
    .open-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      padding: 0 9px;
      border: 1px solid var(--line);
      border-radius: 6px;
      text-decoration: none;
      background: var(--field);
    }
    .empty {
      display: none;
      border: 1px dashed var(--line);
      border-radius: 8px;
      padding: 24px;
      color: var(--muted);
      text-align: center;
      background: rgba(255, 255, 255, 0.48);
    }
    .empty.show { display: block; }
    @media (max-width: 1100px) {
      .stats { grid-template-columns: repeat(3, 1fr); }
      .filters { grid-template-columns: repeat(3, minmax(160px, 1fr)); }
      .filters label:first-child { grid-column: 1 / -1; }
    }
    @media (max-width: 720px) {
      .topbar { grid-template-columns: 1fr; }
      .actions { justify-content: flex-start; }
      .stats { grid-template-columns: repeat(2, 1fr); }
      .filters { grid-template-columns: 1fr; }
      main { padding: 12px; }
    }
  </style>
</head>
<body>
  <div class="app">
    <header>
      <div class="topbar">
        <div>
          <h1>Bluespace Reference Board</h1>
          <div class="subhead" id="sourceLine"></div>
        </div>
        <div class="actions">
          <button type="button" id="copyVisible">Copy Visible Paths</button>
          <button type="button" id="resetView">Reset</button>
        </div>
      </div>
      <section class="stats" id="stats"></section>
    </header>
    <section class="filters-wrap">
      <div class="filters">
        <label>Search<input id="search" type="search" autocomplete="off"></label>
        <label>Entity<select id="entity"></select></label>
        <label>Status<select id="status"></select></label>
        <label>Usage<select id="usage"></select></label>
        <label>Governance<select id="governance"></select></label>
        <label>Category<select id="category"></select></label>
        <label>Sort<select id="sort"></select></label>
      </div>
    </section>
    <main>
      <div class="notice" id="warningBox"></div>
      <div class="empty" id="emptyState">No references match the current view.</div>
      <section class="grid" id="grid"></section>
    </main>
  </div>
  <script src="./reference-data.js"></script>
  <script>
(() => {
  const data = window.BLUESPACE_REFERENCE_BOARD_DATA || { assets: [], counts: {}, governance: { warnings: [] } };
  const storageKey = "bluespace.referenceBoard.view.v1";
  const defaultState = {
    search: "",
    entity: "all",
    status: "all",
    usage: "all",
    governance: "all",
    category: "all",
    sort: "priority",
  };
  const els = {
    sourceLine: document.getElementById("sourceLine"),
    stats: document.getElementById("stats"),
    warningBox: document.getElementById("warningBox"),
    grid: document.getElementById("grid"),
    emptyState: document.getElementById("emptyState"),
    search: document.getElementById("search"),
    entity: document.getElementById("entity"),
    status: document.getElementById("status"),
    usage: document.getElementById("usage"),
    governance: document.getElementById("governance"),
    category: document.getElementById("category"),
    sort: document.getElementById("sort"),
    copyVisible: document.getElementById("copyVisible"),
    resetView: document.getElementById("resetView"),
  };
  let state = { ...defaultState, ...loadState() };

  init();

  function init() {
    els.sourceLine.textContent = data.index + " | " + data.assets.length + " refs | source " + (data.sourceGeneratedAt || "unknown");
    renderWarnings();
    populateControls();
    renderCards();
    applyStateToControls();
    bindEvents();
    updateView();
  }

  function renderWarnings() {
    const warnings = data.governance?.warnings || [];
    if (!warnings.length) return;
    els.warningBox.classList.add("show");
    els.warningBox.textContent = warnings.length + " governance warning(s). Refresh or repair reference-governance.json before using these refs as prompt defaults.";
  }

  function populateControls() {
    fillSelect(els.entity, "All entities", unique(data.assets.map((item) => item.entity)));
    fillSelect(els.status, "All statuses", unique(data.assets.map((item) => item.status)));
    fillSelect(els.usage, "All usage", unique(data.assets.flatMap((item) => item.usage || [])));
    fillSelect(els.governance, "All governance", unique(data.assets.map((item) => governanceLabel(item))));
    fillSelect(els.category, "All categories", unique(data.assets.map((item) => item.category)));
    fillSelect(els.sort, "", [
      ["priority", "Priority"],
      ["status", "Status"],
      ["entity", "Entity"],
      ["governance", "Governance"],
      ["path", "Path"],
    ]);
  }

  function fillSelect(select, allLabel, values) {
    select.textContent = "";
    if (allLabel) select.append(option("all", allLabel));
    for (const value of values) {
      if (Array.isArray(value)) select.append(option(value[0], value[1]));
      else select.append(option(value, value));
    }
  }

  function option(value, label) {
    const el = document.createElement("option");
    el.value = value;
    el.textContent = label;
    return el;
  }

  function renderCards() {
    els.grid.innerHTML = ordered(data.assets).map(renderCard).join("");
  }

  function renderCard(item) {
    const status = safeClass(item.status);
    const gov = governanceLabel(item);
    const image = item.exists
      ? '<a href="' + escapeAttr(item.fileUrl) + '"><img class="media" src="' + escapeAttr(item.imageSrc) + '" alt=""></a>'
      : '<div class="missing-media">Missing file</div>';
    const usage = (item.usage || []).map((tag) => '<span class="tag">' + escapeHtml(tag) + '</span>').join("");
    const cautions = (item.cautions || []).map((text) => '<div class="caution">' + escapeHtml(text) + '</div>').join("");
    return '<article class="card ' + status + '" data-search="' + escapeAttr(item.searchText || "") + '" data-entity="' + escapeAttr(item.entity) + '" data-status="' + escapeAttr(item.status) + '" data-category="' + escapeAttr(item.category) + '" data-governance="' + escapeAttr(gov) + '" data-usage="' + escapeAttr((item.usage || []).join("|")) + '">' +
      image +
      '<div class="body">' +
        '<div class="row"><span class="badge ' + status + '">' + escapeHtml(item.status) + '</span><span class="tag">' + escapeHtml(item.entity) + '</span><span class="tag">' + escapeHtml(item.category) + '</span></div>' +
        '<div class="title">' + escapeHtml(item.fileName || item.assetId) + '</div>' +
        '<div class="path">' + escapeHtml(item.path) + '</div>' +
        '<div class="row">' + usage + '</div>' +
        '<div class="note">' + escapeHtml(item.notes || "") + '</div>' +
        cautions +
        '<div class="row"><span class="tag">' + escapeHtml(gov) + '</span><a class="open-link" href="' + escapeAttr(item.fileUrl) + '">Open File</a></div>' +
      '</div>' +
    '</article>';
  }

  function bindEvents() {
    for (const el of [els.search, els.entity, els.status, els.usage, els.governance, els.category, els.sort]) {
      el.addEventListener("input", () => {
        state = readControls();
        saveState();
        updateView();
      });
    }
    els.resetView.addEventListener("click", () => {
      state = { ...defaultState };
      saveState();
      applyStateToControls();
      updateView();
    });
    els.copyVisible.addEventListener("click", async () => {
      const text = visibleAssets().map((item) => item.path).join("\\n");
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        els.copyVisible.textContent = "Copied";
        setTimeout(() => { els.copyVisible.textContent = "Copy Visible Paths"; }, 900);
      } catch {
        window.prompt("Visible reference paths", text);
      }
    });
  }

  function readControls() {
    return {
      search: els.search.value.trim().toLowerCase(),
      entity: els.entity.value,
      status: els.status.value,
      usage: els.usage.value,
      governance: els.governance.value,
      category: els.category.value,
      sort: els.sort.value,
    };
  }

  function applyStateToControls() {
    els.search.value = state.search || "";
    for (const key of ["entity", "status", "usage", "governance", "category", "sort"]) {
      if ([...els[key].options].some((item) => item.value === state[key])) els[key].value = state[key];
      else els[key].value = defaultState[key];
    }
  }

  function updateView() {
    const visible = new Set(visibleAssets().map((item) => item.assetId));
    document.querySelectorAll(".card").forEach((card) => {
      const title = card.querySelector(".path")?.textContent || "";
      const asset = data.assets.find((item) => item.path === title);
      card.classList.toggle("hidden", !asset || !visible.has(asset.assetId));
    });
    els.emptyState.classList.toggle("show", visible.size === 0);
    renderStats([...visible].map((id) => data.assets.find((item) => item.assetId === id)).filter(Boolean));
  }

  function visibleAssets() {
    return ordered(data.assets.filter(matchesState));
  }

  function matchesState(item) {
    if (state.entity !== "all" && item.entity !== state.entity) return false;
    if (state.status !== "all" && item.status !== state.status) return false;
    if (state.category !== "all" && item.category !== state.category) return false;
    if (state.governance !== "all" && governanceLabel(item) !== state.governance) return false;
    if (state.usage !== "all" && !(item.usage || []).includes(state.usage)) return false;
    if (state.search && !(item.searchText || "").includes(state.search)) return false;
    return true;
  }

  function ordered(items) {
    const sort = state.sort || "priority";
    return [...items].sort((a, b) => {
      if (sort === "priority") return (a.priority - b.priority) || a.path.localeCompare(b.path);
      if (sort === "status") return statusRank(a.status) - statusRank(b.status) || a.path.localeCompare(b.path);
      if (sort === "entity") return (a.entity + a.path).localeCompare(b.entity + b.path);
      if (sort === "governance") return governanceLabel(a).localeCompare(governanceLabel(b)) || a.path.localeCompare(b.path);
      return a.path.localeCompare(b.path);
    });
  }

  function renderStats(items) {
    const selected = items.filter((item) => item.status === "selected").length;
    const deprecated = items.filter((item) => item.status === "deprecated").length;
    const governed = items.filter((item) => item.governanceSource !== "fallback").length;
    const missing = items.filter((item) => !item.exists).length;
    const stats = [
      ["Visible", items.length],
      ["Selected", selected],
      ["Deprecated", deprecated],
      ["Governed", governed],
      ["Warnings", data.governance?.warnings?.length || 0],
      ["Missing", missing],
    ];
    els.stats.innerHTML = stats.map(([label, value]) => '<div class="stat"><div class="stat-value">' + value + '</div><div class="stat-label">' + label + '</div></div>').join("");
  }

  function governanceLabel(item) {
    return item.governanceId ? item.governanceSource + ":" + item.governanceId : item.governanceSource || "fallback";
  }

  function statusRank(status) {
    return { selected: 1, working: 2, derived: 3, source: 4, candidate: 5, deprecated: 6 }[status] || 9;
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  }

  function safeClass(text) {
    return String(text || "").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { return {}; }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function escapeHtml(text) {
    return String(text || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function escapeAttr(text) {
    return escapeHtml(text).replace(/\\n/g, " ");
  }
})();
  </script>
</body>
</html>
`;
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

function hashJson(payload) {
  return hashText(JSON.stringify(payload));
}

function encodePathForHtml(pathText) {
  return normalizeSlashes(pathText)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
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
    output: null,
    force: false,
    dataOnly: false,
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
    else if (key === "--index") parsed.index = readValue();
    else if (key === "--output") parsed.output = readValue();
    else if (arg === "--force") parsed.force = true;
    else if (arg === "--data-only") parsed.dataOnly = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printHelp() {
  process.stdout.write(`Bluespace reference board generator

Usage:
  node tools/project-harness/reference-board.mjs [options]
  tools/project-harness/reference-board.ps1 [options]
  tools/project-harness/reference-board.sh [options]

Options:
  --project-root <path>    Defaults to the nearest trae_projects root.
  --index <path>           Defaults to bluespace/refs/_index/reference-index.json.
  --output <path>          Defaults to bluespace/refs/_review/index.html.
  --data-only              Refresh data and manifest without rewriting the page shell.
  --force                  Rewrite even when manifest says the bundle is fresh.
  -h, --help               Show this help.
`);
}
