#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCENE_SLUG = "blue_space_bridge_0421";
const DEFAULT_LEDGER_NAME = "production-ledger.jsonl";
const DEFAULT_SCHEMA_VERSION = 1;

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

const projectRoot = resolvePath(opts.projectRoot || findProjectRoot(process.cwd()));
const sceneSlug = opts.sceneSlug || DEFAULT_SCENE_SLUG;
const sceneRoot = resolvePath(
  opts.sceneRoot || join(projectRoot, "bluespace", "outputs", sceneSlug),
);
const ledgerPath = resolvePath(
  opts.ledger || join(sceneRoot, "_ledger", DEFAULT_LEDGER_NAME),
);

try {
  if (opts.command === "init") {
    await commandInit();
  } else if (opts.command === "import-video-batches") {
    await commandImportVideoBatches();
  } else if (["ingest", "ingest-shot-media", "discover-shot-media"].includes(opts.command)) {
    await commandDiscoverShotMedia();
  } else if (["enrich-recipes", "enrich-shot-recipes"].includes(opts.command)) {
    await commandEnrichRecipes();
  } else if (opts.command === "add") {
    await commandAdd();
  } else if (opts.command === "validate") {
    await commandValidate();
  } else if (opts.command === "summary") {
    await commandSummary();
  } else if (["prompt-index", "write-prompt-index"].includes(opts.command)) {
    await commandPromptIndex();
  } else if (opts.command === "find") {
    await commandFind();
  } else if (opts.command === "recipe") {
    await commandRecipe();
  } else {
    throw new Error(`Unknown command: ${opts.command}`);
  }
} catch (error) {
  console.error(`production-ledger: ${error.message}`);
  process.exit(1);
}

async function commandInit() {
  await mkdir(dirname(ledgerPath), { recursive: true });
  if (!existsSync(ledgerPath)) {
    await writeFile(ledgerPath, "", "utf8");
  }

  const schemaPath = join(dirname(ledgerPath), "production-ledger.schema.json");
  if (!existsSync(schemaPath) || opts.overwrite) {
    await writeFile(schemaPath, `${JSON.stringify(buildSchema(), null, 2)}\n`, "utf8");
  }

  const readmePath = join(dirname(ledgerPath), "README.md");
  if (!existsSync(readmePath) || opts.overwrite) {
    await writeFile(readmePath, buildLedgerReadme(), "utf8");
  }

  console.log(`Initialized ledger: ${toProjectRel(ledgerPath)}`);
}

async function commandImportVideoBatches() {
  const sourcePath = resolvePath(
    opts.source ||
      join(
        projectRoot,
        "bluespace",
        "scenes",
        "blue-space-bridge-0421",
        "storyboard",
        "VIDEO_BATCHES.md",
      ),
  );

  const sourceText = await readFile(sourcePath, "utf8");
  const existing = await readLedgerIfExists();
  const existingKeys = new Set();
  for (const entry of existing.entries) {
    existingKeys.add(entry.entry_id);
    if (entry.generation?.task_id) existingKeys.add(`task:${entry.generation.task_id}`);
    if (entry.asset?.output_path) existingKeys.add(`output:${normalizeSlashes(entry.asset.output_path)}`);
  }

  const outputIndex = await buildOutputIndex();
  const imported = parseVideoBatches(sourceText, sourcePath, outputIndex);
  const newEntries = [];
  const skipped = [];

  for (const entry of imported) {
    const keys = [
      entry.entry_id,
      entry.generation?.task_id ? `task:${entry.generation.task_id}` : null,
      entry.asset?.output_path ? `output:${normalizeSlashes(entry.asset.output_path)}` : null,
    ].filter(Boolean);

    if (!opts.overwrite && keys.some((key) => existingKeys.has(key))) {
      skipped.push(entry);
      continue;
    }

    newEntries.push(entry);
    for (const key of keys) existingKeys.add(key);
  }

  if (opts.dryRun) {
    console.log(
      JSON.stringify(
        {
          source: toProjectRel(sourcePath),
          would_import: newEntries.length,
          skipped_duplicates: skipped.length,
          entries: newEntries,
        },
        null,
        2,
      ),
    );
    return;
  }

  await mkdir(dirname(ledgerPath), { recursive: true });
  if (opts.overwrite) {
    await writeFile(ledgerPath, entriesToJsonl(newEntries), "utf8");
  } else if (newEntries.length > 0) {
    await appendFile(ledgerPath, entriesToJsonl(newEntries), "utf8");
  } else if (!existsSync(ledgerPath)) {
    await writeFile(ledgerPath, "", "utf8");
  }

  console.log(
    `Imported ${newEntries.length} entries from ${toProjectRel(sourcePath)}; skipped ${skipped.length} duplicates.`,
  );
}

async function commandDiscoverShotMedia() {
  const shotsRoot = resolvePath(opts.shotsRoot || join(sceneRoot, "shots"));
  if (!existsSync(shotsRoot)) {
    throw new Error(`Shots root does not exist: ${toProjectRel(shotsRoot)}`);
  }

  const existing = await readLedgerIfExists();
  const existingKeys = new Set();
  for (const entry of existing.entries) {
    existingKeys.add(entry.entry_id);
    if (entry.asset?.output_path) existingKeys.add(`output:${normalizeSlashes(entry.asset.output_path)}`);
  }

  const discovered = [];
  const skipped = [];
  for (const filePath of await walkFiles(shotsRoot)) {
    const candidate = classifyShotMedia(filePath, shotsRoot);
    if (!candidate.include) {
      if (candidate.reason) skipped.push(candidate);
      continue;
    }
    const entry = buildDiscoveredEntry(filePath, candidate);
    const outputKey = `output:${normalizeSlashes(entry.asset.output_path)}`;
    if (existingKeys.has(entry.entry_id) || existingKeys.has(outputKey)) {
      skipped.push({ ...candidate, reason: "duplicate", path: entry.asset.output_path });
      continue;
    }
    discovered.push(entry);
    existingKeys.add(entry.entry_id);
    existingKeys.add(outputKey);
  }

  const summary = {
    shots_root: toProjectRel(shotsRoot),
    discovered: discovered.length,
    skipped: skipped.length,
    by_role: countBy(discovered, (entry) => entry.asset?.spec?.role || "unknown"),
    by_kind: countBy(discovered, (entry) => entry.asset?.kind || "unknown"),
    by_shot: countBy(discovered, (entry) => entry.shot_id || "(unmapped)"),
  };

  if (opts.dryRun || opts.json) {
    const output = opts.json
      ? { ...summary, entries: opts.dryRun ? discovered : undefined }
      : summary;
    console.log(JSON.stringify(output, null, 2));
    if (opts.dryRun) return;
  }

  if (discovered.length > 0) {
    await mkdir(dirname(ledgerPath), { recursive: true });
    await appendFile(ledgerPath, entriesToJsonl(discovered), "utf8");
  } else if (!existsSync(ledgerPath)) {
    await writeFile(ledgerPath, "", "utf8");
  }

  if (!opts.json) {
    console.log(
      `Discovered ${discovered.length} shot media entries from ${toProjectRel(shotsRoot)}; skipped ${skipped.length}.`,
    );
    printCounts("By role", summary.by_role);
    printCounts("By shot", summary.by_shot);
  }
}

