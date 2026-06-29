#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultStoryRoot, publicAssetsPath, storyCanvasHost, storyCanvasPort } from "./story-canvas.config.mjs";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "../../..");
const requestedPort = process.env.STORY_CANVAS_PORT || process.argv.find(arg => arg.startsWith("--port="))?.split("=")[1] || "";
if (requestedPort && Number(requestedPort) !== storyCanvasPort) {
  console.warn(`Story Canvas uses fixed port ${storyCanvasPort}; ignoring requested port ${requestedPort}.`);
}
const port = storyCanvasPort;
const host = storyCanvasHost;
const defaultRoot = defaultStoryRoot;

const generationRulePackId = "kva-longform-generation-v1";
const generationRulePack = {
  id: generationRulePackId,
  applies_rules: [
    "story-canvas",
    "longform-generation",
    "chapter-relay-card",
    "four-ledgers",
    "scene-state-change",
    "chapter-end-handoff"
  ],
  priority_order: [
    "later_direct_user_instruction",
    "web_reroll_box_user_directive",
    "locked_story_facts",
    "story_card_and_longform_rules",
    "default_style_preferences"
  ],
  conflict_policy: "用户后续直接意见优先；其次执行网页重构框意见。若与故事卡/四账本/长篇生成规则冲突，按用户具体意见执行，并在生成说明中标出冲突。"
};

const textExtensions = new Set([".md", ".markdown", ".txt", ".text"]);
const skipDirs = new Set([
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "_ledger",
  "_pipeline",
  "review",
  "refs",
  "prompts",
  "trash",
  "设定"
]);
const geminiAgentIds = new Set(["gemini-flash-latest", "gemini-3.5-flash"]);
const defaultGeminiModel = "gemini-flash-latest";
const geminiApiBase = "https://generativelanguage.googleapis.com/v1beta/models";
const defaultOneAgentModel = "claude-opus-4-7";
const defaultArkBaseUrl = "https://ark.cn-beijing.volces.com/api/v3";
const defaultArkDeepSeekModel = "deepseek-v4-pro-260425";

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/story-canvas.html")) {
      return streamFile(res, join(toolDir, "story-canvas.html"), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname.startsWith(publicAssetsPath)) {
      return streamPublicAsset(res, url.pathname);
    }
    if (req.method === "GET" && url.pathname === "/api/scan") {
      const root = url.searchParams.get("root") || defaultRoot;
      const ensure = url.searchParams.get("ensure") !== "0";
      return sendJson(res, await scanFolder(root, { ensure }));
    }
    if (req.method === "GET" && url.pathname === "/api/fingerprint") {
      const root = url.searchParams.get("root") || defaultRoot;
      return sendJson(res, await getFolderFingerprint(root));
    }
    if (req.method === "GET" && url.pathname === "/api/article") {
      const filePath = url.searchParams.get("path");
      if (!filePath) return sendJson(res, { error: "Missing path" }, 400);
      const resolved = resolveWorkspacePath(filePath);
      return sendJson(res, readArticle(resolved, { ensure: true, rootAbs: dirname(resolved) }));
    }
    if (req.method === "GET" && url.pathname === "/api/history") {
      const filePath = url.searchParams.get("path");
      if (!filePath) return sendJson(res, { error: "Missing path" }, 400);
      return sendJson(res, getHistoryForPath(filePath));
    }
    if (req.method === "GET" && url.pathname === "/api/folder-index-state") {
      const root = url.searchParams.get("root") || defaultRoot;
      return sendJson(res, getFolderIndexState(root));
    }
    if (req.method === "GET" && url.pathname === "/api/agents/status") {
      const probe = url.searchParams.get("probe") === "1";
      return sendJson(res, await getAgentStatus({ probe }));
    }
    if (req.method === "GET" && url.pathname === "/api/codex-bridge/tasks") {
      const root = url.searchParams.get("root") || defaultRoot;
      return sendJson(res, listCodexBridgeTasks(root));
    }
    if (req.method === "POST" && url.pathname === "/api/codex-bridge/task") {
      const body = await readJsonBody(req);
      return sendJson(res, createCodexBridgeTask(body));
    }
    if (req.method === "POST" && url.pathname === "/api/folder-index") {
      const body = await readJsonBody(req);
      return sendJson(res, saveFolderIndex(body.root || defaultRoot, body.positions || {}, body.workspace_state));
    }
    if (req.method === "POST" && url.pathname === "/api/folder-index-state") {
      const body = await readJsonBody(req);
      return sendJson(res, restoreFolderIndexState(body));
    }
    if (req.method === "POST" && url.pathname === "/api/draft-node") {
      const body = await readJsonBody(req);
      return sendJson(res, createDraftNode(body));
    }
    if (req.method === "POST" && url.pathname === "/api/draft-node/update") {
      const body = await readJsonBody(req);
      return sendJson(res, updateDraftNode(body));
    }
    if (req.method === "POST" && url.pathname === "/api/draft-node/delete") {
      const body = await readJsonBody(req);
      return sendJson(res, deleteDraftNode(body));
    }
    if (req.method === "POST" && url.pathname === "/api/draft-node/decision") {
      const body = await readJsonBody(req);
      return sendJson(res, setDraftNodeDecision(body));
    }
    if (req.method === "POST" && url.pathname === "/api/draft-node/generate-request") {
      const body = await readJsonBody(req);
      return sendJson(res, saveDraftGenerationRequest(body));
    }
    if (req.method === "POST" && url.pathname === "/api/draft-node/generate") {
      const body = await readJsonBody(req);
      return sendJson(res, await generateDraftNode(body));
    }
    if (req.method === "POST" && url.pathname === "/api/draft-node/split") {
      const body = await readJsonBody(req);
      return sendJson(res, splitDraftNode(body));
    }
    if (req.method === "POST" && url.pathname === "/api/block-reroll") {
      const body = await readJsonBody(req);
      return sendJson(res, await saveBlockReroll(body));
    }
    if (req.method === "POST" && url.pathname === "/api/part-reroll") {
      const body = await readJsonBody(req);
      return sendJson(res, await savePartReroll(body));
    }
    if (req.method === "POST" && url.pathname === "/api/chapter-reroll") {
      const body = await readJsonBody(req);
      return sendJson(res, await saveChapterReroll(body));
    }
    if (req.method === "POST" && url.pathname === "/api/restore") {
      const body = await readJsonBody(req);
      return sendJson(res, restoreHistory(body));
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, { ok: true, repo_root: repoRoot, default_root: defaultRoot });
    }
    sendJson(res, { error: "Not found" }, 404);
  } catch (error) {
    sendJson(res, { error: error.message }, 500);
  }
}).listen(port, host, () => {
  console.log(`Story Canvas running at http://${host}:${port}/`);
  console.log(`Default root: ${defaultRoot}`);
});

async function scanFolder(rootInput, options = {}) {
  const rootAbs = resolveWorkspacePath(rootInput);
  const files = await collectTextFiles(rootAbs);
  const folderIndex = readFolderIndex(rootAbs);
  const articles = files.map(file => readArticle(file, { ...options, rootAbs }));
  const groupsByKey = new Map();

  for (const article of articles) {
    const groupKey = `${article.relative_dir || "."}::${article.chapter_key}`;
    if (!groupsByKey.has(groupKey)) {
      groupsByKey.set(groupKey, {
        id: stableId(groupKey),
        group_key: groupKey,
        title: article.chapter_title,
        relative_dir: article.relative_dir,
        chapter_no: article.chapter_no,
        status: "loaded",
        parts: [],
        canvas_position: folderIndex.positions?.[groupKey] || article.sidecar?.canvas_position || null
      });
    }
    groupsByKey.get(groupKey).parts.push(article);
  }

  const baseGroups = Array.from(groupsByKey.values())
    .map(group => ({
      ...group,
      kind: "chapter",
      parts: group.parts.sort(compareParts),
      part_count: group.parts.length,
      total_chars: group.parts.reduce((sum, part) => sum + part.primary_count, 0)
    }))
    .sort(compareGroups)
    .map((group, index) => ({
      ...group,
      canvas_position: group.canvas_position || {
        x: 260,
        y: 120 + index * 230
      }
    }));
  const groups = insertDraftNodes(baseGroups, readDraftNodes(rootAbs, folderIndex, baseGroups));

  return {
    ok: true,
    repo_root: repoRoot,
    root: rootInput,
    root_abs: rootAbs,
    root_relative: toRepoRelative(rootAbs),
    folder_index_path: toRepoRelative(folderIndex.path),
    fingerprint: await makeFolderFingerprint(rootAbs),
    workspace_state: normalizeWorkspaceState(folderIndex.workspace_state),
    groups,
    article_count: articles.length,
    group_count: groups.length,
    sidecar_policy: "每篇 .md/.txt 旁边生成同名 .story.json；正文仍留在原文文件。"
  };
}

async function getFolderFingerprint(rootInput) {
  const rootAbs = resolveWorkspacePath(rootInput);
  return {
    ok: true,
    root: rootInput,
    root_relative: toRepoRelative(rootAbs),
    fingerprint: await makeFolderFingerprint(rootAbs)
  };
}

async function makeFolderFingerprint(rootAbs) {
  const files = await collectTextFiles(rootAbs);
  const folderIndex = readFolderIndex(rootAbs);
  const tracked = [getFolderIndexPath(rootAbs), getLedgerPath(rootAbs)];
  for (const file of files) {
    tracked.push(file);
    tracked.push(getSidecarPath(file));
  }
  for (const draft of Array.isArray(folderIndex.draft_nodes) ? folderIndex.draft_nodes : []) {
    tracked.push(resolveDraftFilePath(rootAbs, draft));
  }
  const parts = tracked
    .filter(path => existsSync(path))
    .map(path => {
      const stats = statSync(path);
      return `${toRepoRelative(path)}:${stats.size}:${Math.round(stats.mtimeMs)}`;
    })
    .sort();
  return hash(parts.join("\n"));
}

async function collectTextFiles(rootAbs) {
  const result = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        await walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!textExtensions.has(ext)) continue;
      if (entry.name.endsWith(".story.json")) continue;
      result.push(path);
    }
  }
  await walk(rootAbs);
  return result;
}

function readArticle(filePath, options = {}) {
  const text = readFileSync(filePath, "utf8");
  const parsed = parseArticle(text);
  const meta = inferChapterMeta(parsed.title, filePath, options.rootAbs || dirname(filePath));
  const sidecarPath = getSidecarPath(filePath);
  const oldSidecar = readJsonIfExists(sidecarPath);
  const blocks = parsed.blocks.map((block, index) => {
    const id = oldSidecar?.blocks?.[index]?.id || `B${String(index + 1).padStart(3, "0")}`;
    const oldBlock = oldSidecar?.blocks?.find(item => item.id === id) || {};
    return {
      id,
      type: block.type,
      start_line: block.start_line,
      end_line: block.end_line,
      primary_count: countNonspace(block.text),
      text_hash: hash(block.text),
      text: block.text,
      notes: oldBlock.notes || "",
      reroll_slots: Array.isArray(oldBlock.reroll_slots) ? oldBlock.reroll_slots : []
    };
  });
  const sidecar = buildSidecar(filePath, text, parsed, meta, blocks, oldSidecar);
  if (options.ensure) {
    ensureSourceSnapshot(filePath, text, "scan-source");
    writeJsonIfMeaningfullyChanged(sidecarPath, sidecar, {
      action: oldSidecar ? "scan-update-sidecar" : "scan-create-sidecar",
      source_path: toRepoRelative(filePath),
      details: { block_count: blocks.length, primary_count: sidecar.primary_count }
    });
  }
  return {
    path: toRepoRelative(filePath),
    absolute_path: filePath,
    sidecar_path: toRepoRelative(sidecarPath),
    title: parsed.title,
    chapter_title: meta.chapter_title,
    chapter_key: meta.chapter_key,
    chapter_no: meta.chapter_no,
    part_label: meta.part_label,
    part_order: meta.part_order,
    relative_dir: meta.relative_dir,
    primary_count: countNonspace(stripTrailingStats(text)),
    line_count: parsed.line_count,
    block_count: blocks.length,
    blocks,
    sidecar
  };
}

