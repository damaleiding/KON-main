#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = "tmp/project-harness-self-test";
const PHASES = [
  {
    id: "phase_1",
    title: "Preflight and cross-host entrypoints",
    verifies: ["entrypoints"],
  },
  {
    id: "phase_2",
    title: "Media Review card output",
    verifies: ["media_card"],
  },
  {
    id: "phase_3",
    title: "Production ledger ingest and validation",
    verifies: ["ingest", "validate"],
  },
  {
    id: "phase_4",
    title: "Review Board page and data bundle",
    verifies: ["review_board", "review_board_data"],
  },
  {
    id: "phase_5",
    title: "Review decision persistence and ledger apply",
    verifies: ["review_decision", "review_board_data"],
  },
  {
    id: "phase_6",
    title: "Generation capture and prompt tracking",
    verifies: ["generation_capture", "enrich_recipes", "prompt_index"],
  },
  {
    id: "phase_7",
    title: "Automated harness regression self-test",
    verifies: ["entrypoints", "fixture"],
  },
  {
    id: "phase_8",
    title: "Context efficiency indexes and ledger queries",
    verifies: ["reference_index_generator", "context_index_generator", "ledger_query", "media_manifest"],
  },
  {
    id: "phase_9",
    title: "Reference governance rules",
    verifies: ["reference_governance"],
  },
  {
    id: "phase_11",
    title: "Reference Review Board",
    verifies: ["reference_board"],
  },
  {
    id: "phase_12",
    title: "Prompt Reference Picker",
    verifies: ["reference_picker"],
  },
];
const MANUAL_CHECKLIST = [
  "Run tools/project-harness/doctor.ps1 or doctor.sh and confirm required checks pass.",
  "Run tools/project-harness/self-test.ps1 or self-test.sh and confirm the automated fixture passes.",
  "Open bluespace/refs/_index/reference-governance.md and confirm selected/deprecated reference boundaries match the current production judgment.",
  "Open bluespace/refs/_review/index.html and confirm reference filters, status badges, cautions, and file links work.",
  "Run reference-picker for a target entity and confirm prompt refs exclude deprecated assets by default.",
  "Open the real Review Board and confirm search, filters, Recipe, Role, and Sort controls behave as expected.",
  "In system Chrome, mark one item liked, use Update, refresh the page, and confirm the saved mark is read back.",
  "For a liked generated asset, confirm its prompt or prompt_file can be found from the Review Board or prompt-index.json.",
];

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
const results = [];
let fixture = null;
let failed = false;