async function commandEnrichRecipes() {
  const shotsRoot = resolvePath(opts.shotsRoot || join(sceneRoot, "shots"));
  if (!existsSync(shotsRoot)) {
    throw new Error(`Shots root does not exist: ${toProjectRel(shotsRoot)}`);
  }

  const { entries, lineErrors } = await readLedgerIfExists();
  if (lineErrors.length > 0) {
    throw new Error(`Cannot enrich recipes while ledger has JSON errors: ${lineErrors[0].message}`);
  }

  const recipeIndex = await buildGenerationLogRecipeIndex(shotsRoot);
  const changed = [];
  const promptWrites = [];
  const nextEntries = [];

  for (const entry of entries) {
    const result = enrichEntryRecipe(entry, recipeIndex);
    nextEntries.push(result.entry);
    if (result.changed) changed.push(result.summary);
    if (result.promptWrite) promptWrites.push(result.promptWrite);
  }

  const summary = {
    ledger: toProjectRel(ledgerPath),
    shots_root: toProjectRel(shotsRoot),
    scanned_logs: recipeIndex.scannedLogs,
    recipes: recipeIndex.recipesByTask.size,
    changed: changed.length,
    changed_entries: changed,
  };

  if (opts.json || opts.dryRun) {
    console.log(JSON.stringify(summary, null, 2));
  }
  if (!opts.dryRun && changed.length > 0) {
    for (const promptWrite of promptWrites) {
      const promptPath = resolveMaybeProjectRelative(promptWrite.prompt_file);
      await mkdir(dirname(promptPath), { recursive: true });
      if (!existsSync(promptPath) || opts.overwrite) {
        await writeFile(promptPath, buildEnrichedPromptFile(promptWrite), "utf8");
      }
    }
    await mkdir(dirname(ledgerPath), { recursive: true });
    await writeFile(ledgerPath, entriesToJsonl(nextEntries), "utf8");
  }
  if (!opts.json && !opts.dryRun) {
    console.log(
      `Enriched ${changed.length} ledger entries from ${recipeIndex.scannedLogs} generation log(s).`,
    );
  }
}

async function commandAdd() {
  if (!opts.title) throw new Error("--title is required for add");
  if (!opts.output) throw new Error("--output is required for add");

  const outputPath = resolveMaybeProjectRelative(opts.output);
  const projectOutputPath = toProjectRel(outputPath);
  const inferred = inferAsset(projectOutputPath, opts.title);
  const entry = {
    schema_version: DEFAULT_SCHEMA_VERSION,
    entry_id:
      opts.entryId ||
      buildEntryId(opts.taskId, `${projectOutputPath}|${opts.title}|${new Date().toISOString()}`),
    scene_slug: sceneSlug,
    shot_id: opts.shotId || inferShotId(projectOutputPath),
    legacy_id: opts.legacyId || inferred.legacy_id,
    title: opts.title,
    lifecycle_status: opts.status || "generated",
    asset: {
      kind: opts.assetKind || inferred.kind,
      model: opts.model || inferred.model,
      output_path: projectOutputPath,
      declared_output_path: opts.declaredOutput ? normalizeSlashes(opts.declaredOutput) : null,
      exists: existsSync(outputPath),
      spec: {
        resolution: opts.resolution || inferred.resolution,
        aspect_ratio: opts.aspectRatio || inferred.aspect_ratio,
        duration_seconds: opts.durationSeconds ? Number(opts.durationSeconds) : null,
        audio: opts.audio || null,
        version: opts.version || inferred.version,
      },
    },
    generation: {
      tool: opts.tool || "imagine-cli",
      mode: opts.mode || inferred.mode,
      task_id: opts.taskId || null,
      command: opts.commandText || null,
      prompt: opts.prompt || null,
      prompt_file: opts.promptFile ? normalizeSlashes(opts.promptFile) : null,
      negative_prompt: opts.negativePrompt || null,
      prompt_summary: opts.promptSummary || null,
      seed: opts.seed || null,
      settings: opts.settings,
      references: opts.refs.map(parseReferenceArg),
    },
    review: {
      verdict: opts.review || "needs_review",
      notes: opts.notes,
      pending_checks: [],
    },
    provenance: {
      source_kind: "manual_add",
      source_path: null,
      source_heading: null,
      source_line: null,
      ingested_at: new Date().toISOString(),
    },
  };

  await mkdir(dirname(ledgerPath), { recursive: true });
  await appendFile(ledgerPath, `${JSON.stringify(entry)}\n`, "utf8");
  console.log(`Added ${entry.entry_id}: ${entry.asset.output_path}`);
}

async function commandValidate() {
  const { entries, lineErrors } = await readLedgerIfExists();
  const errors = [...lineErrors];
  const warnings = [];
  const seenEntryIds = new Map();
  const seenTaskIds = new Map();
  const seenOutputs = new Map();

  entries.forEach((entry, index) => {
    const line = entry.__line || index + 1;
    for (const message of validateEntryShape(entry)) {
      errors.push({ line, message });
    }

    checkDuplicate("entry_id", entry.entry_id, seenEntryIds, line, warnings);
    checkDuplicate("task_id", entry.generation?.task_id, seenTaskIds, line, warnings);
    checkDuplicate("output_path", normalizeSlashes(entry.asset?.output_path), seenOutputs, line, warnings);

    const outputPath = entry.asset?.output_path ? resolveMaybeProjectRelative(entry.asset.output_path) : null;
    if (outputPath && !existsSync(outputPath)) {
      warnings.push({
        line,
        message: `Output does not exist: ${entry.asset.output_path}`,
      });
    }

    const promptFile = entry.generation?.prompt_file ? resolveMaybeProjectRelative(entry.generation.prompt_file) : null;
    if (promptFile && !existsSync(promptFile)) {
      warnings.push({
        line,
        message: `Prompt file does not exist: ${entry.generation.prompt_file}`,
      });
    }

    const inferredShotId = entry.asset?.output_path ? inferShotId(entry.asset.output_path) : null;
    if (inferredShotId && entry.shot_id && inferredShotId !== entry.shot_id) {
      warnings.push({
        line,
        message: `shot_id ${entry.shot_id} does not match output folder ${inferredShotId}`,
      });
    }

    const recipeWarning = validateGenerationRecipe(entry);
    if (recipeWarning) {
      warnings.push({ line, message: recipeWarning });
    }
  });

  const result = {
    ledger: toProjectRel(ledgerPath),
    entries: entries.length,
    errors: errors.length,
    warnings: warnings.length,
  };

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ...result,
          error_items: errors,
          warning_items: warnings,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Ledger: ${result.ledger}`);
    console.log(`Entries: ${result.entries}`);
    console.log(`Errors: ${result.errors}`);
    console.log(`Warnings: ${result.warnings}`);
    printIssues("Errors", errors);
    printIssues("Warnings", warnings);
  }

  if (errors.length > 0 || (opts.strict && warnings.length > 0)) {
    process.exit(1);
  }
}

async function commandSummary() {
  const { entries } = await readLedgerIfExists();
  const summary = {
    ledger: toProjectRel(ledgerPath),
    entries: entries.length,
    by_model: countBy(entries, (entry) => entry.asset?.model || "unknown"),
    by_status: countBy(entries, (entry) => entry.lifecycle_status || "unknown"),
    by_review: countBy(entries, (entry) => entry.review?.verdict || "unknown"),
    by_shot: countBy(entries, (entry) => entry.shot_id || "(unmapped)"),
    prompt_coverage: countBy(entries, promptCoverageLabel),
    missing_outputs: entries.filter((entry) => {
      if (!entry.asset?.output_path) return true;
      return !existsSync(resolveMaybeProjectRelative(entry.asset.output_path));
    }).length,
  };

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`Ledger: ${summary.ledger}`);
  console.log(`Entries: ${summary.entries}`);
  console.log(`Missing outputs: ${summary.missing_outputs}`);
  printCounts("By model", summary.by_model);
  printCounts("By status", summary.by_status);
  printCounts("By review", summary.by_review);
  printCounts("By shot", summary.by_shot);
  printCounts("Prompt coverage", summary.prompt_coverage);
}

async function commandPromptIndex() {
  const { entries, lineErrors } = await readLedgerIfExists();
  if (lineErrors.length > 0) {
    throw new Error(`Cannot write prompt index while ledger has JSON errors: ${lineErrors[0].message}`);
  }

  const assets = entries.map((entry) => ({
    entry_id: entry.entry_id,
    shot_id: entry.shot_id || null,
    title: entry.title || entry.asset?.output_path || entry.entry_id,
    output_path: normalizeSlashes(entry.asset?.output_path || ""),
    kind: entry.asset?.kind || inferAsset(entry.asset?.output_path || "", entry.title || "").kind,
    model: entry.asset?.model || entry.generation?.tool || "unknown",
    tool: entry.generation?.tool || "unknown",
    task_id: entry.generation?.task_id || null,
    prompt_status: promptStatus(entry),
    prompt_file: entry.generation?.prompt_file || null,
    has_inline_prompt: Boolean(entry.generation?.prompt),
    prompt_summary: entry.generation?.prompt_summary || null,
    recipe_source_path: entry.provenance?.recipe_source_path || null,
  }));

  const index = {
    kind: "production_prompt_index",
    schema_version: 1,
    generated_at: new Date().toISOString(),
    ledger: toProjectRel(ledgerPath),
    counts: countBy(assets, (item) => item.prompt_status),
    assets,
  };
  const indexPath = join(dirname(ledgerPath), "prompt-index.json");
  if (opts.json || opts.dryRun) {
    console.log(JSON.stringify(index, null, 2));
  }
  if (!opts.dryRun) {
    await mkdir(dirname(indexPath), { recursive: true });
    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  }
  if (!opts.json && !opts.dryRun) {
    console.log(`Wrote ${toProjectRel(indexPath)}`);
    printCounts("Prompt status", index.counts);
  }
}

async function commandFind() {
  const { entries, lineErrors } = await readLedgerIfExists();
  if (lineErrors.length > 0) {
    throw new Error(`Cannot query ledger while it has JSON errors: ${lineErrors[0].message}`);
  }
  const matches = filterLedgerEntries(entries);
  const limit = opts.limit || 20;
  const result = {
    ledger: toProjectRel(ledgerPath),
    total_matches: matches.length,
    returned: Math.min(matches.length, limit),
    entries: matches.slice(0, limit).map(compactLedgerEntry),
  };

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Ledger: ${result.ledger}`);
  console.log(`Matches: ${result.total_matches}; returned: ${result.returned}`);
  for (const item of result.entries) {
    console.log(
      [
        item.entry_id,
        item.shot_id || "(no-shot)",
        item.review || "unknown",
        item.kind || "asset",
        item.model || "unknown",
        item.prompt_status || "missing",
        item.output_path,
      ].join(" | "),
    );
  }
}