function readDraftNodes(rootAbs, folderIndex, chapterGroups) {
  const drafts = Array.isArray(folderIndex.draft_nodes) ? folderIndex.draft_nodes : [];
  return drafts
    .filter(draft => draft.status !== "split_source" && draft.status !== "archived")
    .map(draft => readDraftNode(rootAbs, folderIndex, draft, chapterGroups));
}

function readDraftNode(rootAbs, folderIndex, draft, chapterGroups) {
  const groupKey = `draft::${draft.id}`;
  const filePath = resolveDraftFilePath(rootAbs, draft);
  const text = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const afterGroup = chapterGroups.find(group => group.group_key === draft.after_group_key);
  const afterPosition = afterGroup?.canvas_position || { x: 260, y: 120 };
  return {
    kind: "draft",
    id: stableId(groupKey),
    draft_id: draft.id,
    group_key: groupKey,
    after_group_key: draft.after_group_key,
    after_title: draft.after_title || afterGroup?.title || "",
    before_group_key: draft.before_group_key || "",
    before_title: draft.before_title || "",
    branch_from_group_key: draft.branch_from_group_key || draft.after_group_key || "",
    route_mode: normalizeDraftRouteMode(draft.route_mode),
    title: draft.title || "续写草稿",
    relative_dir: ".story-canvas-drafts",
    chapter_no: afterGroup ? `${displayDraftAfter(afterGroup.chapter_no)}+` : "草稿",
    status: draft.status || "draft",
    decision_note: draft.decision_note || "",
    decided_at: draft.decided_at || "",
    parts: [],
    part_count: 0,
    total_chars: countNonspace(stripTrailingStats(text)),
    draft_text: text,
    draft_file_path: toRepoRelative(filePath),
    draft_relative_path: draft.file_path || "",
    split_origin_draft_id: draft.split_origin_draft_id || "",
    split_order: Number.isFinite(Number(draft.split_order)) ? Number(draft.split_order) : 0,
    split_into: Array.isArray(draft.split_into) ? draft.split_into : [],
    generated_from_draft_id: draft.generated_from_draft_id || "",
    split_plan: Array.isArray(draft.split_plan) ? draft.split_plan : [],
    generation_settings: normalizeGenerationSettings(draft.generation_settings),
    generation_batch: draft.generation_batch && typeof draft.generation_batch === "object" ? draft.generation_batch : null,
    generation_requests: Array.isArray(draft.generation_requests) ? draft.generation_requests : [],
    candidate_versions: Array.isArray(draft.candidate_versions) ? draft.candidate_versions : [],
    canvas_position: folderIndex.positions?.[groupKey] || draft.canvas_position || {
      x: afterPosition.x,
      y: afterPosition.y + 230
    }
  };
}

function insertDraftNodes(chapterGroups, draftNodes) {
  const byParent = new Map();
  for (const draft of draftNodes) {
    if (!byParent.has(draft.after_group_key)) byParent.set(draft.after_group_key, []);
    byParent.get(draft.after_group_key).push(draft);
  }
  const result = [];
  const appendWithDrafts = group => {
    result.push(group);
    const drafts = byParent.get(group.group_key) || [];
    drafts.sort((a, b) => String(a.draft_id).localeCompare(String(b.draft_id)));
    for (const draft of drafts) appendWithDrafts(draft);
    byParent.delete(group.group_key);
  };
  for (const group of chapterGroups) appendWithDrafts(group);
  for (const drafts of byParent.values()) result.push(...drafts);
  return result;
}

function parseArticle(text) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const title = lines.map(line => line.trim()).find(Boolean)?.replace(/^#{1,6}\s*/, "") || "未命名文章";
  const blocks = [];
  let start = null;
  let buffer = [];

  function flush(endLine) {
    if (!buffer.length || start === null) return;
    const blockText = buffer.join("\n").trim();
    if (blockText) {
      blocks.push({
        start_line: start,
        end_line: endLine,
        type: inferBlockType(blockText),
        text: blockText
      });
    }
    start = null;
    buffer = [];
  }

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    if (!line.trim()) {
      flush(lineNo - 1);
      return;
    }
    if (start === null) start = lineNo;
    buffer.push(line);
  });
  flush(lines.length);

  return { title, blocks, line_count: lines.length };
}

function inferBlockType(text) {
  const first = text.split("\n")[0].trim();
  if (/^#{1,6}\s/.test(first)) return "heading";
  if (/^(第[一二三四五六七八九十百千万\d]+章|终章|番外)/u.test(first)) return "heading";
  return "plot";
}

function inferChapterMeta(title, filePath, rootAbs) {
  const relativePath = toRepoRelative(filePath);
  const relativeDir = dirname(relative(rootAbs, filePath)).replace(/\\/g, "/");
  const cleanTitle = title.replace(/^#{1,6}\s*/, "").trim();
  const chapterNo = extractChapterNo(cleanTitle) ?? extractChapterNo(basename(filePath)) ?? 9999;
  const partLabel = extractPartLabel(cleanTitle) || extractPartLabel(basename(filePath)) || "正文";
  const partOrder = partOrderFor(partLabel);
  const chapterTitle = stripPartSuffix(cleanTitle);
  const chapterKey = `${String(chapterNo).padStart(4, "0")}::${chapterTitle || basename(filePath)}`;
  return {
    chapter_no: chapterNo,
    part_label: partLabel,
    part_order: partOrder,
    chapter_title: chapterTitle || cleanTitle,
    chapter_key: chapterKey,
    relative_path: relativePath,
    relative_dir: relativeDir === "." ? "" : relativeDir
  };
}

function extractChapterNo(value) {
  if (/终章/u.test(value)) return 9998;
  const match = value.match(/第([一二三四五六七八九十百千万\d]+)章/u);
  if (!match) return null;
  if (/^\d+$/.test(match[1])) return Number(match[1]);
  return chineseNumberToInt(match[1]);
}

function extractPartLabel(value) {
  const bracket = value.match(/[（(]([^）)]*(?:上|中|下|增补|终章|成人化重设)[^）)]*)[）)]/u)?.[1];
  if (bracket) return bracket;
  const direct = value.match(/第[一二三四五六七八九十百千万\d]+章([上中下])/u)?.[1];
  return direct || "";
}

function stripPartSuffix(value) {
  return value
    .replace(/[（(][^）)]*(?:上|中|下|增补|成人化重设)[^）)]*[）)]/gu, "")
    .replace(/第([一二三四五六七八九十百千万\d]+)章([上中下])：/u, "第$1章：")
    .replace(/（正文）/gu, "")
    .trim();
}

function chineseNumberToInt(value) {
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  if (value.includes("十")) {
    const [left, right] = value.split("十");
    return (left ? digits[left] : 1) * 10 + (right ? digits[right] : 0);
  }
  return digits[value] ?? 9999;
}

function partOrderFor(label) {
  if (/上/u.test(label)) return 1;
  if (/中/u.test(label)) return 2;
  if (/下/u.test(label)) return 3;
  if (/增补/u.test(label)) return 4;
  if (/终章/u.test(label)) return 99;
  return 0;
}

function buildSidecar(filePath, text, parsed, meta, blocks, old = {}) {
  old = old || {};
  return {
    schema_version: 1,
    source_file: basename(filePath),
    source_path: toRepoRelative(filePath),
    source_hash: hash(stripTrailingStats(text)),
    title: parsed.title,
    chapter_title: meta.chapter_title,
    chapter_key: meta.chapter_key,
    chapter_no: meta.chapter_no,
    part_label: meta.part_label,
    block_count: blocks.length,
    primary_count: countNonspace(stripTrailingStats(text)),
    canvas_position: old.canvas_position || null,
    part_reroll_slots: Array.isArray(old.part_reroll_slots) ? old.part_reroll_slots : [],
    blocks: blocks.map(block => ({
      id: block.id,
      type: block.type,
      start_line: block.start_line,
      end_line: block.end_line,
      primary_count: block.primary_count,
      text_hash: block.text_hash,
      notes: block.notes || "",
      reroll_slots: block.reroll_slots || []
    })),
    updated_at: new Date().toISOString()
  };
}

function getFolderIndexState(rootInput) {
  const rootAbs = resolveWorkspacePath(rootInput || defaultRoot);
  const current = readJsonIfExists(getFolderIndexPath(rootAbs)) || {};
  return {
    ok: true,
    path: toRepoRelative(getFolderIndexPath(rootAbs)),
    state: buildFolderIndexState(rootAbs, current)
  };
}

function buildFolderIndexState(rootAbs, current) {
  const draftNodes = Array.isArray(current.draft_nodes) ? current.draft_nodes : [];
  const draftFiles = {};
  for (const draft of draftNodes) {
    const relativePath = draft.file_path || `.story-canvas-drafts/${draft.id}.md`;
    try {
      const filePath = resolveDraftFilePath(rootAbs, draft);
      if (existsSync(filePath)) draftFiles[relativePath] = readFileSync(filePath, "utf8");
    } catch {
      // Restore validates paths before writing; bad draft paths are skipped in snapshots.
    }
  }
  return {
    schema_version: 1,
    root: toRepoRelative(rootAbs),
    positions: current.positions && typeof current.positions === "object" ? current.positions : {},
    workspace_state: normalizeWorkspaceState(current.workspace_state),
    draft_nodes: draftNodes,
    draft_files: draftFiles,
    updated_at: current.updated_at || ""
  };
}

function restoreFolderIndexState(body) {
  if (!body.root || !body.state) throw new Error("root and state are required");
  const rootAbs = resolveWorkspacePath(body.root);
  const folderIndexPath = getFolderIndexPath(rootAbs);
  const snapshot = body.state || {};
  const next = {
    schema_version: 1,
    root: toRepoRelative(rootAbs),
    positions: snapshot.positions && typeof snapshot.positions === "object" ? snapshot.positions : {},
    workspace_state: normalizeWorkspaceState(snapshot.workspace_state),
    draft_nodes: Array.isArray(snapshot.draft_nodes) ? snapshot.draft_nodes : [],
    updated_at: new Date().toISOString()
  };

  const draftFiles = snapshot.draft_files && typeof snapshot.draft_files === "object" ? snapshot.draft_files : {};
  for (const [relativePath, text] of Object.entries(draftFiles)) {
    const filePath = resolveDraftFilePath(rootAbs, { id: safeName(relativePath), file_path: relativePath });
    const oldText = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
    if (oldText && oldText !== text) ensureSourceSnapshot(filePath, oldText, "pre-restore-draft-source");
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, String(text), "utf8");
  }

  writeJsonWithHistory(folderIndexPath, next, {
    action: body.action || "restore-folder-index-state",
    details: {
      reason: body.reason || "",
      position_count: Object.keys(next.positions).length,
      has_workspace_state: Boolean(next.workspace_state),
      draft_count: next.draft_nodes.length
    }
  });
  return { ok: true, path: toRepoRelative(folderIndexPath), state: buildFolderIndexState(rootAbs, next) };
}