try {
  fixture = await createFixture();

  await step("entrypoints", "Self-test entrypoints exist", async () => {
    const missing = [
      "tools/project-harness/self-test.ps1",
      "tools/project-harness/self-test.sh",
      "tools/project-harness/self-test.mjs",
      "tools/project-harness/token-meter.ps1",
      "tools/project-harness/token-meter.sh",
      "tools/project-harness/token-meter.mjs",
      "tools/project-harness/media-manifest.ps1",
      "tools/project-harness/media-manifest.sh",
      "tools/project-harness/media-manifest.mjs",
    ].filter((item) => !existsSync(join(projectRoot, ...item.split("/"))));
    assert(missing.length === 0, `Missing entrypoint(s): ${missing.join(", ")}`);
    return "Windows, macOS, and Node entrypoints are present.";
  });

  await step("fixture", "Fixture scaffold is isolated", async () => {
    assertInside(fixture.runRoot, join(projectRoot, DATA_ROOT));
    assert(existsSync(fixture.videoPath), "Fixture video was not created.");
    assert(existsSync(fixture.keyframePath), "Fixture keyframe was not created.");
    assert(existsSync(fixture.storyboardPath), "Fixture storyboard was not created.");
    return toProjectRel(fixture.runRoot);
  });

  await step("reference_index_generator", "Reference Index generator can classify project refs", async () => {
    const index = await runJsonScript(fixture.referenceIndexScript, [
      "--project-root",
      projectRoot,
      "--dry-run",
      "--json",
    ]);
    assert(index.assets?.length > 0, "reference-index did not find any assets.");
    assert(index.assets.some((asset) => asset.entity === "oldA" && asset.status === "selected"), "reference-index is missing selected oldA assets.");
    assert(index.counts?.by_status?.deprecated >= 1, "reference-index should preserve deprecated trace-only assets.");
    return `${index.assets.length} reference assets classified.`;
  });

  await step("reference_governance", "Reference governance drives selected and deprecated boundaries", async () => {
    const index = await runJsonScript(fixture.referenceIndexScript, [
      "--project-root",
      projectRoot,
      "--dry-run",
      "--json",
    ]);
    assert(index.governance?.exists, "reference-governance.json was not loaded.");
    assertEqual(index.governance.warnings?.length || 0, 0, "reference governance warning count");
    assert(index.governance.matched_assets >= 7, "reference governance should match locked assets.");

    const identity = index.assets.find((asset) => asset.path === "bluespace/refs/Image 266.png");
    assert(identity, "Governed oldA identity reference is missing.");
    assertEqual(identity.status, "selected", "oldA identity status");
    assertEqual(identity.governance?.id, "oldA_identity_face_anchor", "oldA identity governance id");
    assert(identity.usage.includes("identity_reference"), "oldA identity usage is missing.");

    const legacySelectedName = index.assets.find((asset) =>
      asset.path.endsWith("oldA_unified_armor_damage_helmet_locked_re_detail_image2_selected_v1.png"),
    );
    assert(legacySelectedName, "Legacy re-detail asset with selected filename is missing.");
    assertEqual(legacySelectedName.status, "deprecated", "legacy re-detail selected-name status");
    assertEqual(legacySelectedName.governance?.id, "oldA_re_detail_legacy_selected_filename", "legacy re-detail governance id");

    const reDetailRule = index.assets.find((asset) => asset.path.endsWith("oldA_clean_damage_re_detail_image2_v001a.png"));
    assert(reDetailRule, "Rule-governed re-detail asset is missing.");
    assertEqual(reDetailRule.status, "deprecated", "rule-governed re-detail status");
    assertEqual(reDetailRule.governance?.id, "oldA_re_detail_outputs_trace_only", "rule-governed re-detail governance id");

    const shuttle = index.assets.find((asset) => asset.path === "bluespace/refs/shuttle/standard_shuttle_reference_20260525.png");
    assert(shuttle, "Governed shuttle standard reference is missing.");
    assertEqual(shuttle.governance?.id, "shuttle_standard_reference_20260525", "shuttle governance id");

    return `${index.governance.matched_assets} governed reference assets; ${index.governance.warnings.length} warnings.`;
  });

  await step("reference_board", "Reference Board renders governed reference assets", async () => {
    await runNodeScript(fixture.referenceBoardScript, [
      "--project-root",
      projectRoot,
      "--output",
      fixture.referenceBoardOutputPath,
      "--force",
    ]);
    assert(existsSync(fixture.referenceBoardOutputPath), "Reference Board index.html was not written.");
    assert(existsSync(join(fixture.referenceBoardOutputDir, "reference-data.js")), "reference-data.js was not written.");
    assert(existsSync(join(fixture.referenceBoardOutputDir, "manifest.json")), "Reference Board manifest.json was not written.");

    await runHarnessEntrypoint("reference-board-data", [
      "--project-root",
      projectRoot,
      "--output",
      fixture.referenceBoardOutputPath,
    ]);

    const data = await readWindowDataJs(
      join(fixture.referenceBoardOutputDir, "reference-data.js"),
      "window.BLUESPACE_REFERENCE_BOARD_DATA = ",
    );
    assert(data.assets?.length > 0, "Reference Board did not load reference assets.");
    assertEqual(data.governance?.warnings?.length || 0, 0, "Reference Board governance warning count");
    assert(data.assets.some((asset) => asset.status === "selected" && asset.governanceId === "oldA_identity_face_anchor"), "Reference Board is missing governed selected oldA identity.");
    assert(data.assets.some((asset) => asset.status === "deprecated" && asset.governanceId === "oldA_re_detail_legacy_selected_filename"), "Reference Board is missing governed deprecated re-detail asset.");

    const html = await readFile(fixture.referenceBoardOutputPath, "utf8");
    assert(html.includes("Bluespace Reference Board"), "Reference Board shell is missing title.");
    assert(html.includes("data-status"), "Reference Board shell is missing filterable card dataset.");
    return toProjectRel(fixture.referenceBoardOutputPath);
  });

  await step("reference_picker", "Prompt Reference Picker returns safe prompt refs", async () => {
    const allSelected = await runJsonScript(fixture.referencePickerScript, [
      "--project-root",
      projectRoot,
      "--json",
    ]);
    assert(allSelected.assets?.length > 0, "reference-picker did not return selected references by default.");
    assert(!allSelected.assets.some((asset) => asset.status === "deprecated"), "reference-picker default output should exclude deprecated refs.");

    const oldAPromptRefs = await runJsonScript(fixture.referencePickerScript, [
      "--project-root",
      projectRoot,
      "--entity",
      "oldA",
      "--usage",
      "prompt_reference",
      "--json",
    ]);
    assertEqual(oldAPromptRefs.counts?.matched, 2, "oldA prompt_reference count");
    assert(oldAPromptRefs.assets.some((asset) => asset.governance?.id === "oldA_identity_face_anchor"), "oldA identity prompt ref is missing.");
    assert(oldAPromptRefs.assets.some((asset) => asset.governance?.id === "oldA_broken_helmet_continuity"), "oldA helmet prompt ref is missing.");

    const blockedDeprecated = await runJsonScript(fixture.referencePickerScript, [
      "--project-root",
      projectRoot,
      "--entity",
      "oldA",
      "--status",
      "deprecated",
      "--json",
    ]);
    assertEqual(blockedDeprecated.counts?.matched, 0, "deprecated refs are excluded without explicit opt-in");

    const traceOnly = await runJsonScript(fixture.referencePickerScript, [
      "--project-root",
      projectRoot,
      "--entity",
      "oldA",
      "--status",
      "deprecated",
      "--include-deprecated",
      "--json",
    ]);
    assert(traceOnly.assets.some((asset) => asset.governance?.id === "oldA_re_detail_legacy_selected_filename"), "explicit trace-only deprecated ref is missing.");
    assert(traceOnly.cautions?.some((item) => item.includes("deprecated")), "deprecated picker output should include a caution.");
    return `${oldAPromptRefs.counts.matched} oldA prompt refs; deprecated opt-in count ${traceOnly.counts.matched}.`;
  });

  await step("context_index_generator", "Context Index generator can summarize project state", async () => {
    const index = await runJsonScript(fixture.contextIndexScript, [
      "--project-root",
      projectRoot,
      "--dry-run",
      "--json",
    ]);
    assert(index.startup_sequence?.includes("bluespace/_harness/context-index.json"), "context-index startup sequence is missing itself.");
    assert(index.source_of_truth?.reference_index, "context-index is missing reference index source.");
    assert(index.current_state?.ledger?.entries >= 0, "context-index ledger summary is missing.");
    return `Startup files: ${index.startup_sequence.length}; ledger entries: ${index.current_state.ledger.entries}.`;
  });

  await step("media_manifest", "Media manifest can scan and check fixture media", async () => {
    const manifestPath = join(fixture.runRoot, "media-manifest.json");
    const manifest = await runJsonScript(fixture.mediaManifestScript, [
      "scan",
      "--project-root",
      projectRoot,
      "--root",
      toProjectRel(fixture.runRoot),
      "--output",
      toProjectRel(manifestPath),
      "--json",
    ]);
    assert(manifest.entries?.length >= 3, "media manifest did not find fixture media.");
    const report = await runJsonScript(fixture.mediaManifestScript, [
      "check",
      "--project-root",
      projectRoot,
      "--manifest",
      toProjectRel(manifestPath),
      "--json",
      "--warn-only",
    ]);
    assert(report.summary?.not_ok === 0, "media manifest fixture check reported missing media.");
    return `${manifest.entries.length} fixture media entries checked.`;
  });

  await step("ingest", "Ledger ingest discovers shot media", async () => {
    const summary = await runJsonScript(fixture.ledgerScript, [
      "ingest",
      "--project-root",
      projectRoot,
      "--scene-root",
      fixture.sceneRoot,
      "--ledger",
      fixture.ledgerPath,
      "--shots-root",
      fixture.shotsRoot,
      "--json",
    ]);
    assertEqual(summary.discovered, 3, "ingest discovered count");
    assertEqual(summary.by_role?.video, 1, "video role count");
    assertEqual(summary.by_role?.keyframe, 1, "keyframe role count");
    assertEqual(summary.by_role?.storyboard, 1, "storyboard role count");

    const entries = await readJsonl(fixture.ledgerPath);
    const paths = entries.map((entry) => entry.asset?.output_path || "");
    assert(!paths.some((item) => item.includes("preview_sheet")), "Preview sheet should stay out of ingest.");
    assert(!paths.some((item) => item.includes("contact_sheet")), "Contact sheet should stay out of ingest.");
    return `Discovered ${summary.discovered} entries.`;
  });

  await step("enrich_recipes", "Ledger enrich-recipes adds tracked prompt", async () => {
    const summary = await runJsonScript(fixture.ledgerScript, [
      "enrich-recipes",
      "--project-root",
      projectRoot,
      "--scene-root",
      fixture.sceneRoot,
      "--ledger",
      fixture.ledgerPath,
      "--shots-root",
      fixture.shotsRoot,
      "--overwrite",
      "--json",
    ]);
    assertEqual(summary.changed, 1, "enriched entry count");

    const entries = await readJsonl(fixture.ledgerPath);
    const video = entries.find((entry) => entry.asset?.spec?.role === "video");
    assert(video, "Video entry not found after enrich-recipes.");
    assertEqual(video.generation?.task_id, fixture.taskId, "enriched task_id");
    assert(video.generation?.prompt_file, "Video entry did not receive prompt_file.");
    assert(existsSync(resolveProjectPath(video.generation.prompt_file)), "Generated prompt file does not exist.");
    return video.generation.prompt_file;
  });

  await step("generation_capture", "Generation capture records a generated asset", async () => {
    await writeTinyPng(fixture.capturePath);
    const result = await runJsonScript(fixture.generationCaptureScript, [
      "record",
      "--project-root",
      projectRoot,
      "--ledger",
      fixture.ledgerPath,
      "--title",
      "Self-test captured image",
      "--output",
      toProjectRel(fixture.capturePath),
      "--shot-id",
      "s001",
      "--tool",
      "gpt-image2",
      "--model",
      "image2",
      "--prompt",
      "A compact generated image fixture for Bluespace harness self-test.",
      "--aspect-ratio",
      "16:9",
      "--setting",
      "source=self-test",
      "--no-review-board",
      "--json",
    ]);
    assert(result.prompt_file, "generation-capture did not create or reference a prompt file.");
    assert(existsSync(resolveProjectPath(result.prompt_file)), "generation-capture prompt file does not exist.");

    const entries = await readJsonl(fixture.ledgerPath);
    const captured = entries.find((entry) => entry.asset?.output_path === toProjectRel(fixture.capturePath));
    assert(captured, "generation-capture ledger entry was not written.");
    assert(captured.generation?.prompt_file, "generation-capture entry is missing prompt_file.");
    return result.output;
  });

  await step("validate", "Ledger validate --strict passes", async () => {
    const result = await runJsonScript(fixture.ledgerScript, [
      "validate",
      "--project-root",
      projectRoot,
      "--scene-root",
      fixture.sceneRoot,
      "--ledger",
      fixture.ledgerPath,
      "--strict",
      "--json",
    ]);
    assertEqual(result.errors, 0, "validate error count");
    assertEqual(result.warnings, 0, "validate warning count");
    return `${result.entries} entries, no errors or warnings.`;
  });

  await step("prompt_index", "Prompt index includes captured generation", async () => {
    const index = await runJsonScript(fixture.ledgerScript, [
      "prompt-index",
      "--project-root",
      projectRoot,
      "--scene-root",
      fixture.sceneRoot,
      "--ledger",
      fixture.ledgerPath,
      "--json",
    ]);
    const indexPath = join(dirname(fixture.ledgerPath), "prompt-index.json");
    assert(existsSync(indexPath), "prompt-index.json was not written.");
    assertEqual(index.counts?.prompt_file, 2, "prompt_file count after generation-capture");
    assertEqual(index.counts?.summary_only, 2, "summary_only count after generation-capture");
    return toProjectRel(indexPath);
  });

  await step("ledger_query", "Ledger find and recipe queries work", async () => {
    const findResult = await runJsonScript(fixture.ledgerScript, [
      "find",
      "--project-root",
      projectRoot,
      "--scene-root",
      fixture.sceneRoot,
      "--ledger",
      fixture.ledgerPath,
      "--shot-id",
      "s001",
      "--limit",
      "2",
      "--json",
    ]);
    assertEqual(findResult.total_matches, 4, "ledger find total matches");
    assertEqual(findResult.returned, 2, "ledger find returned count");

    const entries = await readJsonl(fixture.ledgerPath);
    const captured = entries.find((entry) => entry.asset?.output_path === toProjectRel(fixture.capturePath));
    assert(captured, "Captured generation entry not found for recipe query.");
    const recipe = await runJsonScript(fixture.ledgerScript, [
      "recipe",
      "--project-root",
      projectRoot,
      "--scene-root",
      fixture.sceneRoot,
      "--ledger",
      fixture.ledgerPath,
      "--entry-id",
      captured.entry_id,
      "--json",
    ]);
    assertEqual(recipe.prompt_status, "prompt_file", "ledger recipe prompt status");
    return `find=${findResult.total_matches}; recipe=${recipe.entry_id}`;
  });

  await step("review_board", "Review Board full build writes page and data", async () => {
    await runNodeScript(fixture.reviewBoardScript, [
      "--project-root",
      projectRoot,
      "--ledger",
      fixture.ledgerPath,
      "--decision-log",
      fixture.decisionLogPath,
      "--output",
      fixture.reviewOutputPath,
      "--force",
    ]);
    assert(existsSync(fixture.reviewOutputPath), "Review Board index.html was not written.");
    assert(existsSync(join(fixture.reviewOutputDir, "review-data.js")), "review-data.js was not written.");
    assert(existsSync(join(fixture.reviewOutputDir, "manifest.json")), "manifest.json was not written.");
    assert(existsSync(join(fixture.reviewOutputDir, "data", "all.json")), "data/all.json was not written.");
    assert(existsSync(join(fixture.reviewOutputDir, "data", "shots", "s001.json")), "shot data file was not written.");

    const data = await readJson(join(fixture.reviewOutputDir, "data", "all.json"));
    assertEqual(data.assets?.length, 4, "Review Board asset count");
    assertEqual(data.counts?.promptCoverage?.full, 2, "Review Board full recipe count");
    assertEqual(data.counts?.promptCoverage?.summary_only, 2, "Review Board summary-only count");
    return toProjectRel(fixture.reviewOutputPath);
  });

  await step("review_decision", "Review decision import applies to ledger", async () => {
    const entries = await readJsonl(fixture.ledgerPath);
    const video = entries.find((entry) => entry.asset?.spec?.role === "video");
    assert(video, "Video entry not found for decision import.");

    const marksPath = join(fixture.runRoot, "review-marks-self-test.json");
    await writeFile(
      marksPath,
      `${JSON.stringify(
        {
          kind: "review_board_marks",
          generated_at: new Date().toISOString(),
          session_id: "self_test_session",
          ledger: toProjectRel(fixture.ledgerPath),
          marks: [
            {
              entry_id: video.entry_id,
              output_path: video.asset.output_path,
              shot_id: video.shot_id,
              title: video.title,
              mark: "liked",
              prompt_state: "full",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = await runJsonScript(fixture.reviewDecisionScript, [
      "import",
      "--project-root",
      projectRoot,
      "--ledger",
      fixture.ledgerPath,
      "--decision-log",
      fixture.decisionLogPath,
      "--file",
      marksPath,
      "--apply-ledger",
      "--json",
    ]);
    assertEqual(result.imported_decisions, 1, "imported decision count");
    assertEqual(result.ledger_applied, 1, "ledger applied count");

    const nextEntries = await readJsonl(fixture.ledgerPath);
    const nextVideo = nextEntries.find((entry) => entry.entry_id === video.entry_id);
    assertEqual(nextVideo?.review?.verdict, "selected", "ledger review verdict");
    assert(existsSync(fixture.decisionLogPath), "review-decisions.jsonl was not written.");
    return `Decision log: ${toProjectRel(fixture.decisionLogPath)}`;
  });

  await step("media_card", "Media Review card can render selected assets", async () => {
    const result = await runNodeScript(fixture.mediaCardScript, [
      "--project-root",
      projectRoot,
      "--from-ledger",
      "--ledger",
      fixture.ledgerPath,
      "--review",
      "selected",
      "--limit",
      "1",
      "--compact",
      "--no-preview",
    ]);
    assert(result.stdout.includes("[打开文件]"), "media-card output did not include an open-file link.");
    assert(result.stdout.includes("`selected`"), "media-card output did not include selected review status.");
    return "Selected media card rendered.";
  });

  await step("review_board_data", "review-board-data entrypoint refreshes saved decisions", async () => {
    await runHarnessEntrypoint("review-board-data", [
      "--project-root",
      projectRoot,
      "--ledger",
      fixture.ledgerPath,
      "--decision-log",
      fixture.decisionLogPath,
      "--output",
      fixture.reviewOutputPath,
    ]);
    const data = await readJson(join(fixture.reviewOutputDir, "data", "all.json"));
    const liked = data.assets.find((asset) => asset.savedMark === "liked");
    assert(liked, "Saved liked mark was not visible in refreshed Review Board data.");
    assertEqual(data.counts?.savedMarks?.liked, 1, "saved liked mark count");
    return "Saved decision is visible in refreshed Review Board data.";
  });
} catch (error) {
  failed = true;
  if (!opts.json) {
    console.error(`\nSelf-test failed: ${error.message}`);
  }
} finally {
  if (fixture && !opts.keepFixture && !failed) {
    await removeFixture(fixture.runRoot);
  }
}

const ok = !failed && results.every((result) => result.ok);
const summary = {
  ok,
  project_root: projectRoot,
  fixture: fixture ? toProjectRel(fixture.runRoot) : null,
  fixture_kept: Boolean(fixture && (opts.keepFixture || failed)),
  phases: buildPhaseSummary(results),
  results,
  manual_checklist: MANUAL_CHECKLIST,
};

if (opts.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log("");
  console.log(ok ? "Project harness self-test PASS" : "Project harness self-test FAIL");
  if (summary.fixture_kept) {
    console.log(`Fixture kept: ${summary.fixture}`);
  }
  console.log("");
  console.log("Phase coverage:");
  for (const phase of summary.phases) {
    console.log(`  ${phase.ok ? "[PASS]" : "[FAIL]"} ${phase.id}: ${phase.title}`);
  }
  console.log("");
  console.log("Manual acceptance checklist:");
  MANUAL_CHECKLIST.forEach((item, index) => {
    console.log(`  ${index + 1}. ${item}`);
  });
}

process.exit(ok ? 0 : 1);

async function step(id, label, fn) {
  const startedAt = Date.now();
  try {
    const details = await fn();
    const result = {
      id,
      label,
      ok: true,
      details: details || "",
      duration_ms: Date.now() - startedAt,
    };
    results.push(result);
    if (!opts.json) printStep(result);
  } catch (error) {
    const result = {
      id,
      label,
      ok: false,
      details: error.message,
      duration_ms: Date.now() - startedAt,
    };
    results.push(result);
    if (!opts.json) printStep(result);
    throw error;
  }
}

function printStep(result) {
  const marker = result.ok ? "PASS" : "FAIL";
  console.log(`[${marker}] ${result.label}`);
  if (result.details) console.log(`  ${result.details}`);
}

async function createFixture() {
  const root = resolvePath(opts.fixtureRoot || join(projectRoot, DATA_ROOT));
  await mkdir(root, { recursive: true });
  const runRoot = await mkdtemp(join(root, "run-"));
  const sceneRoot = join(runRoot, "blue_space_bridge_0421");
  const shotsRoot = join(sceneRoot, "shots");
  const shotRoot = join(shotsRoot, "s001_self_test");
  const videoPath = join(shotRoot, "videos", "codex_self_test_sd2_1080p_v1.mp4");
  const keyframePath = join(shotRoot, "keyframes", "codex_self_test_image2_16x9_v1.png");
  const capturePath = join(shotRoot, "keyframes", "codex_self_test_generation_capture_image2_v1.png");
  const storyboardPath = join(shotRoot, "refs", "codex_self_test_storyboard_sheet.png");
  const previewPath = join(shotRoot, "review", "codex_self_test_preview_sheet.png");
  const contactPath = join(shotRoot, "keyframes", "codex_self_test_contact_sheet.png");
  const logPath = join(shotRoot, "work", "logs", "video_submit_codex_self_test.json");
  const ledgerPath = join(sceneRoot, "_ledger", "production-ledger.jsonl");
  const decisionLogPath = join(sceneRoot, "_ledger", "review-decisions.jsonl");
  const reviewOutputPath = join(sceneRoot, "_review", "index.html");
  const reviewOutputDir = dirname(reviewOutputPath);
  const referenceBoardOutputPath = join(runRoot, "reference-board", "index.html");
  const referenceBoardOutputDir = dirname(referenceBoardOutputPath);
  const taskId = `task_self_test_${hashText(runRoot).slice(0, 10)}`;

  await mkdir(dirname(videoPath), { recursive: true });
  await mkdir(dirname(keyframePath), { recursive: true });
  await mkdir(dirname(storyboardPath), { recursive: true });
  await mkdir(dirname(previewPath), { recursive: true });
  await mkdir(dirname(logPath), { recursive: true });
  await mkdir(dirname(ledgerPath), { recursive: true });
  await writeFile(videoPath, "codex self-test placeholder video\n", "utf8");
  await writeTinyPng(keyframePath);
  await writeTinyPng(storyboardPath);
  await writeTinyPng(previewPath);
  await writeTinyPng(contactPath);
  await writeFile(ledgerPath, "", "utf8");
  await writeFile(
    logPath,
    `${JSON.stringify(
      {
        request: {
          name: "codex harness self-test video",
          args: {
            prompt: "A compact automated fixture shot for Bluespace harness self-test.",
            resolution: "1080p",
            duration: 4,
            ratio: "16:9",
            generate_audio: false,
            image_path: toProjectRel(keyframePath),
          },
        },
        submitted: {
          task_id: taskId,
        },
        outputs: [
          {
            task_id: taskId,
            path: toProjectRel(videoPath),
          },
        ],
        note: "Automated harness self-test fixture.",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    runRoot,
    sceneRoot,
    shotsRoot,
    shotRoot,
    videoPath,
    keyframePath,
    capturePath,
    storyboardPath,
    previewPath,
    contactPath,
    logPath,
    ledgerPath,
    decisionLogPath,
    reviewOutputPath,
    reviewOutputDir,
    referenceBoardOutputPath,
    referenceBoardOutputDir,
    taskId,
    ledgerScript: join(projectRoot, "bluespace", "tools", "production-ledger", "ledger.mjs"),
    contextIndexScript: join(SCRIPT_DIR, "context-index.mjs"),
    referenceIndexScript: join(SCRIPT_DIR, "reference-index.mjs"),
    referenceBoardScript: join(SCRIPT_DIR, "reference-board.mjs"),
    referencePickerScript: join(SCRIPT_DIR, "reference-picker.mjs"),
    generationCaptureScript: join(SCRIPT_DIR, "generation-capture.mjs"),
    mediaCardScript: join(SCRIPT_DIR, "media-card.mjs"),
    mediaManifestScript: join(SCRIPT_DIR, "media-manifest.mjs"),
    reviewBoardScript: join(SCRIPT_DIR, "review-board.mjs"),
    reviewDecisionScript: join(SCRIPT_DIR, "review-decision.mjs"),
  };
}

function buildPhaseSummary(stepResults) {
  const byId = new Map(stepResults.map((result) => [result.id, result]));
  return PHASES.map((phase) => {
    const checks = phase.verifies.map((id) => byId.get(id) || null);
    return {
      ...phase,
      ok: checks.every((check) => check?.ok),
      checks: phase.verifies,
    };
  });
}

async function writeTinyPng(pathText) {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
  await writeFile(pathText, png);
}

async function removeFixture(runRoot) {
  const allowedRoot = join(projectRoot, DATA_ROOT);
  assertInside(runRoot, allowedRoot);
  await rm(runRoot, { recursive: true, force: true });
}

async function runJsonScript(scriptPath, args) {
  const result = await runNodeScript(scriptPath, args);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    const extracted = parseLastJsonObject(result.stdout);
    if (extracted) return extracted;
    throw new Error(`Expected JSON output from ${toProjectRel(scriptPath)}: ${error.message}\n${result.stdout}`);
  }
}

function parseLastJsonObject(text) {
  const starts = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "{") starts.push(index);
  }
  for (const start of starts.reverse()) {
    const candidate = text.slice(start).trim();
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep searching earlier JSON object starts.
    }
  }
  return null;
}

async function runNodeScript(scriptPath, args) {
  return runCommand(process.execPath, [scriptPath, ...args], { cwd: projectRoot, timeoutMs: opts.timeoutMs });
}

async function runHarnessEntrypoint(name, args) {
  if (process.platform === "win32") {
    const scriptPath = join(SCRIPT_DIR, `${name}.ps1`);
    return runCommand(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args],
      { cwd: projectRoot, timeoutMs: opts.timeoutMs },
    );
  }
  const scriptPath = join(SCRIPT_DIR, `${name}.sh`);
  return runCommand("sh", [scriptPath, ...args], { cwd: projectRoot, timeoutMs: opts.timeoutMs });
}