async function commandRecipe() {
  if (!opts.entryId && !opts.output && !opts.taskId) {
    throw new Error("recipe requires --entry-id, --output, or --task-id");
  }
  const { entries, lineErrors } = await readLedgerIfExists();
  if (lineErrors.length > 0) {
    throw new Error(`Cannot query recipe while ledger has JSON errors: ${lineErrors[0].message}`);
  }
  const matches = filterLedgerEntries(entries);
  if (matches.length === 0) throw new Error("No matching ledger entry found.");
  if (matches.length > 1) {
    throw new Error(`Recipe query matched ${matches.length} entries. Narrow it with --entry-id, --output, or --task-id.`);
  }

  const entry = matches[0];
  const recipe = {
    ledger: toProjectRel(ledgerPath),
    entry_id: entry.entry_id,
    shot_id: entry.shot_id || null,
    title: entry.title || null,
    output_path: normalizeSlashes(entry.asset?.output_path || ""),
    review: entry.review?.verdict || null,
    prompt_status: promptStatus(entry),
    generation: entry.generation || {},
    provenance: entry.provenance || {},
  };

  if (opts.json) {
    console.log(JSON.stringify(recipe, null, 2));
    return;
  }

  console.log(`Entry: ${recipe.entry_id}`);
  console.log(`Shot: ${recipe.shot_id || "(none)"}`);
  console.log(`Title: ${recipe.title || "(none)"}`);
  console.log(`Output: ${recipe.output_path}`);
  console.log(`Review: ${recipe.review || "(none)"}`);
  console.log(`Prompt status: ${recipe.prompt_status}`);
  if (recipe.generation.prompt_file) console.log(`Prompt file: ${recipe.generation.prompt_file}`);
  if (recipe.generation.task_id) console.log(`Task id: ${recipe.generation.task_id}`);
  if (recipe.generation.prompt) {
    console.log("");
    console.log(recipe.generation.prompt);
  } else if (recipe.generation.prompt_summary) {
    console.log(`Summary: ${recipe.generation.prompt_summary}`);
  }
}