function saveFolderIndex(rootInput, positions, workspaceState = null) {
  const rootAbs = resolveWorkspacePath(rootInput);
  const path = getFolderIndexPath(rootAbs);
  const current = readJsonIfExists(path) || {};
  const nextWorkspaceState = workspaceState
    ? normalizeWorkspaceState(workspaceState)
    : normalizeWorkspaceState(current.workspace_state);
  const next = {
    schema_version: 1,
    root: toRepoRelative(rootAbs),
    positions: { ...(current.positions || {}), ...positions },
    workspace_state: nextWorkspaceState,
    draft_nodes: Array.isArray(current.draft_nodes) ? current.draft_nodes : [],
    updated_at: new Date().toISOString()
  };
  writeJsonIfMeaningfullyChanged(path, next, {
    action: current.schema_version ? "save-folder-workspace" : "create-folder-workspace",
    details: {
      position_count: Object.keys(next.positions).length,
      has_workspace_state: Boolean(nextWorkspaceState)
    }
  });
  return { ok: true, path: toRepoRelative(path), positions: next.positions, workspace_state: next.workspace_state };
}

function createDraftNode(body) {
  if (!body.root) throw new Error("root is required");
  if (!body.after_group_key) throw new Error("after_group_key is required");
  const rootAbs = resolveWorkspacePath(body.root);
  const folderIndex = readFolderIndex(rootAbs);
  const current = readJsonIfExists(folderIndex.path) || {};
  const id = `draft-${safeTimestamp()}-${hash(`${body.after_group_key}:${Date.now()}`).slice(0, 6)}`;
  const title = body.title || `续写草稿`;
  const relativePath = `.story-canvas-drafts/${id}.md`;
  const filePath = join(rootAbs, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `# ${title}\n\n`, "utf8");
  const routeMode = normalizeDraftRouteMode(body.route_mode);
  const draft = {
    id,
    after_group_key: body.after_group_key,
    after_title: body.after_title || "",
    before_group_key: body.before_group_key || "",
    before_title: body.before_title || "",
    branch_from_group_key: body.branch_from_group_key || body.after_group_key,
    route_mode: routeMode,
    title,
    file_path: relativePath,
    status: "draft",
    split_plan: [],
    generation_settings: normalizeGenerationSettings(body.generation_settings),
    generation_requests: [],
    candidate_versions: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const next = {
    schema_version: 1,
    root: toRepoRelative(rootAbs),
    positions: {
      ...(current.positions || {}),
      [`draft::${id}`]: body.canvas_position || { x: 260, y: 120 }
    },
    draft_nodes: [...(Array.isArray(current.draft_nodes) ? current.draft_nodes : []), draft],
    updated_at: new Date().toISOString()
  };
  writeJsonWithHistory(folderIndex.path, next, {
    action: "create-draft-node",
    details: {
      draft_id: id,
      after_group_key: body.after_group_key,
      before_group_key: draft.before_group_key,
      route_mode: routeMode,
      file_path: relativePath
    }
  });
  appendLedger(rootAbs, {
    action: "create-draft-source",
    target_path: toRepoRelative(filePath),
    details: {
      draft_id: id,
      title,
      route_mode: routeMode,
      generation_settings: draft.generation_settings
    }
  });
  return { ok: true, draft_id: id, group_id: stableId(`draft::${id}`), draft: readDraftNode(rootAbs, next, draft, []) };
}

function updateDraftNode(body) {
  if (!body.root || !body.draft_id) throw new Error("root and draft_id are required");
  const rootAbs = resolveWorkspacePath(body.root);
  const folderIndex = readFolderIndex(rootAbs);
  const current = readJsonIfExists(folderIndex.path) || {};
  const drafts = Array.isArray(current.draft_nodes) ? current.draft_nodes : [];
  const index = drafts.findIndex(item => item.id === body.draft_id);
  if (index < 0) throw new Error(`Draft not found: ${body.draft_id}`);
  let draft = { ...drafts[index] };
  const filePath = resolveDraftFilePath(rootAbs, draft);
  const oldText = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const nextText = typeof body.text === "string" ? body.text : oldText;
  if (oldText !== nextText) {
    if (oldText) ensureSourceSnapshot(filePath, oldText, "draft-update-source");
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, nextText, "utf8");
  }
  if (typeof body.title === "string" && body.title.trim()) draft.title = body.title.trim();
  if (Array.isArray(body.split_plan)) draft.split_plan = body.split_plan;
  if (body.generation_settings && typeof body.generation_settings === "object") {
    draft.generation_settings = normalizeGenerationSettings(body.generation_settings, draft.generation_settings);
  }
  if (typeof body.route_mode === "string") draft.route_mode = normalizeDraftRouteMode(body.route_mode);
  if (typeof body.before_group_key === "string") draft.before_group_key = body.before_group_key;
  if (typeof body.before_title === "string") draft.before_title = body.before_title;
  if (typeof body.branch_from_group_key === "string") draft.branch_from_group_key = body.branch_from_group_key;
  draft.updated_at = new Date().toISOString();
  drafts[index] = draft;
  const next = {
    ...current,
    schema_version: 1,
    root: toRepoRelative(rootAbs),
    draft_nodes: drafts,
    updated_at: new Date().toISOString()
  };
  writeJsonWithHistory(folderIndex.path, next, {
    action: "update-draft-node",
    details: {
      draft_id: draft.id,
      file_path: draft.file_path,
      route_mode: draft.route_mode || "branch",
      generation_settings: draft.generation_settings || null
    }
  });
  return { ok: true, draft_id: draft.id, draft: readDraftNode(rootAbs, next, draft, []) };
}

function saveDraftGenerationRequest(body) {
  if (!body.root || !body.draft_id) throw new Error("root and draft_id are required");
  const rootAbs = resolveWorkspacePath(body.root);
  const folderIndex = readFolderIndex(rootAbs);
  const current = readJsonIfExists(folderIndex.path) || {};
  const drafts = Array.isArray(current.draft_nodes) ? current.draft_nodes : [];
  const index = drafts.findIndex(item => item.id === body.draft_id);
  if (index < 0) throw new Error(`Draft not found: ${body.draft_id}`);

  let draft = { ...drafts[index] };
  const settings = normalizeGenerationSettings(body.generation_settings, draft.generation_settings);
  const request = buildDraftGenerationRequest(draft, settings, "requested");
  draft.generation_settings = settings;
  draft.generation_requests = Array.isArray(draft.generation_requests) ? draft.generation_requests : [];
  draft.generation_requests.push(request);
  draft.updated_at = new Date().toISOString();
  drafts[index] = draft;

  const next = {
    ...current,
    schema_version: 1,
    root: toRepoRelative(rootAbs),
    draft_nodes: drafts,
    updated_at: new Date().toISOString()
  };
  writeJsonWithHistory(folderIndex.path, next, {
    action: "draft-generate-request",
    details: {
      draft_id: draft.id,
      request_id: request.request_id,
      agent: request.agent,
      model: request.model,
      version_count: request.version_count,
      target_chars: request.target_chars,
      split_count: request.split_count,
      generation_rule_pack: generationRulePackId,
      instruction_priority: generationRulePack.priority_order
    }
  });
  appendLedger(rootAbs, {
    action: "draft-generate-request",
    target_path: toRepoRelative(resolveDraftFilePath(rootAbs, draft)),
    details: request
  });
  return { ok: true, draft_id: draft.id, request, draft: readDraftNode(rootAbs, next, draft, []) };
}

async function generateDraftNode(body) {
  if (!body.root || !body.draft_id) throw new Error("root and draft_id are required");
  const rootAbs = resolveWorkspacePath(body.root);
  const folderIndex = readFolderIndex(rootAbs);
  const current = readJsonIfExists(folderIndex.path) || {};
  const drafts = Array.isArray(current.draft_nodes) ? current.draft_nodes : [];
  const index = drafts.findIndex(item => item.id === body.draft_id);
  if (index < 0) throw new Error(`Draft not found: ${body.draft_id}`);

  let draft = { ...drafts[index] };
  const settings = normalizeGenerationSettings(body.generation_settings, draft.generation_settings);
  const provider = resolveGenerationProvider(settings);
  const request = buildDraftGenerationRequest(draft, settings, provider.direct ? "generating" : "requested");
  let candidates = [];
  let generatedDrafts = [];
  const positions = { ...(current.positions || {}) };
  const sourceKey = `draft::${draft.id}`;
  const sourcePosition = positions[sourceKey] || draft.canvas_position || { x: 260, y: 120 };
  const sourceFilePath = resolveDraftFilePath(rootAbs, draft);
  const sourceText = existsSync(sourceFilePath) ? readFileSync(sourceFilePath, "utf8") : "";
  const canReuseSourceAsFirstVersion = !hasMeaningfulDraftBody(sourceText);

  if (provider.direct) {
    const context = await buildDraftGenerationContext(rootAbs, draft);
    candidates = await generateTextCandidates({
      settings,
      provider,
      count: settings.version_count,
      versionPrefix: request.request_id,
      makePrompt: versionIndex => buildDraftGenerationPrompt({ draft, settings, context, versionIndex })
    });
    request.status = "generated";
    request.provider = provider.provider;
    request.candidate_version_ids = candidates.map(candidate => candidate.version_id);
    request.generated_at = new Date().toISOString();
    generatedDrafts = materializeGeneratedDraftNodes({
      rootAbs,
      sourceDraft: draft,
      sourceIndex: index,
      drafts,
      positions,
      sourcePosition,
      sourceText,
      sourceFilePath,
      candidates,
      settings,
      request,
      reuseSourceAsFirstVersion: canReuseSourceAsFirstVersion
    });
    request.candidate_draft_ids = generatedDrafts.map(item => item.id);
    if (generatedDrafts[0]?.id === draft.id) draft = { ...drafts[index] };
  } else if (provider.kind === "codex-bridge") {
    const context = await buildDraftGenerationContext(rootAbs, draft);
    const bridgeTask = writeCodexBridgeTask(rootAbs, {
      task_type: "draft-generate",
      title: `Story Canvas 续写生成：${draft.title || draft.id}`,
      source_draft_id: draft.id,
      source_path: toRepoRelative(sourceFilePath),
      request,
      settings,
      route: {
        route_mode: normalizeDraftRouteMode(draft.route_mode),
        after_group_key: draft.after_group_key || "",
        after_title: draft.after_title || context.after_title || "",
        before_group_key: draft.before_group_key || "",
        before_title: draft.before_title || context.before_title || ""
      },
      prompts: Array.from({ length: settings.version_count }, (_, promptIndex) => ({
        version_index: promptIndex + 1,
        prompt: buildDraftGenerationPrompt({ draft, settings, context, versionIndex: promptIndex + 1 })
      })),
      instruction: "请在 Codex 中读取本任务，按 prompts 生成候选正文，写回对应草稿文件或追加候选节点，并记录账本。"
    });
    request.status = "queued";
    request.provider = "codex-bridge";
    request.codex_bridge_task_id = bridgeTask.task_id;
    request.direct_generation_note = "已写入 Codex 桥接任务队列；需要 Codex App/本机桥接消费者执行。";
  } else {
    request.direct_generation_note = provider.reason || "当前模型未配置直接生成链路，已记录为待外部生成请求。";
  }

  draft.generation_settings = settings;
  draft.generation_requests = Array.isArray(draft.generation_requests) ? draft.generation_requests : [];
  draft.generation_requests.push(request);
  draft.candidate_versions = [
    ...(Array.isArray(draft.candidate_versions) ? draft.candidate_versions : []),
    ...candidates
  ];
  draft.updated_at = new Date().toISOString();
  drafts[index] = draft;

  const next = {
    ...current,
    schema_version: 1,
    root: toRepoRelative(rootAbs),
    positions,
    draft_nodes: drafts,
    updated_at: new Date().toISOString()
  };
  writeJsonWithHistory(folderIndex.path, next, {
    action: candidates.length ? "draft-generate-candidates" : "draft-generate-request",
    details: {
      draft_id: draft.id,
      request_id: request.request_id,
      agent: request.agent,
      model: request.model,
      candidate_count: candidates.length,
      generated_draft_count: generatedDrafts.length,
      version_count: request.version_count,
      target_chars: request.target_chars,
      split_count: request.split_count,
      generation_rule_pack: generationRulePackId,
      instruction_priority: generationRulePack.priority_order
    }
  });
  appendLedger(rootAbs, {
    action: candidates.length ? "draft-generate-candidates" : "draft-generate-request",
    target_path: toRepoRelative(resolveDraftFilePath(rootAbs, draft)),
    details: {
      ...request,
      candidate_count: candidates.length,
      generated_draft_count: generatedDrafts.length,
      generated_drafts: generatedDrafts.map(item => ({
        id: item.id,
        file_path: item.file_path,
        title: item.title,
        generation_batch: item.generation_batch
      })),
      candidate_versions: summarizeCandidates(candidates)
    }
  });
  return {
    ok: true,
    draft_id: draft.id,
    direct_generation: candidates.length > 0,
    source_reused_as_first_version: canReuseSourceAsFirstVersion && candidates.length > 0,
    generated_draft_ids: generatedDrafts.map(item => item.id),
    group_ids: generatedDrafts.map(item => stableId(`draft::${item.id}`)),
    request,
    candidates,
    generated_drafts: generatedDrafts.map(item => readDraftNode(rootAbs, next, item, [])),
    draft: readDraftNode(rootAbs, next, draft, [])
  };
}