function runCommand(command, args, { cwd, timeoutMs }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Command timed out: ${command} ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolvePromise({ stdout: stdout.trim(), stderr: stderr.trim(), code });
      } else {
        reject(
          new Error(
            [
              `Command failed (${code}): ${command} ${args.join(" ")}`,
              stdout.trim() ? `stdout:\n${stdout.trim()}` : "",
              stderr.trim() ? `stderr:\n${stderr.trim()}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        );
      }
    });
  });
}

async function readJson(pathText) {
  return JSON.parse(await readFile(pathText, "utf8"));
}

async function readWindowDataJs(pathText, prefix) {
  const text = await readFile(pathText, "utf8");
  const trimmed = text.trim();
  assert(trimmed.startsWith(prefix), `${toProjectRel(pathText)} does not start with expected data prefix.`);
  return JSON.parse(trimmed.slice(prefix.length).replace(/;\s*$/, ""));
}

async function readJsonl(pathText) {
  const text = await readFile(pathText, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function resolveProjectPath(pathText) {
  if (isAbsolute(pathText)) return pathText;
  return resolve(projectRoot, pathText.replace(/^\.?[\\/]/, ""));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertInside(pathText, expectedParent) {
  const abs = resolve(pathText);
  const parent = resolve(expectedParent);
  const rel = relative(parent, abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Path is outside allowed self-test fixture root: ${abs}`);
  }
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

function resolvePath(pathText) {
  return isAbsolute(pathText) ? pathText : resolve(process.cwd(), pathText);
}

function toProjectRel(pathText) {
  const rel = relative(projectRoot, resolvePath(pathText));
  return normalizeSlashes(rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : pathText);
}

function normalizeSlashes(pathText) {
  return pathText ? pathText.replace(/\\/g, "/") : pathText;
}

function hashText(text) {
  return createHash("sha1").update(text).digest("hex");
}

function parseArgs(args) {
  const parsed = {
    help: false,
    projectRoot: null,
    fixtureRoot: null,
    keepFixture: false,
    json: false,
    timeoutMs: 30000,
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
    else if (key === "--fixture-root") parsed.fixtureRoot = readValue();
    else if (key === "--timeout-ms") parsed.timeoutMs = Number(readValue());
    else if (arg === "--keep-fixture") parsed.keepFixture = true;
    else if (arg === "--json") parsed.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number.");
  }

  return parsed;
}

function printHelp() {
  process.stdout.write(`Project harness self-test

Usage:
  node tools/project-harness/self-test.mjs [options]
  tools/project-harness/self-test.ps1 [options]
  tools/project-harness/self-test.sh [options]

Options:
  --project-root <path>    Defaults to the nearest trae_projects root.
  --fixture-root <path>    Defaults to tmp/project-harness-self-test inside the project.
  --keep-fixture           Keep the temporary fixture even after a successful run.
                           Failed runs always keep the fixture for debugging.
  --timeout-ms <number>    Per-command timeout. Defaults to 30000.
  --json                   Print machine-readable output.
  -h, --help               Show this help.

Coverage:
  Phase 1-12: entrypoints, media-card, ingest, enrich-recipes, generation-capture,
  validate --strict, prompt-index, Review Board full build, review-board-data refresh,
  review-decision import with --apply-ledger, reference-index, context-index, and
  ledger find/recipe queries, reference-governance boundaries, Reference Board, and
  Prompt Reference Picker.
`);
}