function parseVideoBatches(sourceText, sourcePath, outputIndex) {
  const lines = sourceText.split(/\r?\n/);
  const selectedOutputs = collectSelectedOutputNames(lines);
  const entries = [];
  let currentBatchHeading = null;
  let currentSubheading = null;
  let currentDate = null;
  let currentOutputDir = null;
  let inOutputTable = false;

  lines.forEach((line, index) => {
    const heading = line.match(/^(#{2,4})\s+(.+?)\s*$/);
    if (heading) {
      const headingText = heading[2].trim();
      if (heading[1].length === 2) {
        currentBatchHeading = headingText;
        currentSubheading = null;
        const dateMatch = currentBatchHeading.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
        if (dateMatch) currentDate = dateMatch[1];
      } else {
        currentSubheading = headingText;
      }
      inOutputTable = false;
      return;
    }

    const outputDirMatch = line.match(/^输出目录:\s*`([^`]+)`/);
    if (outputDirMatch) {
      currentOutputDir = outputDirMatch[1];
      return;
    }

    if (/^\|\s*镜头方向\s*\|\s*输出\s*\|\s*task_id\s*\|\s*备注\s*\|/.test(line)) {
      inOutputTable = true;
      return;
    }

    if (inOutputTable && /^\|\s*-+/.test(line)) return;
    if (inOutputTable && !line.trim().startsWith("|")) {
      inOutputTable = false;
      return;
    }

    if (!inOutputTable) return;

    const cells = splitMarkdownRow(line);
    if (cells.length < 4) return;

    const title = cleanMarkdownCell(cells[0]);
    const outputName = cleanMarkdownCell(cells[1]);
    const taskId = cleanMarkdownCell(cells[2]);
    const note = cleanMarkdownCell(cells[3]);
    if (!outputName || outputName === "输出" || !taskId || taskId === "task_id") return;

    const declaredPath = currentOutputDir ? join(currentOutputDir, outputName) : outputName;
    const resolvedPath = resolveDeclaredOutput(declaredPath, outputName, outputIndex);
    const projectOutputPath = resolvedPath ? toProjectRel(resolvedPath) : normalizeSlashes(declaredPath);
    const inferred = inferAsset(projectOutputPath, title);
    const selected = selectedOutputs.has(outputName);

    entries.push({
      schema_version: DEFAULT_SCHEMA_VERSION,
      entry_id: buildEntryId(taskId, outputName),
      scene_slug: sceneSlug,
      shot_id: inferShotId(projectOutputPath),
      legacy_id: inferred.legacy_id,
      title,
      lifecycle_status: "generated",
      asset: {
        kind: inferred.kind,
        model: inferred.model,
        output_path: projectOutputPath,
        declared_output_path: normalizeSlashes(toProjectRelOrRaw(declaredPath)),
        exists: Boolean(resolvedPath && existsSync(resolvedPath)),
        spec: {
          resolution: inferred.resolution,
          aspect_ratio: inferred.aspect_ratio,
          duration_seconds: inferDurationSeconds(note),
          audio: inferred.kind === "video" ? "unknown" : null,
          version: inferred.version,
        },
      },
      generation: {
        tool: "imagine-cli",
        mode: inferred.mode,
        task_id: taskId,
        command: null,
        prompt: null,
        prompt_file: null,
        negative_prompt: null,
        prompt_summary: note || null,
        seed: null,
        settings: {},
        references: [],
      },
      review: {
        verdict: selected ? "selected" : "needs_review",
        notes: note ? [note] : [],
        pending_checks: [],
      },
      provenance: {
        source_kind: "markdown_import",
        source_path: toProjectRel(sourcePath),
        source_heading: currentBatchHeading || currentSubheading,
        source_subheading: currentSubheading,
        source_line: index + 1,
        production_date: currentDate,
        ingested_at: new Date().toISOString(),
      },
    });
  });

  return entries;
}

function collectSelectedOutputNames(lines) {
  const selected = new Set();
  let inSelectedSection = false;
  for (const line of lines) {
    if (/^###\s+用户入选/.test(line)) {
      inSelectedSection = true;
      continue;
    }
    if (inSelectedSection && /^#{2,4}\s+/.test(line)) {
      inSelectedSection = false;
    }
    if (!inSelectedSection || !line.trim().startsWith("|")) continue;
    const matches = [...line.matchAll(/`([^`]+\.mp4)`/g)];
    for (const match of matches) selected.add(match[1]);
  }
  return selected;
}

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function cleanMarkdownCell(cell) {
  return cell
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}

function inferAsset(pathText, title) {
  const file = basename(pathText);
  const ext = extname(file).toLowerCase();
  const lower = file.toLowerCase();
  const kind = [".mp4", ".mov", ".avi", ".webm"].includes(ext)
    ? "video"
    : [".png", ".jpg", ".jpeg", ".webp"].includes(ext)
      ? "image"
      : "asset";
  const mode = kind === "video" ? "video" : kind === "image" ? "image" : "asset";
  const model =
    lower.includes("_sd2_") || lower.includes("sd2")
      ? "sd2"
      : lower.includes("kling")
        ? "kling"
        : lower.includes("image2")
          ? "image2"
          : lower.includes("banana")
            ? "banana"
            : "unknown";
  const resolution = lower.match(/(?:^|[^a-z0-9])(480p|720p|1080p|1k|2k|3k)(?:[^a-z0-9]|$)/)?.[1] || null;
  const aspectRatio = lower.includes("16x9") || lower.includes("16-9") ? "16:9" : null;
  const version = lower.match(/(?:^|_)v(\d{1,3})(?:[._-]|$)/)?.[1] || null;
  const legacyId =
    title.match(/\b([A-Z]\d{2}|R\d+[-_]\d+)\b/i)?.[1]?.toUpperCase().replace("_", "-") ||
    file.match(/^(r\d+)_(\d+)/i)?.slice(1, 3).join("-").toUpperCase() ||
    file.match(/^([a-z]\d{2})_/i)?.[1]?.toUpperCase() ||
    null;

  return {
    kind,
    mode,
    model,
    resolution,
    aspect_ratio: aspectRatio,
    version,
    legacy_id: legacyId,
  };
}

function inferShotId(pathText) {
  const normalized = normalizeSlashes(pathText);
  return normalized.match(/\/shots\/(s\d{3})_/i)?.[1]?.toLowerCase() || null;
}

function inferDurationSeconds(text) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*秒/);
  return match ? Number(match[1]) : null;
}

function classifyShotMedia(filePath, shotsRoot) {
  const projectPath = toProjectRel(filePath);
  const normalized = normalizeSlashes(projectPath);
  const lower = normalized.toLowerCase();
  const file = basename(normalized);
  const ext = extname(file).toLowerCase();
  const mediaKind = inferAsset(normalized, file).kind;
  const relFromShots = normalizeSlashes(relative(shotsRoot, filePath));
  const parts = relFromShots.split("/");
  const shotFolder = parts[0] || "";
  const bucket = parts[1] || "";

  if (!["image", "video"].includes(mediaKind)) {
    return { include: false, reason: "unsupported_media", path: normalized };
  }

  if (lower.includes("/_review/") || lower.includes("/review/")) {
    return { include: false, reason: "review_derivative", path: normalized };
  }

  if (
    lower.includes("contact_sheet") ||
    lower.includes("preview_sheet") ||
    lower.includes("video_preview_sheet") ||
    lower.includes("firstframes_contact_sheet") ||
    lower.includes("/thumbs/") ||
    lower.includes("/previews/")
  ) {
    return { include: false, reason: "comparison_or_preview_sheet", path: normalized };
  }

  if (bucket === "videos" && mediaKind === "video") {
    return { include: true, role: "video", bucket, shotFolder };
  }

  if (bucket === "keyframes" && mediaKind === "image") {
    const role = isStoryboardLike(lower) ? "storyboard" : "keyframe";
    return { include: true, role, bucket, shotFolder };
  }

  if (bucket === "refs" && mediaKind === "image" && isStoryboardLike(lower)) {
    return { include: true, role: "storyboard", bucket, shotFolder };
  }

  if (opts.includeWork && bucket === "work" && mediaKind === "video") {
    return { include: true, role: "work_video", bucket, shotFolder };
  }

  if (opts.includeWork && bucket === "work" && mediaKind === "image" && isStoryboardLike(lower)) {
    return { include: true, role: "work_storyboard", bucket, shotFolder };
  }

  return { include: false, reason: "out_of_scope", path: normalized };
}

function isStoryboardLike(lowerPath) {
  const name = basename(lowerPath);
  return (
    lowerPath.includes("storyboard") ||
    name.includes("_sheet") ||
    name.includes("sheet_") ||
    name.includes("_grid") ||
    name.includes("grid_") ||
    name.includes("composition_sheet") ||
    name.includes("shot_variants_sheet")
  );
}

function buildDiscoveredEntry(filePath, candidate) {
  const projectOutputPath = toProjectRel(filePath);
  const inferred = inferAsset(projectOutputPath, basename(projectOutputPath));
  const role = candidate.role || inferred.mode;
  const title = buildDiscoveredTitle(projectOutputPath, role);
  return {
    schema_version: DEFAULT_SCHEMA_VERSION,
    entry_id: `disc_${hashText(projectOutputPath).slice(0, 12)}`,
    scene_slug: sceneSlug,
    shot_id: inferShotId(projectOutputPath),
    legacy_id: inferred.legacy_id,
    title,
    lifecycle_status: "generated",
    asset: {
      kind: inferred.kind,
      model: inferred.model,
      output_path: projectOutputPath,
      declared_output_path: null,
      exists: existsSync(filePath),
      spec: {
        resolution: inferred.resolution,
        aspect_ratio: inferred.aspect_ratio,
        duration_seconds: null,
        audio: inferred.kind === "video" ? "unknown" : null,
        version: inferred.version,
        role,
        source_bucket: candidate.bucket || null,
      },
    },
    generation: {
      tool: "shot-media-discovery",
      mode: role,
      task_id: null,
      command: null,
      prompt: null,
      prompt_file: null,
      negative_prompt: null,
      prompt_summary: buildDiscoveredSummary(role),
      seed: null,
      settings: {},
      references: [],
    },
    review: {
      verdict: "needs_review",
      notes: [buildDiscoveredSummary(role)],
      pending_checks: [],
    },
    provenance: {
      source_kind: "shot_media_discovery",
      source_path: toProjectRel(candidate.shotFolder ? join(shotsRootFromFile(filePath), candidate.shotFolder) : filePath),
      source_heading: role,
      source_line: null,
      ingested_at: new Date().toISOString(),
    },
  };
}