function materializeGeneratedDraftNodes({
  rootAbs,
  sourceDraft,
  sourceIndex,
  drafts,
  positions,
  sourcePosition,
  sourceText,
  sourceFilePath,
  candidates,
  settings,
  request,
  reuseSourceAsFirstVersion
}) {
  const generated = [];
  const versionCount = candidates.length;
  for (const [candidateIndex, candidate] of candidates.entries()) {
    const versionIndex = candidateIndex + 1;
    const title = generatedDraftTitle(sourceDraft.title, versionIndex, versionCount);
    const generationBatch = {
      source_draft_id: sourceDraft.id,
      request_id: request.request_id,
      candidate_version_id: candidate.version_id,
      version_index: versionIndex,
      version_count: versionCount,
      generated_at: candidate.created_at || new Date().toISOString()
    };
    if (reuseSourceAsFirstVersion && candidateIndex === 0) {
      if (sourceText) ensureSourceSnapshot(sourceFilePath, sourceText, "draft-generate-source");
      mkdirSync(dirname(sourceFilePath), { recursive: true });
      writeFileSync(sourceFilePath, formatGeneratedDraftText(title, candidate.candidate_text), "utf8");
      const source = {
        ...sourceDraft,
        title,
        status: "draft",
        generation_settings: settings,
        generation_batch: generationBatch,
        updated_at: new Date().toISOString()
      };
      drafts[sourceIndex] = source;
      positions[`draft::${source.id}`] = sourcePosition;
      generated.push(source);
      continue;
    }

    const id = `draft-${safeTimestamp()}-${hash(`${sourceDraft.id}:${candidate.version_id}:${versionIndex}:${Date.now()}`).slice(0, 6)}`;
    const relativePath = `.story-canvas-drafts/${id}.md`;
    const filePath = join(rootAbs, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, formatGeneratedDraftText(title, candidate.candidate_text), "utf8");
    const draft = {
      id,
      after_group_key: sourceDraft.after_group_key,
      after_title: sourceDraft.after_title || "",
      before_group_key: sourceDraft.before_group_key || "",
      before_title: sourceDraft.before_title || "",
      branch_from_group_key: sourceDraft.branch_from_group_key || sourceDraft.after_group_key,
      route_mode: normalizeDraftRouteMode(sourceDraft.route_mode),
      title,
      file_path: relativePath,
      status: "draft",
      generated_from_draft_id: sourceDraft.id,
      generation_batch: generationBatch,
      split_plan: [],
      generation_settings: {
        ...settings,
        version_count: versionCount
      },
      generation_requests: [],
      candidate_versions: [candidate],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    drafts.push(draft);
    positions[`draft::${id}`] = generatedDraftPosition(sourcePosition, candidateIndex, versionCount, reuseSourceAsFirstVersion);
    generated.push(draft);
  }
  return generated;
}

function hasMeaningfulDraftBody(text) {
  const body = stripTrailingStats(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !/^#{1,6}\s+/u.test(line))
    .join("");
  return countNonspace(body) > 20;
}

function generatedDraftTitle(baseTitle, versionIndex, versionCount) {
  const base = String(baseTitle || "续写草稿")
    .replace(/\s*[·-]\s*版本\s*\d+(?:\s*\/\s*\d+)?\s*$/u, "")
    .trim() || "续写草稿";
  return `${base} · 版本 ${versionIndex}/${versionCount}`;
}

function formatGeneratedDraftText(title, text) {
  const body = String(text || "").trim();
  if (/^#{1,6}\s+/u.test(body)) return `${body}\n`;
  return `# ${title}\n\n${body}\n`;
}

function generatedDraftPosition(sourcePosition, candidateIndex, versionCount, reuseSourceAsFirstVersion) {
  const columns = Math.min(2, Math.max(1, versionCount));
  if (!reuseSourceAsFirstVersion) {
    return {
      x: Math.round(sourcePosition.x + 320 + (candidateIndex % columns) * 320),
      y: Math.round(sourcePosition.y + Math.floor(candidateIndex / columns) * 210)
    };
  }
  const slot = candidateIndex;
  return {
    x: Math.round(sourcePosition.x + (slot % columns) * 320),
    y: Math.round(sourcePosition.y + Math.floor(slot / columns) * 210)
  };
}

function splitDraftPosition(sourcePosition, index, total) {
  const columns = Math.min(4, Math.max(1, total));
  return {
    x: Math.round(sourcePosition.x + (index % columns) * 168),
    y: Math.round(sourcePosition.y + Math.floor(index / columns) * 100)
  };
}

function deleteDraftNode(body) {
  if (!body.root || !body.draft_id) throw new Error("root and draft_id are required");
  const rootAbs = resolveWorkspacePath(body.root);
  const folderIndex = readFolderIndex(rootAbs);
  const current = readJsonIfExists(folderIndex.path) || {};
  const drafts = Array.isArray(current.draft_nodes) ? current.draft_nodes : [];
  const index = drafts.findIndex(item => item.id === body.draft_id);
  if (index < 0) throw new Error(`Draft not found: ${body.draft_id}`);

  const draft = {
    ...drafts[index],
    status: "archived",
    archived_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  drafts[index] = draft;
  const positions = { ...(current.positions || {}) };
  delete positions[`draft::${draft.id}`];
  const next = {
    ...current,
    schema_version: 1,
    root: toRepoRelative(rootAbs),
    positions,
    workspace_state: normalizeWorkspaceState(current.workspace_state),
    draft_nodes: drafts,
    updated_at: new Date().toISOString()
  };
  writeJsonWithHistory(folderIndex.path, next, {
    action: "delete-draft-node",
    details: {
      draft_id: draft.id,
      file_path: draft.file_path || "",
      delete_policy: "archive-index-only"
    }
  });
  appendLedger(rootAbs, {
    action: "delete-draft-node",
    target_path: draft.file_path ? toRepoRelative(resolveDraftFilePath(rootAbs, draft)) : toRepoRelative(rootAbs),
    details: {
      draft_id: draft.id,
      delete_policy: "archive-index-only"
    }
  });
  return { ok: true, draft_id: draft.id, archived: true };
}

function setDraftNodeDecision(body) {
  if (!body.root || !body.draft_id) throw new Error("root and draft_id are required");
  const decision = normalizeDraftDecision(body.decision);
  const rootAbs = resolveWorkspacePath(body.root);
  const folderIndex = readFolderIndex(rootAbs);
  const current = readJsonIfExists(folderIndex.path) || {};
  const drafts = Array.isArray(current.draft_nodes) ? current.draft_nodes : [];
  const index = drafts.findIndex(item => item.id === body.draft_id);
  if (index < 0) throw new Error(`Draft not found: ${body.draft_id}`);

  const decidedAt = new Date().toISOString();
  const note = String(body.note || "").trim().slice(0, 2000);
  const changedDrafts = [];
  const applyDecision = (draftIndex, nextDecision, reason = "") => {
    const draft = { ...drafts[draftIndex] };
    draft.status = nextDecision;
    draft.decision_note = reason || note;
    draft.decided_at = nextDecision === "draft" ? "" : decidedAt;
    draft.updated_at = decidedAt;
    drafts[draftIndex] = draft;
    changedDrafts.push({ id: draft.id, status: draft.status, reason: draft.decision_note || "" });
    return draft;
  };

  const selectedDraft = applyDecision(index, decision);
  if (decision === "selected" && body.exclusive_batch !== false) {
    const requestId = selectedDraft.generation_batch?.request_id;
    if (requestId) {
      drafts.forEach((draft, draftIndex) => {
        if (draftIndex === index) return;
        if (draft.status === "archived" || draft.status === "split_source") return;
        if (draft.generation_batch?.request_id !== requestId) return;
        applyDecision(draftIndex, "rejected", "同一生成批次已有采纳版本。");
      });
    }
  }

  const next = {
    ...current,
    schema_version: 1,
    root: toRepoRelative(rootAbs),
    draft_nodes: drafts,
    updated_at: decidedAt
  };
  writeJsonWithHistory(folderIndex.path, next, {
    action: "draft-decision",
    details: {
      draft_id: selectedDraft.id,
      decision,
      note,
      exclusive_batch: decision === "selected" && body.exclusive_batch !== false,
      changed_drafts: changedDrafts
    }
  });
  appendLedger(rootAbs, {
    action: "draft-decision",
    target_path: selectedDraft.file_path ? toRepoRelative(resolveDraftFilePath(rootAbs, selectedDraft)) : toRepoRelative(rootAbs),
    details: {
      draft_id: selectedDraft.id,
      decision,
      note,
      exclusive_batch: decision === "selected" && body.exclusive_batch !== false,
      changed_drafts: changedDrafts
    }
  });
  return {
    ok: true,
    draft_id: selectedDraft.id,
    decision,
    changed_drafts: changedDrafts,
    group_id: stableId(`draft::${selectedDraft.id}`),
    draft: readDraftNode(rootAbs, next, selectedDraft, [])
  };
}

function normalizeDraftDecision(value) {
  const decision = String(value || "draft").trim().toLowerCase();
  if (decision === "selected" || decision === "rejected" || decision === "draft") return decision;
  throw new Error("decision must be draft, selected, or rejected");
}

function splitDraftNode(body) {
  if (!body.root || !body.draft_id) throw new Error("root and draft_id are required");
  const chapters = Array.isArray(body.chapters)
    ? body.chapters
        .map((chapter, index) => ({
          title: String(chapter?.title || `拆分章节 ${index + 1}`).trim(),
          text: String(chapter?.text || "").trim()
        }))
        .filter(chapter => chapter.text)
    : [];
  if (!chapters.length) throw new Error("chapters must contain at least one non-empty draft");

  const rootAbs = resolveWorkspacePath(body.root);
  const folderIndex = readFolderIndex(rootAbs);
  const current = readJsonIfExists(folderIndex.path) || {};
  const drafts = Array.isArray(current.draft_nodes) ? current.draft_nodes : [];
  const sourceIndex = drafts.findIndex(item => item.id === body.draft_id);
  if (sourceIndex < 0) throw new Error(`Draft not found: ${body.draft_id}`);

  const source = { ...drafts[sourceIndex] };
  const sourceKey = `draft::${source.id}`;
  const sourceFilePath = resolveDraftFilePath(rootAbs, source);
  const sourceText = existsSync(sourceFilePath) ? readFileSync(sourceFilePath, "utf8") : "";
  if (sourceText) ensureSourceSnapshot(sourceFilePath, sourceText, "draft-split-source");
  const inheritedSettings = normalizeGenerationSettings({
    ...(source.generation_settings || {}),
    ...(body.generation_settings || {}),
    split_count: chapters.length,
    split_mode: chapters.length > 1 ? "chapter_nodes" : "single_segment"
  });

  const positions = { ...(current.positions || {}) };
  const sourcePosition = positions[sourceKey] || source.canvas_position || { x: 260, y: 120 };
  delete positions[sourceKey];

  const createdDrafts = [];
  let previousGroupKey = source.after_group_key;
  let previousTitle = source.after_title || "";
  for (const [index, chapter] of chapters.entries()) {
    const id = `draft-${safeTimestamp()}-${hash(`${source.id}:${index}:${Date.now()}`).slice(0, 6)}`;
    const groupKey = `draft::${id}`;
    const relativePath = `.story-canvas-drafts/${id}.md`;
    const filePath = join(rootAbs, relativePath);
    const title = chapter.title || `${source.title || "续写草稿"} ${index + 1}`;
    const text = chapter.text.startsWith("#") ? chapter.text : `# ${title}\n\n${chapter.text}\n`;
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, text, "utf8");
    const draft = {
      id,
      after_group_key: previousGroupKey,
      after_title: previousTitle,
      before_group_key: index === chapters.length - 1 ? source.before_group_key || "" : "",
      before_title: index === chapters.length - 1 ? source.before_title || "" : "",
      branch_from_group_key: source.branch_from_group_key || source.after_group_key || previousGroupKey,
      route_mode: index === 0 ? normalizeDraftRouteMode(source.route_mode) : "interstitial",
      title,
      file_path: relativePath,
      status: "draft",
      split_origin_draft_id: source.id,
      split_order: index + 1,
      split_plan: [],
      generation_settings: inheritedSettings,
      generation_requests: [],
      candidate_versions: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    createdDrafts.push(draft);
    positions[groupKey] = splitDraftPosition(sourcePosition, index, chapters.length);
    previousGroupKey = groupKey;
    previousTitle = title;
  }

  source.status = "split_source";
  source.split_into = createdDrafts.map(draft => draft.id);
  source.updated_at = new Date().toISOString();
  drafts[sourceIndex] = source;
  const next = {
    ...current,
    schema_version: 1,
    root: toRepoRelative(rootAbs),
    positions,
    draft_nodes: [...drafts, ...createdDrafts],
    updated_at: new Date().toISOString()
  };
  writeJsonWithHistory(folderIndex.path, next, {
    action: "split-draft-node",
    details: { draft_id: source.id, created_count: createdDrafts.length }
  });
  appendLedger(rootAbs, {
    action: "split-draft-node",
    target_path: toRepoRelative(sourceFilePath),
    details: {
      draft_id: source.id,
      split_count: chapters.length,
      generation_settings: inheritedSettings,
      created: createdDrafts.map(draft => ({ id: draft.id, file_path: draft.file_path, title: draft.title }))
    }
  });
  return {
    ok: true,
    source_draft_id: source.id,
    draft_ids: createdDrafts.map(draft => draft.id),
    group_id: stableId(`draft::${createdDrafts[0].id}`),
    created: createdDrafts.map(draft => readDraftNode(rootAbs, next, draft, []))
  };
}

async function saveBlockReroll(body) {
  if (!body.path || !body.block_id) throw new Error("path and block_id are required");
  const filePath = resolveWorkspacePath(body.path);
  const sidecarPath = getSidecarPath(filePath);
  if (!existsSync(sidecarPath)) readArticle(filePath, { ensure: true, rootAbs: dirname(filePath) });
  const sidecar = readJsonIfExists(sidecarPath);
  const block = sidecar.blocks.find(item => item.id === body.block_id);
  if (!block) throw new Error(`Block not found: ${body.block_id}`);
  const article = readArticle(filePath, { ensure: false, rootAbs: dirname(filePath) });
  const sourceBlock = article.blocks.find(item => item.id === body.block_id);
  const sourceText = sourceBlock?.text || "";
  const settings = normalizeRerollGenerationSettings(body.generation_settings, {
    target_chars: sourceBlock?.primary_count || block.primary_count || 800,
    prompt_goal: body.goal || ""
  });
  const candidates = body.generate_now
    ? await maybeGenerateRerollCandidates({
        type: "block",
        label: body.block_id,
        goal: body.goal || "",
        sourceText,
        settings
      })
    : [];
  block.reroll_slots = Array.isArray(block.reroll_slots) ? block.reroll_slots : [];
  const slots = buildRerollSlots({
    prefix: body.block_id,
    currentCount: block.reroll_slots.length,
    goal: body.goal || "",
    settings,
    candidates,
    fallbackCandidateText: body.candidate_text || ""
  });
  block.reroll_slots.push(...slots);
  sidecar.updated_at = new Date().toISOString();
  writeJsonWithHistory(sidecarPath, sidecar, {
    action: candidates.length ? "block-reroll-generate" : "block-reroll",
    source_path: toRepoRelative(filePath),
    details: {
      block_id: body.block_id,
      goal: body.goal || "",
      version_id: block.reroll_slots.at(-1)?.version_id,
      candidate_count: candidates.length,
      agent: settings.agent,
      model: settings.model,
      generation_rule_pack: generationRulePackId,
      instruction_priority: generationRulePack.priority_order
    }
  });
  return { ok: true, sidecar_path: toRepoRelative(sidecarPath), block, slots, direct_generation: candidates.length > 0 };
}

async function savePartReroll(body) {
  if (!body.path) throw new Error("path is required");
  const filePath = resolveWorkspacePath(body.path);
  const sidecarPath = getSidecarPath(filePath);
  if (!existsSync(sidecarPath)) readArticle(filePath, { ensure: true, rootAbs: dirname(filePath) });
  const sidecar = readJsonIfExists(sidecarPath);
  const sourceText = stripTrailingStats(readFileSync(filePath, "utf8"));
  const settings = normalizeRerollGenerationSettings(body.generation_settings, {
    target_chars: countNonspace(sourceText) || sidecar.primary_count || 3000,
    prompt_goal: body.goal || ""
  });
  const candidates = body.generate_now
    ? await maybeGenerateRerollCandidates({
        type: "part",
        label: sidecar.part_label || sidecar.title || basename(filePath),
        goal: body.goal || "",
        sourceText,
        settings
      })
    : [];
  sidecar.part_reroll_slots = Array.isArray(sidecar.part_reroll_slots) ? sidecar.part_reroll_slots : [];
  const prefix = safeName(sidecar.part_label || "part") || "part";
  const slots = buildRerollSlots({
    prefix,
    currentCount: sidecar.part_reroll_slots.length,
    goal: body.goal || "",
    settings,
    candidates,
    fallbackCandidateText: body.candidate_text || ""
  });
  sidecar.part_reroll_slots.push(...slots);
  sidecar.updated_at = new Date().toISOString();
  writeJsonWithHistory(sidecarPath, sidecar, {
    action: candidates.length ? "part-reroll-generate" : "part-reroll",
    source_path: toRepoRelative(filePath),
    details: {
      part_label: sidecar.part_label || "",
      goal: body.goal || "",
      version_id: sidecar.part_reroll_slots.at(-1)?.version_id,
      candidate_count: candidates.length,
      agent: settings.agent,
      model: settings.model,
      generation_rule_pack: generationRulePackId,
      instruction_priority: generationRulePack.priority_order
    }
  });
  return {
    ok: true,
    sidecar_path: toRepoRelative(sidecarPath),
    slot: sidecar.part_reroll_slots.at(-1),
    slots,
    direct_generation: candidates.length > 0
  };
}

async function saveChapterReroll(body) {
  const rootPath = body.root ? resolveWorkspacePath(body.root) : null;
  const fallbackPath = body.path ? dirname(resolveWorkspacePath(body.path)) : null;
  const folder = rootPath || fallbackPath;
  if (!folder) throw new Error("root or path is required");
  const partPaths = Array.isArray(body.part_paths) ? body.part_paths : [];
  const sourceText = partPaths
    .map(partPath => {
      try {
        return stripTrailingStats(readFileSync(resolveWorkspacePath(partPath), "utf8"));
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
  const settings = normalizeRerollGenerationSettings(body.generation_settings, {
    target_chars: countNonspace(sourceText) || 5000,
    prompt_goal: body.goal || ""
  });
  const candidates = body.generate_now
    ? await maybeGenerateRerollCandidates({
        type: "chapter",
        label: body.title || body.group_key || "chapter",
        goal: body.goal || "",
        sourceText,
        settings
      })
    : [];
  const slots = buildRerollSlots({
    prefix: safeName(body.group_key || "chapter"),
    currentCount: 0,
    goal: body.goal || "",
    settings,
    candidates,
    fallbackCandidateText: body.candidate_text || ""
  });
  const entry = {
    action: candidates.length ? "chapter-reroll-generate" : "chapter-reroll",
    target_path: toRepoRelative(folder),
    details: {
      group_key: body.group_key || "",
      chapter_no: body.chapter_no ?? "",
      title: body.title || "",
      goal: body.goal || "",
      user_directive: body.goal || "",
      agent: settings.agent,
      model: settings.model,
      target_chars: settings.target_chars,
      version_count: settings.version_count,
      instruction_priority: generationRulePack.priority_order,
      generation_rule_pack: generationRulePack,
      rule_conflict_policy: generationRulePack.conflict_policy,
      part_paths: partPaths,
      candidate_versions: slots,
      candidate_count: candidates.length
    }
  };
  appendLedger(folder, entry);
  return { ok: true, ledger_path: toRepoRelative(getLedgerPath(folder)), entry, slots, direct_generation: candidates.length > 0 };
}

function getHistoryForPath(input) {
  const filePath = resolveWorkspacePath(input);
  const sidecarPath = getSidecarPath(filePath);
  return {
    ok: true,
    source_path: toRepoRelative(filePath),
    sidecar_path: toRepoRelative(sidecarPath),
    source_history: listHistoryFiles(getSourceHistoryDir(filePath), "source"),
    sidecar_history: listHistoryFiles(getJsonHistoryDir(sidecarPath), "sidecar"),
    ledger: readLedgerEntries(dirname(filePath), 60)
  };
}

async function getAgentStatus({ probe = false } = {}) {
  const oneAgentConfig = getOneAgentConfig();
  const arkConfig = getArkConfig();
  const agents = [
    {
      id: "gemini-flash-latest",
      label: "Gemini Flash（API）",
      mode: "direct-api",
      provider: "google-generative-language",
      model: getGeminiModel(envValue("GOOGLE_GEMINI_MODEL") || envValue("GEMINI_MODEL") || defaultGeminiModel),
      configured: Boolean(getGeminiApiKey())
    },
    {
      id: "claude-opus-4-7",
      label: "Claude Opus 4.7",
      mode: "direct-api",
      provider: "oneagent",
      model: oneAgentConfig.model,
      configured: oneAgentConfig.configured
    },
    {
      id: "deepseek-v4-pro-260425",
      label: "DeepSeek V4 Pro",
      mode: "direct-api",
      provider: "volcengine-ark",
      model: arkConfig.model,
      configured: arkConfig.configured
    },
    {
      id: "codex-gpt-5",
      label: "Codex / GPT-5",
      mode: "bridge-queue",
      provider: "codex-bridge",
      model: "gpt-5",
      configured: true
    },
    {
      id: "trae-main",
      label: "Trae 主模型（统筹）",
      mode: "record-only",
      provider: "manual-or-host",
      model: "trae-main",
      configured: false
    },
    {
      id: "manual",
      label: "手动填稿",
      mode: "manual",
      provider: "manual",
      model: "manual",
      configured: true
    }
  ];

  const results = [];
  for (const agent of agents) {
    const item = {
      ...agent,
      available: agent.configured,
      status: agent.configured ? "configured" : "missing-config",
      checked_at: new Date().toISOString()
    };
    if (!agent.configured && agent.mode === "direct-api") item.message = missingAgentConfigMessage(agent.id);
    if (probe && agent.configured && agent.mode === "direct-api") {
      const settings = normalizeGenerationSettings({ agent: agent.id, model: agent.model, version_count: 1, target_chars: 64 });
      const provider = resolveGenerationProvider(settings);
      try {
        const reply = await callProviderText(provider, {
          model: providerModel(provider, settings),
          prompt: "请只回复 OK",
          settings
        });
        item.status = "ok";
        item.available = true;
        item.probe_reply = previewText(reply, 80);
      } catch (error) {
        item.status = "probe-failed";
        item.available = false;
        item.message = error.message;
      }
    }
    if (agent.mode === "bridge-queue") {
      item.status = "bridge-ready";
      item.message = "网页端会写入 Codex 桥接任务；需要 Codex App 或本机桥接消费者执行。";
    }
    results.push(item);
  }
  return { ok: true, probe, agents: results };
}

function missingAgentConfigMessage(agentId) {
  if (agentId === "claude-opus-4-7") return "需要 ONEAGENT_BASE_URL、ONEAGENT_API_KEY、ONEAGENT_MODEL。";
  if (agentId === "deepseek-v4-pro-260425") return "需要 ARK_BASE_URL、ARK_API_KEY、ARK_MODEL_DEEPSEEK。";
  if (agentId === "gemini-flash-latest") return "需要 GOOGLE_API_KEY 或 GEMINI_API_KEY。";
  return "未配置直接生成链路。";
}

function createCodexBridgeTask(body) {
  const rootAbs = resolveWorkspacePath(body.root || defaultRoot);
  const task = writeCodexBridgeTask(rootAbs, {
    task_type: body.task_type || "manual",
    title: body.title || "Story Canvas Codex 任务",
    source_path: body.source_path || "",
    instruction: body.instruction || "",
    payload: body.payload || {}
  });
  return { ok: true, task };
}

function writeCodexBridgeTask(rootAbs, taskInput) {
  const taskId = `codex-task-${safeTimestamp()}-${hash(JSON.stringify(taskInput)).slice(0, 8)}`;
  const dir = getCodexBridgeDir(rootAbs);
  mkdirSync(dir, { recursive: true });
  const task = {
    schema_version: 1,
    task_id: taskId,
    status: "queued",
    created_at: new Date().toISOString(),
    workspace_root: toRepoRelative(rootAbs),
    ...taskInput
  };
  const path = join(dir, `${taskId}.json`);
  writeJson(path, task);
  appendLedger(rootAbs, {
    action: "codex-bridge-task",
    target_path: toRepoRelative(path),
    details: {
      task_id: taskId,
      task_type: task.task_type,
      title: task.title,
      status: task.status
    }
  });
  return { ...task, path: toRepoRelative(path) };
}

function listCodexBridgeTasks(rootInput) {
  const rootAbs = resolveWorkspacePath(rootInput);
  const dir = getCodexBridgeDir(rootAbs);
  if (!existsSync(dir)) return { ok: true, tasks: [] };
  const tasks = readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
    .map(entry => {
      const path = join(dir, entry.name);
      const task = readJsonIfExists(path) || {};
      return {
        task_id: task.task_id || basename(entry.name, ".json"),
        task_type: task.task_type || "",
        title: task.title || "",
        status: task.status || "queued",
        created_at: task.created_at || "",
        path: toRepoRelative(path)
      };
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { ok: true, tasks };
}

function getCodexBridgeDir(rootAbs) {
  return join(rootAbs, ".story-canvas-codex-bridge");
}

function restoreHistory(body) {
  if (!body.path || !body.history_path || !body.kind) {
    throw new Error("path, history_path, and kind are required");
  }
  const filePath = resolveWorkspacePath(body.path);
  const historyPath = resolveWorkspacePath(body.history_path);
  const folder = dirname(filePath);

  if (!existsSync(historyPath)) throw new Error(`History file not found: ${body.history_path}`);

  if (body.kind === "source") {
    if (existsSync(filePath)) {
      ensureSourceSnapshot(filePath, readFileSync(filePath, "utf8"), "pre-restore-source");
    }
    copyFileSync(historyPath, filePath);
    appendLedger(folder, {
      action: "restore-source",
      target_path: toRepoRelative(filePath),
      history_path: toRepoRelative(historyPath)
    });
    readArticle(filePath, { ensure: true, rootAbs: folder });
    return { ok: true, restored: "source", target_path: toRepoRelative(filePath) };
  }

  if (body.kind === "sidecar") {
    const sidecarPath = getSidecarPath(filePath);
    const restored = JSON.parse(readFileSync(historyPath, "utf8"));
    restored.updated_at = new Date().toISOString();
    writeJsonWithHistory(sidecarPath, restored, {
      action: "restore-sidecar",
      source_path: toRepoRelative(filePath),
      details: { restored_from: toRepoRelative(historyPath) }
    });
    return { ok: true, restored: "sidecar", target_path: toRepoRelative(sidecarPath) };
  }

  throw new Error(`Unknown restore kind: ${body.kind}`);
}

function writeJsonIfMeaningfullyChanged(path, value, meta) {
  const current = readJsonIfExists(path);
  if (current && sameMeaningfulJson(current, value)) return { ok: true, changed: false, path: toRepoRelative(path) };
  return writeJsonWithHistory(path, value, meta);
}

function writeJsonWithHistory(path, value, meta = {}) {
  const folder = dirname(path);
  let historyPath = "";
  if (existsSync(path)) {
    historyPath = makeJsonHistoryPath(path, meta.action || "update");
    mkdirSync(dirname(historyPath), { recursive: true });
    writeFileSync(historyPath, readFileSync(path, "utf8"), "utf8");
  }
  writeJson(path, value);
  appendLedger(folder, {
    action: meta.action || "write-json",
    target_path: toRepoRelative(path),
    history_path: historyPath ? toRepoRelative(historyPath) : "",
    source_path: meta.source_path || "",
    details: meta.details || {}
  });
  return { ok: true, changed: true, path: toRepoRelative(path), history_path: historyPath ? toRepoRelative(historyPath) : "" };
}

function ensureSourceSnapshot(filePath, text, action) {
  const snapshotPath = makeSourceHistoryPath(filePath, text);
  if (existsSync(snapshotPath)) return snapshotPath;
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, text, "utf8");
  appendLedger(dirname(filePath), {
    action,
    target_path: toRepoRelative(filePath),
    history_path: toRepoRelative(snapshotPath),
    details: { source_hash: hash(text) }
  });
  return snapshotPath;
}

function sameMeaningfulJson(left, right) {
  return JSON.stringify(stripVolatileFields(left)) === JSON.stringify(stripVolatileFields(right));
}

function stripVolatileFields(value) {
  if (Array.isArray(value)) return value.map(stripVolatileFields);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "updated_at") continue;
    result[key] = stripVolatileFields(item);
  }
  return result;
}

function makeJsonHistoryPath(path, action) {
  return join(getJsonHistoryDir(path), `${safeTimestamp()}_${safeName(action)}.json`);
}

function makeSourceHistoryPath(filePath, text) {
  const ext = extname(filePath) || ".txt";
  return join(getSourceHistoryDir(filePath), `${hash(text)}${ext}`);
}

function getJsonHistoryDir(path) {
  return join(dirname(path), ".story-history", safeName(basename(path, extname(path))), "sidecar");
}

function getSourceHistoryDir(filePath) {
  return join(dirname(filePath), ".story-history", safeName(basename(filePath, extname(filePath))), "source");
}

function listHistoryFiles(dir, kind) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const path = join(dir, entry.name);
      const stats = statSync(path);
      return {
        kind,
        name: entry.name,
        path: toRepoRelative(path),
        size: stats.size,
        mtime: stats.mtime.toISOString()
      };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

function appendLedger(folder, entry) {
  const ledgerPath = getLedgerPath(folder);
  mkdirSync(dirname(ledgerPath), { recursive: true });
  appendFileSync(ledgerPath, `${JSON.stringify({
    ts: new Date().toISOString(),
    ...entry
  })}\n`, "utf8");
}

function readLedgerEntries(folder, limit) {
  const path = getLedgerPath(folder);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .slice(-limit)
    .map(line => {
      try { return JSON.parse(line); } catch { return { raw: line }; }
    })
    .reverse();
}

function getLedgerPath(folder) {
  return join(folder, ".story-canvas.ledger.jsonl");
}

function resolveDraftFilePath(rootAbs, draft) {
  const relativePath = draft.file_path || `.story-canvas-drafts/${draft.id}.md`;
  const path = resolve(rootAbs, relativePath);
  const normalizedRoot = `${rootAbs}${rootAbs.endsWith("\\") ? "" : "\\"}`;
  if (path !== rootAbs && !path.startsWith(normalizedRoot)) {
    throw new Error(`Draft path escapes root: ${relativePath}`);
  }
  return path;
}

function displayDraftAfter(value) {
  return value === 9998 ? "终" : value;
}

function normalizeDraftRouteMode(value) {
  return value === "interstitial" ? "interstitial" : "branch";
}

function buildDraftGenerationRequest(draft, settings, status) {
  return {
    request_id: `gen-${safeTimestamp()}-${hash(`${draft.id}:${Date.now()}`).slice(0, 6)}`,
    status,
    agent: settings.agent,
    model: settings.model,
    version_count: settings.version_count,
    target_chars: settings.target_chars,
    split_count: settings.split_count,
    split_mode: settings.split_mode,
    prompt_goal: settings.prompt_goal,
    route_mode: normalizeDraftRouteMode(draft.route_mode),
    user_directive: settings.prompt_goal,
    instruction_priority: generationRulePack.priority_order,
    generation_rule_pack: generationRulePack,
    rule_conflict_policy: generationRulePack.conflict_policy,
    created_at: new Date().toISOString()
  };
}

function isGeminiSettings(settings = {}) {
  const agent = String(settings.agent || "").toLowerCase();
  const model = String(settings.model || "").toLowerCase();
  return geminiAgentIds.has(agent) || model.startsWith("gemini-");
}

function resolveGenerationProvider(settings = {}) {
  const agent = String(settings.agent || "").toLowerCase();
  const model = String(settings.model || "").toLowerCase();
  if (isGeminiSettings(settings)) {
    return getGeminiApiKey()
      ? { kind: "gemini", provider: "google-generative-language", direct: true }
      : { kind: "gemini", provider: "google-generative-language", direct: false, reason: "缺少 GOOGLE_API_KEY / GEMINI_API_KEY。" };
  }
  if (agent === "claude-opus-4-7" || model.includes("claude")) {
    const config = getOneAgentConfig();
    return config.configured
      ? { kind: "oneagent-claude", provider: "oneagent", direct: true, config }
      : { kind: "oneagent-claude", provider: "oneagent", direct: false, reason: "缺少 ONEAGENT_BASE_URL / ONEAGENT_API_KEY。" };
  }
  if (agent === "deepseek-v4-pro-260425" || model.includes("deepseek")) {
    const config = getArkConfig();
    return config.configured
      ? { kind: "ark-deepseek", provider: "volcengine-ark", direct: true, config }
      : { kind: "ark-deepseek", provider: "volcengine-ark", direct: false, reason: "缺少 ARK_API_KEY / ARK_BASE_URL。" };
  }
  if (agent === "codex-gpt-5" || model === "gpt-5" || model.includes("codex")) {
    return { kind: "codex-bridge", provider: "codex-bridge", direct: false, reason: "Codex 通过本地桥接任务队列执行，不由 Story Canvas server 直接调用。" };
  }
  return { kind: "record-only", provider: "record-only", direct: false, reason: "该 Agent 当前只记录请求。" };
}

function getLocalEnv() {
  const envPath = join(repoRoot, ".env");
  const values = {};
  if (!existsSync(envPath)) return values;
  const raw = readFileSync(envPath, "utf8");
  for (const rawLine of raw.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    values[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

function envValue(key, fallback = "") {
  const processValue = process.env[key];
  if (processValue && processValue.trim()) return processValue.trim();
  const localValue = getLocalEnv()[key];
  return localValue && localValue.trim() ? localValue.trim() : fallback;
}

function getOneAgentConfig() {
  const baseUrl = envValue("ONEAGENT_BASE_URL");
  const apiKey = envValue("ONEAGENT_API_KEY");
  const model = envValue("ONEAGENT_MODEL", defaultOneAgentModel);
  return {
    configured: Boolean(baseUrl && apiKey && model),
    baseUrl: baseUrl.replace(/\/+$/u, ""),
    apiKey,
    model
  };
}

function getArkConfig() {
  const baseUrl = envValue("ARK_BASE_URL", defaultArkBaseUrl);
  const apiKey = envValue("ARK_API_KEY");
  const model = envValue("ARK_MODEL_DEEPSEEK", defaultArkDeepSeekModel);
  return {
    configured: Boolean(baseUrl && apiKey && model),
    baseUrl: baseUrl.replace(/\/+$/u, ""),
    apiKey,
    model
  };
}

function getGeminiApiKey() {
  const envKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
  if (envKey.trim()) return envKey.trim();
  const localEnvPath = join(repoRoot, ".env");
  if (!existsSync(localEnvPath)) return "";
  const raw = readFileSync(localEnvPath, "utf8");
  const exact = raw.match(/(?:^|\r?\n)(?:GOOGLE_API_KEY|GEMINI_API_KEY)=([^\r\n]+)/u);
  if (exact?.[1]) {
    const value = exact[1].trim();
    return value.match(/AIza[0-9A-Za-z_-]{35}/u)?.[0] || value;
  }
  return raw.match(/AIza[0-9A-Za-z_-]{35}/u)?.[0] || "";
}

function getGeminiModel(model) {
  const value = String(model || "").trim();
  if (value) return value;
  return process.env.GOOGLE_GEMINI_MODEL || process.env.GEMINI_MODEL || defaultGeminiModel;
}

async function buildDraftGenerationContext(rootAbs, draft) {
  const groups = await readChapterGroups(rootAbs);
  const afterGroup = groups.find(group => group.group_key === draft.after_group_key);
  const beforeGroup = groups.find(group => group.group_key === draft.before_group_key);
  const filePath = resolveDraftFilePath(rootAbs, draft);
  const currentDraftText = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  return {
    after_title: draft.after_title || afterGroup?.title || "",
    before_title: draft.before_title || beforeGroup?.title || "",
    route_mode: normalizeDraftRouteMode(draft.route_mode),
    current_draft_text: currentDraftText,
    upstream_text: groupText(afterGroup, 9000),
    downstream_text: groupText(beforeGroup, 7000)
  };
}

async function readChapterGroups(rootAbs) {
  const files = await collectTextFiles(rootAbs);
  const articles = files.map(file => readArticle(file, { ensure: false, rootAbs }));
  const groupsByKey = new Map();
  for (const article of articles) {
    const groupKey = `${article.relative_dir || "."}::${article.chapter_key}`;
    if (!groupsByKey.has(groupKey)) {
      groupsByKey.set(groupKey, {
        group_key: groupKey,
        title: article.chapter_title,
        relative_dir: article.relative_dir,
        chapter_no: article.chapter_no,
        parts: []
      });
    }
    groupsByKey.get(groupKey).parts.push(article);
  }
  return Array.from(groupsByKey.values())
    .map(group => ({ ...group, parts: group.parts.sort(compareParts) }))
    .sort(compareGroups);
}

function groupText(group, maxChars) {
  if (!group) return "";
  const text = group.parts
    .map(part => `## ${part.part_label || part.title}\n\n${part.blocks.map(block => block.text).join("\n\n")}`)
    .join("\n\n");
  return clipText(text, maxChars);
}

function buildDraftGenerationPrompt({ draft, settings, context, versionIndex }) {
  const routeMode = normalizeDraftRouteMode(draft.route_mode);
  const routeLabel = routeMode === "interstitial" ? "相邻章节之间的插入续写" : "从当前节点派生的独立分支续写";
  const splitInstruction = settings.split_mode === "chapter_nodes" || settings.split_count > 1
    ? `请直接拆成 ${settings.split_count} 个章节段落，用 Markdown 二级标题标出每个章节，章节之间用 --- 分隔。`
    : "请生成一段可直接放入草稿节点的连续正文。";
  return [
    "你是 KVA Story Canvas 的本机候选正文生成器。",
    "只输出候选正文，不要输出分析、说明、清单、免责声明或代码块。",
    "当前任务是小说续写/分支试写。候选正文不会自动进入主干，后续由用户筛选。",
    `生成类型：${routeLabel}`,
    `候选编号：${versionIndex}`,
    `目标字数：约 ${settings.target_chars} 个非空白中文字符。`,
    splitInstruction,
    "必须优先执行用户方向意见；若上下游文本与用户意见冲突，以用户意见为准，但保持人物关系、时间顺序和场景衔接尽量自然。",
    "",
    "## 用户方向意见",
    settings.prompt_goal || "无额外方向，延续上游章节的事件、人物动机和叙述节奏。",
    "",
    "## 上游章节/节点",
    context.upstream_text || context.after_title || "无上游正文。",
    "",
    "## 下游章节/节点",
    routeMode === "interstitial"
      ? (context.downstream_text || context.before_title || "无下游正文。")
      : "独立分支路线，无需承接下游节点。",
    "",
    "## 当前草稿已有文本",
    clipText(context.current_draft_text, 5000) || "空草稿。",
    "",
    "现在开始输出候选正文："
  ].join("\n");
}

function normalizeRerollGenerationSettings(input = {}, fallback = {}) {
  const merged = {
    agent: "trae-main",
    model: "",
    version_count: 1,
    target_chars: fallback.target_chars || 3000,
    split_count: 1,
    split_mode: "single_segment",
    prompt_goal: fallback.prompt_goal || "",
    ...(input && typeof input === "object" ? input : {})
  };
  const settings = normalizeGenerationSettings(merged, fallback);
  return {
    ...settings,
    version_count: clampInteger(merged.version_count, 1, 8, 1),
    split_count: 1,
    split_mode: "single_segment",
    prompt_goal: String(merged.prompt_goal || fallback.prompt_goal || "").slice(0, 12000)
  };
}

async function maybeGenerateRerollCandidates({ type, label, goal, sourceText, settings }) {
  const provider = resolveGenerationProvider(settings);
  if (!provider.direct) return [];
  return generateTextCandidates({
    settings,
    provider,
    count: settings.version_count,
    versionPrefix: `${safeName(label || type)}-${safeTimestamp()}`,
    makePrompt: versionIndex => buildRerollGenerationPrompt({
      type,
      label,
      goal,
      sourceText,
      settings,
      versionIndex
    })
  });
}

function buildRerollGenerationPrompt({ type, label, goal, sourceText, settings, versionIndex }) {
  const typeLabel = {
    block: "剧情块",
    part: "文章部分",
    chapter: "整章"
  }[type] || "文本";
  return [
    "你是 KVA Story Canvas 的本机重Roll候选生成器。",
    "只输出可替换当前选区的候选正文，不要输出分析、说明、清单、免责声明或代码块。",
    `重Roll范围：${typeLabel}`,
    `目标对象：${label || "未命名"}`,
    `候选编号：${versionIndex}`,
    `目标字数：约 ${settings.target_chars} 个非空白中文字符。`,
    "用户重构框意见的优先级高于既有通用写作规则；但应尽量保留锁定事实、人物关系、时间线和场景衔接。",
    "",
    "## 用户重Roll反馈",
    goal || "无额外反馈。",
    "",
    "## 原选区文本",
    clipText(sourceText, 18000) || "无原文。",
    "",
    "现在开始输出候选正文："
  ].join("\n");
}

async function generateTextCandidates({ settings, provider, count, versionPrefix, makePrompt }) {
  const createdAt = new Date().toISOString();
  const tasks = Array.from({ length: count }, async (_, taskIndex) => {
    const index = taskIndex + 1;
    const prompt = makePrompt(index);
    const model = providerModel(provider, settings);
    const candidateText = cleanGeneratedText(await callProviderText(provider, { model, prompt, settings }));
    return {
      version_id: `${versionPrefix}-v${String(index).padStart(3, "0")}`,
      status: "generated",
      agent: settings.agent,
      model,
      provider: provider.provider,
      target_chars: settings.target_chars,
      version_index: index,
      candidate_text: candidateText,
      candidate_chars: countNonspace(candidateText),
      preview: previewText(candidateText),
      created_at: createdAt
    };
  });
  return Promise.all(tasks);
}

function providerModel(provider, settings) {
  if (provider.kind === "gemini") return getGeminiModel(settings.model);
  if (provider.kind === "oneagent-claude") return provider.config?.model || settings.model || defaultOneAgentModel;
  if (provider.kind === "ark-deepseek") return provider.config?.model || settings.model || defaultArkDeepSeekModel;
  return settings.model || defaultModelForAgent(settings.agent);
}

async function callProviderText(provider, request) {
  if (provider.kind === "gemini") return callGeminiText(request);
  if (provider.kind === "oneagent-claude") return callOneAgentText(provider.config, request);
  if (provider.kind === "ark-deepseek") return callArkText(provider.config, request);
  throw new Error(`Provider does not support direct generation: ${provider.kind}`);
}

async function callGeminiText({ model, prompt }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("Missing GOOGLE_API_KEY or GEMINI_API_KEY in local environment.");
  const response = await fetch(`${geminiApiBase}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.85,
        topP: 0.95
      }
    })
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    const message = data?.error?.message || raw || `HTTP ${response.status}`;
    throw new Error(`Gemini API request failed: ${message}`);
  }
  const text = data?.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!text) throw new Error("Gemini API returned no text candidate.");
  return text;
}

async function callOneAgentText(config, { model, prompt, settings }) {
  if (!config?.configured) throw new Error("OneAgent is not configured.");
  const response = await fetch(`${config.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": config.apiKey
    },
    body: JSON.stringify({
      model: model || config.model,
      max_tokens: generationMaxTokens(settings),
      messages: [{ role: "user", content: prompt }]
    })
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    const message = data?.error?.message || raw || `HTTP ${response.status}`;
    throw new Error(`OneAgent request failed: ${message}`);
  }
  const text = data?.content
    ?.map(part => part.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!text) throw new Error("OneAgent returned no text candidate.");
  return text;
}

async function callArkText(config, { model, prompt, settings }) {
  if (!config?.configured) throw new Error("Ark DeepSeek is not configured.");
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: model || config.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: generationMaxTokens(settings),
      temperature: 0.85,
      top_p: 0.95
    })
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    const message = data?.error?.message || raw || `HTTP ${response.status}`;
    throw new Error(`Ark DeepSeek request failed: ${message}`);
  }
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Ark DeepSeek returned no text candidate.");
  return text;
}

function generationMaxTokens(settings = {}) {
  return Math.max(512, Math.min(8192, Math.ceil((Number(settings.target_chars) || 3000) * 1.6)));
}

function buildRerollSlots({ prefix, currentCount, goal, settings, candidates, fallbackCandidateText }) {
  const source = candidates.length
    ? candidates
    : [{
        version_id: "",
        status: fallbackCandidateText ? "generated" : "pending",
        candidate_text: fallbackCandidateText || "",
        candidate_chars: countNonspace(fallbackCandidateText || ""),
        preview: previewText(fallbackCandidateText || ""),
        agent: settings.agent,
        model: settings.model,
        target_chars: settings.target_chars,
        created_at: new Date().toISOString()
      }];
  return source.map((candidate, index) => {
    const next = String(currentCount + index + 1).padStart(3, "0");
    return {
      version_id: `${prefix}-r${next}`,
      generation_candidate_id: candidate.version_id || "",
      status: candidate.status || "pending",
      goal,
      user_directive: goal,
      agent: candidate.agent || settings.agent,
      model: candidate.model || settings.model,
      target_chars: candidate.target_chars || settings.target_chars,
      instruction_priority: generationRulePack.priority_order,
      generation_rule_pack: generationRulePack,
      rule_conflict_policy: generationRulePack.conflict_policy,
      candidate_text: candidate.candidate_text || "",
      candidate_chars: candidate.candidate_chars || countNonspace(candidate.candidate_text || ""),
      preview: candidate.preview || previewText(candidate.candidate_text || ""),
      created_at: candidate.created_at || new Date().toISOString()
    };
  });
}

function summarizeCandidates(candidates) {
  return candidates.map(candidate => ({
    version_id: candidate.version_id,
    status: candidate.status,
    agent: candidate.agent,
    model: candidate.model,
    candidate_chars: candidate.candidate_chars,
    preview: candidate.preview,
    created_at: candidate.created_at
  }));
}

function cleanGeneratedText(text) {
  let value = String(text || "").trim();
  const fence = value.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/u);
  if (fence) value = fence[1].trim();
  return value;
}

function previewText(text) {
  return String(text || "").replace(/\s+/gu, " ").trim().slice(0, 160);
}

function clipText(text, maxChars) {
  const value = String(text || "").trim();
  if (!maxChars || value.length <= maxChars) return value;
  const headLength = Math.floor(maxChars * 0.62);
  const tailLength = Math.floor(maxChars * 0.3);
  return `${value.slice(0, headLength)}\n\n[...中间省略...]\n\n${value.slice(-tailLength)}`;
}

function normalizeWorkspaceState(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const transform = source.transform && typeof source.transform === "object" ? source.transform : {};
  return {
    transform: {
      x: clampNumber(transform.x, -20000, 20000, 70),
      y: clampNumber(transform.y, -20000, 20000, 80),
      scale: clampNumber(transform.scale, 0.25, 3, 1)
    },
    selected_group_id: String(source.selected_group_id || "").slice(0, 120),
    selected_part_path: String(source.selected_part_path || "").slice(0, 500),
    selected_block_id: String(source.selected_block_id || "").slice(0, 80),
    expanded_group_ids: Array.isArray(source.expanded_group_ids)
      ? source.expanded_group_ids.map(item => String(item).slice(0, 120)).slice(0, 200)
      : [],
    sidebar_collapsed: Boolean(source.sidebar_collapsed),
    inspector_width: clampInteger(source.inspector_width, 360, 820, 520)
  };
}

function normalizeGenerationSettings(input = {}, fallback = {}) {
  const source = {
    ...(fallback && typeof fallback === "object" ? fallback : {}),
    ...(input && typeof input === "object" ? input : {})
  };
  const agent = normalizeAgent(source.agent);
  const splitCount = clampInteger(source.split_count, 1, 4, 1);
  return {
    agent,
    model: String(source.model || defaultModelForAgent(agent)).trim().slice(0, 120),
    version_count: clampInteger(source.version_count, 1, 8, 3),
    target_chars: clampInteger(source.target_chars, 200, 50000, 3000),
    split_count: splitCount,
    split_mode: source.split_mode === "chapter_nodes" || splitCount > 1 ? "chapter_nodes" : "single_segment",
    prompt_goal: String(source.prompt_goal || "").slice(0, 12000)
  };
}

function normalizeAgent(value) {
  const agent = String(value || "").trim();
  if (["trae-main", "codex-gpt-5", "claude-opus-4-7", "deepseek-v4-pro-260425", "gemini-flash-latest", "gemini-3.5-flash", "manual"].includes(agent)) {
    return agent;
  }
  return "trae-main";
}

function defaultModelForAgent(agent) {
  if (agent === "claude-opus-4-7") return "claude-opus-4-7";
  if (agent === "deepseek-v4-pro-260425") return "deepseek-v4-pro-260425";
  if (agent === "codex-gpt-5") return "gpt-5";
  if (agent === "gemini-flash-latest" || agent === "gemini-3.5-flash") return process.env.GOOGLE_GEMINI_MODEL || process.env.GEMINI_MODEL || defaultGeminiModel;
  if (agent === "manual") return "manual";
  return "trae-main";
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeName(value) {
  return String(value || "item").replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").slice(0, 120);
}

function compareGroups(a, b) {
  return (a.chapter_no - b.chapter_no)
    || a.relative_dir.localeCompare(b.relative_dir, "zh-Hans-CN")
    || a.title.localeCompare(b.title, "zh-Hans-CN");
}

function compareParts(a, b) {
  return (a.part_order - b.part_order)
    || a.path.localeCompare(b.path, "zh-Hans-CN");
}

function getSidecarPath(filePath) {
  const ext = extname(filePath);
  return join(dirname(filePath), `${basename(filePath, ext)}.story.json`);
}

function getFolderIndexPath(rootAbs) {
  return join(rootAbs, ".story-canvas.folder.json");
}

function readFolderIndex(rootAbs) {
  const path = getFolderIndexPath(rootAbs);
  return { path, ...(readJsonIfExists(path) || { positions: {} }) };
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function stripTrailingStats(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n# 本章字数统计[\s\S]*$/u, "").trim();
}

function countNonspace(text) {
  return Array.from(String(text)).filter(char => !/\s/u.test(char)).length;
}

function hash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function stableId(value) {
  return `node-${hash(value)}`;
}

function resolveWorkspacePath(input) {
  const raw = String(input || "").trim();
  const path = resolve(raw.match(/^[A-Za-z]:[\\/]/) ? raw : join(repoRoot, raw));
  const normalizedRoot = `${repoRoot}${repoRoot.endsWith("\\") ? "" : "\\"}`;
  if (path !== repoRoot && !path.startsWith(normalizedRoot)) {
    throw new Error(`Path escapes workspace: ${input}`);
  }
  return path;
}

function toRepoRelative(path) {
  return relative(repoRoot, path).replace(/\\/g, "/");
}

function streamPublicAsset(res, requestPath) {
  const publicDir = join(toolDir, "public");
  const assetName = decodeURIComponent(requestPath.slice(publicAssetsPath.length));
  const filePath = resolve(publicDir, assetName);
  const normalizedPublicDir = `${publicDir}${publicDir.endsWith("\\") ? "" : "\\"}`;
  if (filePath !== publicDir && !filePath.startsWith(normalizedPublicDir)) {
    return sendJson(res, { error: "Asset path escapes public directory" }, 400);
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return sendJson(res, { error: "Asset not found" }, 404);
  }
  return streamFile(res, filePath, contentTypeFor(filePath));
}

function contentTypeFor(filePath) {
  const type = {
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml; charset=utf-8",
    ".webp": "image/webp"
  }[extname(filePath).toLowerCase()];
  return type || "application/octet-stream";
}

function streamFile(res, path, contentType) {
  res.writeHead(200, { "Content-Type": contentType });
  createReadStream(path).pipe(res);
}

function sendJson(res, value, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value, null, 2));
}

function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 10 * 1024 * 1024) rejectBody(new Error("Request body too large"));
    });
    req.on("end", () => {
      try {
        resolveBody(data ? JSON.parse(data) : {});
      } catch (error) {
        rejectBody(error);
      }
    });
    req.on("error", rejectBody);
  });
}