function shotsRootFromFile(filePath) {
  const normalized = normalizeSlashes(filePath);
  const marker = "/shots/";
  const index = normalized.toLowerCase().indexOf(marker);
  if (index < 0) return dirname(filePath);
  return normalized.slice(0, index + marker.length - 1);
}

function buildDiscoveredTitle(pathText, role) {
  const stem = basename(pathText, extname(pathText))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const prefix = {
    video: "镜头视频",
    work_video: "工作视频",
    keyframe: "关键帧",
    storyboard: "分镜/四格图",
    work_storyboard: "工作分镜图",
  }[role] || "镜头资产";
  return `${prefix}: ${stem}`;
}

function buildDiscoveredSummary(role) {
  return {
    video: "从 shots/videos 发现的镜头视频，应进入 Review Board 筛选。",
    work_video: "从 shots/work 发现的工作视频，应进入 Review Board 候选筛选。",
    keyframe: "从 shots/keyframes 发现的镜头单帧，应进入 Review Board 筛选。",
    storyboard: "从 shots 发现的分镜、四格图、sheet 或 grid，应进入 Review Board 筛选。",
    work_storyboard: "从 shots/work 发现的工作分镜、sheet 或 grid，应进入 Review Board 候选筛选。",
  }[role] || "从 shots 发现的镜头级生产资产，应进入 Review Board 筛选。";
}

function filterLedgerEntries(entries) {
  return entries.filter((entry) => {
    if (opts.entryId && entry.entry_id !== opts.entryId) return false;
    if (opts.shotId && entry.shot_id !== opts.shotId) return false;
    if (opts.taskId && entry.generation?.task_id !== opts.taskId) return false;
    if (opts.review && opts.review !== "all" && entry.review?.verdict !== opts.review) return false;
    if (opts.model && entry.asset?.model !== opts.model) return false;
    if (opts.kind && entry.asset?.kind !== opts.kind) return false;
    if (opts.role && (entry.asset?.spec?.role || entry.generation?.mode || entry.asset?.kind || "") !== opts.role) return false;
    if (opts.promptStatus && promptStatus(entry) !== opts.promptStatus) return false;
    if (opts.exists !== null && opts.exists !== undefined) {
      const outputPath = entry.asset?.output_path ? resolveMaybeProjectRelative(entry.asset.output_path) : null;
      const exists = outputPath ? existsSync(outputPath) : false;
      if (exists !== opts.exists) return false;
    }
    if (opts.output) {
      const needle = normalizeSlashes(opts.output).toLowerCase();
      const outputPath = normalizeSlashes(entry.asset?.output_path || "").toLowerCase();
      if (!outputPath.includes(needle)) return false;
    }
    return true;
  });
}

function compactLedgerEntry(entry) {
  return {
    entry_id: entry.entry_id,
    shot_id: entry.shot_id || null,
    title: entry.title || null,
    output_path: normalizeSlashes(entry.asset?.output_path || ""),
    kind: entry.asset?.kind || null,
    role: entry.asset?.spec?.role || entry.generation?.mode || entry.asset?.kind || null,
    model: entry.asset?.model || null,
    review: entry.review?.verdict || null,
    task_id: entry.generation?.task_id || null,
    prompt_status: promptStatus(entry),
    exists: entry.asset?.output_path ? existsSync(resolveMaybeProjectRelative(entry.asset.output_path)) : false,
  };
}

async function buildOutputIndex() {
  const roots = [
    join(projectRoot, "bluespace", "outputs"),
    join(projectRoot, "output"),
  ].filter((root) => existsSync(root));
  const index = new Map();

  for (const root of roots) {
    for (const filePath of await walkFiles(root)) {
      const name = basename(filePath);
      if (!index.has(name)) index.set(name, []);
      index.get(name).push(filePath);
    }
  }

  return index;
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

function resolveDeclaredOutput(declaredPath, outputName, outputIndex) {
  const direct = resolveMaybeProjectRelative(declaredPath);
  if (existsSync(direct)) return direct;

  const matches = outputIndex.get(outputName) || [];
  if (matches.length === 0) return null;

  return matches.sort((a, b) => scoreResolvedOutput(b) - scoreResolvedOutput(a))[0];
}

function scoreResolvedOutput(pathText) {
  const normalized = normalizeSlashes(pathText);
  let score = 0;
  if (normalized.includes("/blue_space_bridge_0421/shots/")) score += 100;
  if (normalized.includes("/blue_space_bridge_0421/_legacy/")) score += 50;
  if (normalized.includes("/storyboard_bridge0421")) score += 20;
  if (normalized.includes("/selects/")) score += 10;
  if (normalized.includes("/videos/")) score += 5;
  return score;
}

async function buildGenerationLogRecipeIndex(shotsRoot) {
  const recipesByTask = new Map();
  const taskByOutput = new Map();
  let scannedLogs = 0;

  for (const filePath of await walkFiles(shotsRoot)) {
    const lower = normalizeSlashes(filePath).toLowerCase();
    if (!lower.includes("/logs/") || !lower.endsWith(".json")) continue;
    let payload;
    try {
      payload = JSON.parse(await readFile(filePath, "utf8"));
    } catch {
      continue;
    }
    scannedLogs += 1;
    const sourcePath = toProjectRel(filePath);
    collectSubmitRecipe(payload, sourcePath, recipesByTask);
    collectResultPath(payload, taskByOutput);
  }

  return { recipesByTask, taskByOutput, scannedLogs };
}

function collectSubmitRecipe(payload, sourcePath, recipesByTask) {
  const taskId = payload?.submitted?.task_id || payload?.task_id || "";
  const prompt = payload?.request?.args?.prompt || "";
  if (!taskId || !prompt) return;
  const args = payload.request?.args || {};
  const recipe = {
    taskId,
    prompt,
    promptSummary: payload.note || payload.intent || summarizeText(prompt),
    sourcePath,
    requestName: payload.request?.name || "",
    settings: {
      request_name: payload.request?.name || null,
      resolution: args.resolution || null,
      duration_seconds: args.duration ?? null,
      aspect_ratio: args.ratio || null,
      generate_audio: args.generate_audio ?? null,
      max_roll: payload.max_roll || null,
      label: payload.label || null,
    },
    references: collectRecipeReferences(payload, args),
  };
  recipesByTask.set(taskId, recipe);
}

function collectResultPath(payload, taskByOutput) {
  const outputs = [];
  if (payload?.path && payload?.task_id) {
    outputs.push(payload);
  }
  for (const item of payload?.outputs || []) {
    if (item?.path && item?.task_id) outputs.push(item);
  }
  for (const output of outputs) {
    taskByOutput.set(normalizePathForMatch(output.path), output.task_id);
  }
}

function collectRecipeReferences(payload, args) {
  const refs = [];
  const firstFrame = payload.first_frame?.path || payload.first_frame_path || args.image_path || "";
  if (firstFrame) refs.push({ role: "first_frame", path: toProjectRelIfLocal(firstFrame) });
  const sourceFirstFrame = payload.first_frame?.source_first_frame || payload.source_first_frame || "";
  if (sourceFirstFrame) refs.push({ role: "source_first_frame", path: toProjectRelIfLocal(sourceFirstFrame) });
  if (args.image && !String(args.image).startsWith("[image/")) {
    refs.push({ role: "generator_image", path: toProjectRelIfLocal(args.image) });
  }
  return refs.filter((ref) => ref.path);
}

function enrichEntryRecipe(entry, recipeIndex) {
  const outputPath = normalizeSlashes(entry.asset?.output_path || "");
  const taskId = entry.generation?.task_id || recipeIndex.taskByOutput.get(normalizePathForMatch(outputPath));
  const recipe = taskId ? recipeIndex.recipesByTask.get(taskId) : null;
  if (!recipe || hasPromptRecipe(entry)) {
    return { entry, changed: false, summary: null };
  }

  const promptFile = defaultPromptFileForOutput(outputPath);
  const next = JSON.parse(JSON.stringify(entry));
  next.generation = {
    ...(next.generation || {}),
    tool: next.generation?.tool === "shot-media-discovery" ? "imagine-cli" : next.generation?.tool || "imagine-cli",
    mode: next.generation?.mode || inferAsset(outputPath, next.title || outputPath).mode,
    task_id: taskId,
    command: next.generation?.command || null,
    prompt: next.generation?.prompt || null,
    prompt_file: promptFile,
    negative_prompt: next.generation?.negative_prompt || null,
    prompt_summary: next.generation?.prompt_summary && next.generation.prompt_summary !== buildDiscoveredSummary(next.asset?.spec?.role)
      ? next.generation.prompt_summary
      : recipe.promptSummary,
    seed: next.generation?.seed || null,
    settings: {
      ...(next.generation?.settings || {}),
      ...Object.fromEntries(Object.entries(recipe.settings).filter(([, value]) => value !== null && value !== undefined && value !== "")),
    },
    references: mergeReferences(next.generation?.references || [], recipe.references),
  };
  next.provenance = {
    ...(next.provenance || {}),
    recipe_source_path: recipe.sourcePath,
    recipe_enriched_at: new Date().toISOString(),
  };

  return {
    entry: next,
    changed: true,
    summary: {
      entry_id: next.entry_id,
      output_path: outputPath,
      task_id: taskId,
      prompt_file: promptFile,
      recipe_source_path: recipe.sourcePath,
    },
    promptWrite: {
      title: next.title || outputPath,
      tool: next.generation.tool,
      model: next.asset?.model || "unknown",
      mode: next.generation.mode,
      task_id: taskId,
      output_path: outputPath,
      prompt_file: promptFile,
      prompt: recipe.prompt,
      prompt_summary: recipe.promptSummary,
      settings: next.generation.settings,
      references: next.generation.references,
      source_path: recipe.sourcePath,
    },
  };
}

function buildEnrichedPromptFile(item) {
  const lines = [
    "---",
    `title: ${JSON.stringify(String(item.title))}`,
    `tool: ${JSON.stringify(String(item.tool))}`,
    `model: ${JSON.stringify(String(item.model))}`,
    `mode: ${JSON.stringify(String(item.mode))}`,
    `task_id: ${JSON.stringify(String(item.task_id))}`,
    `output_path: ${JSON.stringify(String(item.output_path))}`,
    `source_path: ${JSON.stringify(String(item.source_path))}`,
    `created_at: ${new Date().toISOString()}`,
    "---",
    "",
    "# Prompt",
    "",
    item.prompt || "",
    "",
  ];
  if (item.prompt_summary) {
    lines.push("# Summary", "", item.prompt_summary, "");
  }
  if (item.settings && Object.keys(item.settings).length > 0) {
    lines.push("# Settings", "");
    for (const [key, value] of Object.entries(item.settings)) {
      lines.push(`- ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
    }
    lines.push("");
  }
  if (item.references?.length) {
    lines.push("# References", "");
    for (const ref of item.references) lines.push(`- ${ref.role}: ${ref.path}`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function defaultPromptFileForOutput(outputPath) {
  const outputAbs = resolveMaybeProjectRelative(outputPath);
  const stem = basename(outputAbs, extname(outputAbs))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "generation";
  return toProjectRel(join(dirname(outputAbs), "_prompts", `${stem}.md`));
}

function mergeReferences(existing, additions) {
  const result = [];
  const seen = new Set();
  for (const ref of [...existing, ...additions]) {
    const normalized = {
      role: ref.role || "unspecified",
      path: normalizeSlashes(ref.path || ""),
    };
    if (!normalized.path) continue;
    const key = `${normalized.role}:${normalized.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function normalizePathForMatch(pathText) {
  const normalized = normalizeSlashes(pathText || "");
  const rel = toProjectRelIfLocal(normalized);
  return normalizeSlashes(rel).toLowerCase();
}

function toProjectRelIfLocal(pathText) {
  if (!pathText) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pathText)) return normalizeSlashes(pathText);
  const resolved = resolveMaybeProjectRelative(pathText);
  const rel = normalizeSlashes(relative(projectRoot, resolved));
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel;
  return normalizeSlashes(pathText);
}

function summarizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 180) || null;
}

async function readLedgerIfExists() {
  if (!existsSync(ledgerPath)) return { entries: [], lineErrors: [] };
  const text = await readFile(ledgerPath, "utf8");
  const entries = [];
  const lineErrors = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const entry = JSON.parse(line);
      Object.defineProperty(entry, "__line", {
        value: index + 1,
        enumerable: false,
      });
      entries.push(entry);
    } catch (error) {
      lineErrors.push({ line: index + 1, message: `Invalid JSON: ${error.message}` });
    }
  });
  return { entries, lineErrors };
}

function validateEntryShape(entry) {
  const messages = [];
  const required = [
    ["schema_version", entry.schema_version],
    ["entry_id", entry.entry_id],
    ["scene_slug", entry.scene_slug],
    ["title", entry.title],
    ["lifecycle_status", entry.lifecycle_status],
    ["asset.kind", entry.asset?.kind],
    ["asset.model", entry.asset?.model],
    ["asset.output_path", entry.asset?.output_path],
    ["generation.tool", entry.generation?.tool],
    ["review.verdict", entry.review?.verdict],
    ["provenance.source_kind", entry.provenance?.source_kind],
  ];
  for (const [name, value] of required) {
    if (value === null || value === undefined || value === "") {
      messages.push(`Missing required field: ${name}`);
    }
  }
  if (entry.schema_version !== DEFAULT_SCHEMA_VERSION) {
    messages.push(`Unsupported schema_version: ${entry.schema_version}`);
  }
  return messages;
}

function checkDuplicate(label, value, seen, line, warnings) {
  if (!value) return;
  if (seen.has(value)) {
    warnings.push({
      line,
      message: `Duplicate ${label}: ${value} (first seen on line ${seen.get(value)})`,
    });
  } else {
    seen.set(value, line);
  }
}

function validateGenerationRecipe(entry) {
  if (!shouldRequireReusableRecipe(entry)) return null;
  if (hasPromptRecipe(entry)) return null;
  const sourceKind = entry.provenance?.source_kind || "unknown";
  const outputPath = entry.asset?.output_path || entry.entry_id || "(missing output)";
  return [
    `New generated asset is missing a tracked prompt: ${outputPath}.`,
    "Add generation.prompt or generation.prompt_file. Prompt tracking is required even when references/settings are present.",
    `source_kind=${sourceKind}`,
  ].join(" ");
}

function shouldRequireReusableRecipe(entry) {
  const sourceKind = entry.provenance?.source_kind || "";
  if (["markdown_import", "shot_media_discovery"].includes(sourceKind)) return false;
  const kind = entry.asset?.kind || inferAsset(entry.asset?.output_path || "", entry.title || "").kind;
  if (!["image", "video"].includes(kind)) return false;
  return true;
}

function hasPromptRecipe(entry) {
  const generation = entry.generation || {};
  return Boolean(generation.prompt || generation.prompt_file);
}

function hasReusableRecipe(entry) {
  const generation = entry.generation || {};
  return Boolean(
    generation.prompt ||
      generation.prompt_file ||
      generation.command ||
      (Array.isArray(generation.references) && generation.references.length > 0) ||
      (generation.settings && Object.keys(generation.settings).length > 0),
  );
}

function promptCoverageLabel(entry) {
  if (entry.generation?.prompt || entry.generation?.prompt_file) return "full";
  if (entry.generation?.prompt_summary) return "summary_only";
  return "missing";
}

function promptStatus(entry) {
  if (entry.generation?.prompt_file) return "prompt_file";
  if (entry.generation?.prompt) return "inline_prompt";
  if (hasReusableRecipe(entry)) return "recipe_without_prompt";
  if (entry.generation?.prompt_summary) return "summary_only";
  return "missing";
}

function parseReferenceArg(value) {
  const [maybeRole, rest] = value.split(/:(.*)/s, 2);
  if (rest && /^[a-z][a-z0-9_-]*$/i.test(maybeRole)) {
    return {
      role: maybeRole,
      path: normalizeSlashes(rest),
    };
  }
  return {
    role: "unspecified",
    path: normalizeSlashes(value),
  };
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

function countBy(entries, getter) {
  const counts = {};
  for (const entry of entries) {
    const key = getter(entry);
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function printCounts(title, counts) {
  console.log(`${title}:`);
  for (const [key, count] of Object.entries(counts)) {
    console.log(`  ${key}: ${count}`);
  }
}

function printIssues(title, issues) {
  if (issues.length === 0) return;
  console.log(`${title}:`);
  for (const issue of issues.slice(0, 40)) {
    console.log(`  line ${issue.line}: ${issue.message}`);
  }
  if (issues.length > 40) console.log(`  ... ${issues.length - 40} more`);
}

function entriesToJsonl(entries) {
  return entries.map((entry) => JSON.stringify(entry)).join("\n") + (entries.length ? "\n" : "");
}

function buildEntryId(taskId, fallback) {
  if (taskId) return `gen_${taskId.slice(0, 12)}`;
  return `gen_${hashText(fallback).slice(0, 12)}`;
}

function hashText(text) {
  return createHash("sha1").update(text).digest("hex");
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
  return resolve(SCRIPT_DIR, "..", "..", "..");
}

function resolvePath(pathText) {
  return isAbsolute(pathText) ? pathText : resolve(process.cwd(), pathText);
}

function resolveMaybeProjectRelative(pathText) {
  if (!pathText) return null;
  if (isAbsolute(pathText)) return pathText;
  const normalized = pathText.replace(/^\.?[\\/]/, "");
  const underProject = resolve(projectRoot, normalized);
  if (existsSync(underProject) || normalized.startsWith("bluespace/") || normalized.startsWith("output/")) {
    return underProject;
  }
  return resolve(process.cwd(), pathText);
}

function toProjectRel(pathText) {
  const abs = resolvePath(pathText);
  const rel = relative(projectRoot, abs);
  return normalizeSlashes(rel && !rel.startsWith("..") ? rel : abs);
}

function toProjectRelOrRaw(pathText) {
  if (!pathText) return null;
  const abs = resolveMaybeProjectRelative(pathText);
  if (abs && existsSync(abs)) return toProjectRel(abs);
  if (isAbsolute(pathText)) {
    const rel = relative(projectRoot, pathText);
    if (rel && !rel.startsWith("..")) return normalizeSlashes(rel);
  }
  return normalizeSlashes(pathText);
}

function normalizeSlashes(pathText) {
  return pathText ? pathText.replace(/\\/g, "/") : pathText;
}

function parseArgs(args) {
  const parsed = {
    command: null,
    help: false,
    projectRoot: null,
    sceneSlug: null,
    sceneRoot: null,
    ledger: null,
    source: null,
    shotsRoot: null,
    includeWork: false,
    dryRun: false,
    overwrite: false,
    strict: false,
    json: false,
    refs: [],
    notes: [],
    settings: {},
    limit: 20,
    exists: null,
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
    else if (key === "--scene-root") parsed.sceneRoot = readValue();
    else if (key === "--ledger") parsed.ledger = readValue();
    else if (key === "--source") parsed.source = readValue();
    else if (key === "--shots-root") parsed.shotsRoot = readValue();
    else if (arg === "--include-work") parsed.includeWork = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--overwrite") parsed.overwrite = true;
    else if (arg === "--strict") parsed.strict = true;
    else if (arg === "--json") parsed.json = true;
    else if (key === "--limit") parsed.limit = Number.parseInt(readValue(), 10);
    else if (key === "--entry-id") parsed.entryId = readValue();
    else if (key === "--title") parsed.title = readValue();
    else if (key === "--output") parsed.output = readValue();
    else if (key === "--declared-output") parsed.declaredOutput = readValue();
    else if (key === "--shot-id") parsed.shotId = readValue();
    else if (key === "--legacy-id") parsed.legacyId = readValue();
    else if (key === "--asset-kind") parsed.assetKind = readValue();
    else if (key === "--model") parsed.model = readValue();
    else if (key === "--resolution") parsed.resolution = readValue();
    else if (key === "--aspect-ratio") parsed.aspectRatio = readValue();
    else if (key === "--duration-seconds") parsed.durationSeconds = readValue();
    else if (key === "--audio") parsed.audio = readValue();
    else if (key === "--version") parsed.version = readValue();
    else if (key === "--status") parsed.status = readValue();
    else if (key === "--review") parsed.review = readValue();
    else if (key === "--tool") parsed.tool = readValue();
    else if (key === "--mode") parsed.mode = readValue();
    else if (key === "--kind") parsed.kind = readValue();
    else if (key === "--role") parsed.role = readValue();
    else if (key === "--prompt-status") parsed.promptStatus = readValue();
    else if (key === "--exists") parsed.exists = parseBooleanArg(readValue(), "--exists");
    else if (key === "--task-id") parsed.taskId = readValue();
    else if (key === "--command-text") parsed.commandText = readValue();
    else if (key === "--prompt") parsed.prompt = readValue();
    else if (key === "--prompt-file") parsed.promptFile = readValue();
    else if (key === "--negative-prompt") parsed.negativePrompt = readValue();
    else if (key === "--prompt-summary") parsed.promptSummary = readValue();
    else if (key === "--seed") parsed.seed = readValue();
    else if (key === "--setting") {
      const [settingKey, settingValue] = parseSettingArg(readValue());
      parsed.settings[settingKey] = settingValue;
    }
    else if (key === "--ref") parsed.refs.push(readValue());
    else if (key === "--note") parsed.notes.push(readValue());
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(parsed.limit) || parsed.limit < 1) {
    throw new Error("--limit must be a positive integer");
  }

  return parsed;
}

function parseBooleanArg(value, label) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["true", "yes", "1", "exists"].includes(normalized)) return true;
  if (["false", "no", "0", "missing"].includes(normalized)) return false;
  throw new Error(`${label} must be true/false, yes/no, 1/0, exists/missing`);
}

function printHelp() {
  process.stdout.write(`Bluespace production ledger

Usage:
  node bluespace/tools/production-ledger/ledger.mjs <command> [options]

Commands:
  init                    Create the ledger folder, JSONL file, schema, and README.
  import-video-batches    Import video rows from storyboard/VIDEO_BATCHES.md.
  ingest                  Add ledger entries for shot-level videos, keyframes, and storyboard sheets.
  ingest-shot-media       Alias for ingest.
  discover-shot-media     Legacy alias for ingest.
  enrich-recipes          Add prompt/task_id/settings from shot work logs when available.
  add                     Append one manual ledger entry.
  validate                Validate JSONL shape, duplicate ids, and output paths.
  summary                 Print counts by model, status, review, and shot.
  prompt-index            Write _ledger/prompt-index.json for quick prompt lookup.
  find                    Query ledger entries without reading the full JSONL into chat.
  recipe                  Print the generation recipe for one exact ledger entry.

Global options:
  --project-root <path>    Defaults to the nearest trae_projects root.
  --scene <slug>           Defaults to blue_space_bridge_0421.
  --scene-root <path>      Defaults to bluespace/outputs/<scene>.
  --ledger <path>          Defaults to <scene-root>/_ledger/production-ledger.jsonl.
  --json                   Print machine-readable output where supported.
  --limit <n>              Max results for find. Default 20.
  -h, --help               Show this help.

Import options:
  --source <path>          Markdown source. Defaults to current bridge VIDEO_BATCHES.md.
  --dry-run                Print entries without writing.
  --overwrite              Replace the ledger with imported entries.

Ingest options:
  --shots-root <path>      Defaults to <scene-root>/shots.
  --include-work           Also include videos/storyboard sheets under shot work folders.
  --dry-run                Print discovery summary and candidate entries without writing.

Enrich options:
  --shots-root <path>      Defaults to <scene-root>/shots.
  --dry-run                Print enrichment summary without writing.
  --overwrite              Overwrite generated prompt files when they already exist.

Add options:
  --title <text>           Required. Human-readable direction or shot note.
  --output <path>          Required. Output asset path.
  --task-id <id>           Imagine task id.
  --shot-id <id>           Formal shot id, for example s030.
  --legacy-id <id>         Old storyboard id, for example R4-11.
  --model <name>           sd2, image2, kling, manual, etc.
  --asset-kind <kind>      video, image, sheet, reference, etc.
  --resolution <value>     1080p, 720p, 2k, etc.
  --aspect-ratio <value>   16:9, 1:1, etc.
  --status <value>         generated, selected, locked, archived, etc.
  --review <value>         needs_review, selected, rejected, reference_only.
  --prompt <text>          Exact prompt when safe to store.
  --prompt-file <path>     Prompt file path.
  --negative-prompt <text> Exact negative prompt when the generator supports it.
  --prompt-summary <text>  Short prompt summary.
  --seed <value>           Seed or generator seed id, when available.
  --setting <key=value>    Generator setting. Can be repeated.
  --ref <path>             Reference path. Can be repeated. Use role:path to label roles.
  --note <text>            Review note. Can be repeated.

Validate options:
  --strict                 Treat warnings as failures.
                           New generated image/video entries warn when missing prompt or prompt_file.

Query options:
  --entry-id <id>          Match one entry id.
  --shot-id <id>           Filter by shot id, for example s071.
  --output <path-fragment> Filter by output path fragment.
  --task-id <id>           Filter by generation task id.
  --review <verdict|all>   Filter by review verdict.
  --model <name>           Filter by asset model.
  --kind <kind>             Filter by asset kind, for example video or image.
  --role <role>             Filter by Review Board role, for example video, keyframe, storyboard, i2v.
  --prompt-status <status>  Filter by prompt_file, inline_prompt, recipe_without_prompt, summary_only, or missing.
  --exists <value>          true/false, exists/missing. Filter by whether output exists on disk.
`);
}

function buildSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Bluespace production ledger entry",
    type: "object",
    required: [
      "schema_version",
      "entry_id",
      "scene_slug",
      "title",
      "lifecycle_status",
      "asset",
      "generation",
      "review",
      "provenance",
    ],
    properties: {
      schema_version: { const: 1 },
      entry_id: { type: "string" },
      scene_slug: { type: "string" },
      shot_id: { type: ["string", "null"] },
      legacy_id: { type: ["string", "null"] },
      title: { type: "string" },
      lifecycle_status: { type: "string" },
      asset: {
        type: "object",
        required: ["kind", "model", "output_path"],
        properties: {
          kind: { type: "string" },
          model: { type: "string" },
          output_path: { type: "string" },
          declared_output_path: { type: ["string", "null"] },
          exists: { type: "boolean" },
          spec: { type: "object" },
        },
      },
      generation: {
        type: "object",
        required: ["tool"],
        properties: {
          tool: { type: "string" },
          mode: { type: ["string", "null"] },
          task_id: { type: ["string", "null"] },
          command: { type: ["string", "null"] },
          prompt: { type: ["string", "null"] },
          prompt_file: { type: ["string", "null"] },
          negative_prompt: { type: ["string", "null"] },
          prompt_summary: { type: ["string", "null"] },
          seed: { type: ["string", "number", "null"] },
          settings: { type: "object" },
          references: { type: "array" },
        },
      },
      review: {
        type: "object",
        required: ["verdict"],
        properties: {
          verdict: { type: "string" },
          notes: { type: "array" },
          pending_checks: { type: "array" },
        },
      },
      provenance: {
        type: "object",
        required: ["source_kind", "ingested_at"],
        properties: {
          source_kind: { type: "string" },
          source_path: { type: ["string", "null"] },
          source_heading: { type: ["string", "null"] },
          source_subheading: { type: ["string", "null"] },
          source_line: { type: ["integer", "null"] },
          production_date: { type: ["string", "null"] },
          ingested_at: { type: "string" },
        },
      },
    },
  };
}

function buildLedgerReadme() {
  return `# Production Ledger

这个文件夹保存当前场次的结构化生产记录。

- \`production-ledger.jsonl\`: 追加式 JSONL 账本，每行对应一个生成资产。
- \`production-ledger.schema.json\`: 当前账本条目的轻量 schema。

在项目根目录运行：

Windows:

\`\`\`powershell
.\\tools\\project-harness\\doctor.ps1
.\\bluespace\\tools\\production-ledger\\ledger.ps1 summary
.\\bluespace\\tools\\production-ledger\\ledger.ps1 validate
.\\bluespace\\tools\\production-ledger\\ledger.ps1 ingest --dry-run
\`\`\`

macOS:

\`\`\`bash
./tools/project-harness/doctor.sh
./bluespace/tools/production-ledger/ledger.sh summary
./bluespace/tools/production-ledger/ledger.sh validate
./bluespace/tools/production-ledger/ledger.sh ingest --dry-run
\`\`\`

Git 是 harness 部署的硬性前置条件；账本交付前应先让 project doctor 通过。

## Ingest

\`ingest\` 用于把 \`shots/\` 下服务于镜头生产的旧素材补进账本。默认纳入 \`videos/\` 视频、\`keyframes/\` 单帧、以及 \`refs/\` 中明显的分镜/四格/sheet/grid；默认排除 \`review/\` 抽帧、contact sheet、preview sheet、临时对比图和纯确认拼接图。旧命令 \`discover-shot-media\` 保留为兼容别名。

写入前可先预览：

\`\`\`powershell
.\\bluespace\\tools\\production-ledger\\ledger.ps1 ingest --dry-run
\`\`\`

推荐写法：

\`\`\`powershell
.\\bluespace\\tools\\production-ledger\\ledger.ps1 ingest
\`\`\`

## Prompt / 生成配方

新生成的图片或视频要记录可追踪 Prompt：\`generation.prompt\` 或 \`generation.prompt_file\` 是硬要求；\`prompt_summary\`、\`negative_prompt\`、\`seed\`、\`settings\`、\`references\` 和 \`command\` 是配方补充。历史导入条目如果只有摘要，不要倒推或编造完整 prompt。

\`ledger validate\` 会对新生成但缺少 \`prompt\` 或 \`prompt_file\` 的图片/视频给出 warning。\`markdown_import\` 和 \`shot_media_discovery\` 属于历史导入/补账来源，可以只有摘要。

\`ledger prompt-index\` 会写入 \`_ledger/prompt-index.json\`，作为后续对话快速定位 Prompt 的入口。
`;
}
