#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

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
const checks = [];

let gitCommand = "git";
let usedGitFallback = false;
let gitVersion = await runCommand(gitCommand, ["--version"], { timeoutMs: 5000 });
if (!gitVersion.ok) {
  const fallbackGit = findWindowsGit();
  if (fallbackGit) {
    const fallbackVersion = await runCommand(fallbackGit, ["--version"], { timeoutMs: 5000 });
    if (fallbackVersion.ok) {
      gitCommand = fallbackGit;
      usedGitFallback = true;
      gitVersion = fallbackVersion;
    }
  }
}
checks.push({
  id: "git_command",
  label: "Git installed and usable",
  required: true,
  ok: gitVersion.ok,
  details: gitVersion.ok
    ? `${gitVersion.stdout}${usedGitFallback ? ` (${gitCommand}; restart PowerShell to refresh PATH)` : ""}`
    : firstFailure(gitVersion),
  fix: gitVersion.ok ? null : buildGitInstallHint(),
});

if (gitVersion.ok) {
  const gitWorktree = await runCommand(gitCommand, ["-C", projectRoot, "rev-parse", "--is-inside-work-tree"], {
    timeoutMs: 5000,
  });
  checks.push({
    id: "git_worktree",
    label: "Workspace is a Git worktree",
    required: true,
    ok: gitWorktree.ok && gitWorktree.stdout.trim() === "true",
    details: gitWorktree.ok ? gitWorktree.stdout : firstFailure(gitWorktree),
    fix: "在项目根目录执行 `git init`，或把这个工作区迁移到从远程仓库 clone 下来的目录。",
  });

  const gitName = await runCommand(gitCommand, ["config", "--global", "user.name"], { timeoutMs: 5000 });
  const gitEmail = await runCommand(gitCommand, ["config", "--global", "user.email"], { timeoutMs: 5000 });
  const configuredName = gitName.stdout.trim();
  const configuredEmail = gitEmail.stdout.trim();
  checks.push({
    id: "git_identity",
    label: "Git user identity is configured",
    required: false,
    ok: Boolean(configuredName) && Boolean(configuredEmail),
    details: `${configuredName || "(missing name)"} <${configuredEmail || "missing email"}>`,
    fix:
      "配置提交身份：`git config --global user.name \"Your Name\"` 和 `git config --global user.email \"you@example.com\"`。",
  });

}

checks.push({
  id: "platform",
  label: "Runtime platform detected",
  required: false,
  ok: true,
  details: `${process.platform}/${process.arch}`,
  fix: null,
});

checks.push({
  id: "node_runtime",
  label: "Node runtime available",
  required: true,
  ok: true,
  details: `${process.version} at ${process.execPath}`,
  fix: null,
});

const entrypointCheck = checkCrossSystemEntrypoints(projectRoot);
checks.push({
  id: "cross_system_entrypoints",
  label: "Windows and macOS shell entrypoints exist",
  required: true,
  ok: entrypointCheck.ok,
  details: entrypointCheck.ok
    ? "doctor, self-test, context-index, startup-brief, token-meter, media-manifest, reference-index, reference-board, reference-picker, generation-capture, media-card, review-board, review-board-data, review-board-open, review-decision, and production-ledger Windows/macOS entrypoints are present."
    : entrypointCheck.details,
  fix: "保留 PowerShell 与 POSIX shell 双入口，核心逻辑放在 Node 脚本中共用。",
});

checks.push({
  id: "git_attributes",
  label: "Git attributes define cross-platform line endings and binary media handling",
  required: true,
  ok: existsSync(join(projectRoot, ".gitattributes")),
  details: existsSync(join(projectRoot, ".gitattributes")) ? ".gitattributes found" : ".gitattributes missing",
  fix: "添加 `.gitattributes`，统一文本换行；媒体默认走 out-of-band sync，不使用 Git LFS。",
});

checks.push({
  id: "portable_project_root",
  label: "Project root was discovered from workspace markers",
  required: true,
  ok: existsSync(join(projectRoot, "AGENTS.md")) && existsSync(join(projectRoot, "bluespace")),
  details: projectRoot,
  fix: "从仓库根目录或其子目录运行 doctor，必要时使用 `--project-root <path>` 指定根目录。",
});

const ledgerScript = join(projectRoot, "bluespace", "tools", "production-ledger", "ledger.mjs");
if (existsSync(ledgerScript)) {
  const ledgerValidate = await runCommand(process.execPath, [ledgerScript, "validate", "--json"], {
    timeoutMs: 30000,
  });
  checks.push({
    id: "production_ledger",
    label: "Production ledger validates",
    required: true,
    ok: ledgerValidate.ok,
    details: ledgerValidate.ok ? summarizeLedgerValidate(ledgerValidate.stdout) : firstFailure(ledgerValidate),
    fix: "先运行 `.\u005cbluespace\u005ctools\u005cproduction-ledger\u005cledger.ps1 validate` 查看具体账本问题。",
  });
} else {
  checks.push({
    id: "production_ledger",
    label: "Production ledger tool exists",
    required: true,
    ok: false,
    details: `Missing ${ledgerScript}`,
    fix: "确认 `bluespace/tools/production-ledger/` 已经随项目同步。",
  });
}

const ledgerPath = join(
  projectRoot,
  "bluespace",
  "outputs",
  "blue_space_bridge_0421",
  "_ledger",
  "production-ledger.jsonl",
);
if (existsSync(ledgerPath)) {
  const ledgerPortable = await checkLedgerPortablePaths(ledgerPath);
  checks.push({
    id: "ledger_portable_paths",
    label: "Production ledger uses portable project-relative paths",
    required: true,
    ok: ledgerPortable.ok,
    details: ledgerPortable.ok
      ? "Ledger paths are relative and use forward slashes."
      : `${ledgerPortable.issues.length} issue(s): ${ledgerPortable.issues.slice(0, 5).join("; ")}`,
    fix:
      "账本中的 output_path、declared_output_path、prompt_file 和 references[].path 应使用项目相对路径和 `/` 分隔符。",
  });
}

const referenceIndexScript = join(projectRoot, "tools", "project-harness", "reference-index.mjs");
const referenceIndexPath = join(projectRoot, "bluespace", "refs", "_index", "reference-index.json");
const referenceIndexMarkdownPath = join(projectRoot, "bluespace", "refs", "_index", "reference-index.md");
const referenceCheck = await checkReferenceGovernanceAndIndex(referenceIndexScript, referenceIndexPath, referenceIndexMarkdownPath);
checks.push({
  id: "reference_governance",
  label: "Reference governance and index validate",
  required: true,
  ok: referenceCheck.ok,
  details: referenceCheck.details,
  fix:
    "先运行 `.\u005ctools\u005cproject-harness\u005creference-index.ps1` 刷新参考图索引；如果仍失败，检查 `bluespace/refs/_index/reference-governance.json` 的 path 和规则。",
});

const contextIndexScript = join(projectRoot, "tools", "project-harness", "context-index.mjs");
const contextIndexPath = join(projectRoot, "bluespace", "_harness", "context-index.json");
const contextIndexMarkdownPath = join(projectRoot, "bluespace", "_harness", "context-index.md");
const contextCheck = await checkContextIndex(contextIndexScript, contextIndexPath, contextIndexMarkdownPath);
checks.push({
  id: "context_index",
  label: "Project context index is fresh",
  required: true,
  ok: contextCheck.ok,
  details: contextCheck.details,
  fix:
    "运行 `.\u005ctools\u005cproject-harness\u005ccontext-index.ps1` 刷新项目上下文索引；如果仍失败，先确认 ledger、prompt-index 和 reference-index 都能读取。",
});

const hostPathScan = await scanHostSpecificPaths(projectRoot);
checks.push({
  id: "host_specific_paths",
  label: "No new host-specific absolute paths in harness files",
  required: false,
  ok: hostPathScan.matches.length === 0,
  details:
    hostPathScan.matches.length === 0
      ? "No host-specific paths found in active harness files."
      : `${hostPathScan.matches.length} reference(s): ${hostPathScan.matches.slice(0, 5).join("; ")}`,
  fix:
    "跨主机共享的脚本和 harness 文档优先使用项目相对路径；必须保留的本机路径放到 `.local` 文件或用户环境变量里。",
});

const caseCollisions = await scanCaseCollisions(projectRoot);
checks.push({
  id: "case_collisions",
  label: "No case-only filename collisions",
  required: false,
  ok: caseCollisions.length === 0,
  details:
    caseCollisions.length === 0
      ? "No case-only collisions found in project files."
      : `${caseCollisions.length} collision(s): ${caseCollisions.slice(0, 5).join("; ")}`,
  fix: "避免只靠大小写区分文件名；Windows 和默认 macOS 文件系统通常大小写不敏感。",
});

const failedRequired = checks.filter((check) => check.required && !check.ok);
const warnings = checks.filter((check) => !check.required && !check.ok);
const result = {
  project_root: projectRoot,
  verdict: failedRequired.length === 0 ? "PASS" : "FAIL",
  failed_required: failedRequired.length,
  warnings: warnings.length,
  checks,
};

if (opts.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printHuman(result);
}

process.exit(failedRequired.length === 0 ? 0 : 1);

function parseArgs(args) {
  const parsed = {
    help: false,
    json: false,
    projectRoot: null,
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
    else if (arg === "--json") parsed.json = true;
    else if (key === "--project-root") parsed.projectRoot = readValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printHelp() {
  process.stdout.write(`Project harness doctor

Usage:
  node tools/project-harness/doctor.mjs [options]
  tools/project-harness/doctor.ps1 [options]
  tools/project-harness/doctor.sh [options]

Options:
  --project-root <path>    Defaults to the nearest trae_projects root.
  --json                   Print machine-readable output.
  -h, --help               Show this help.

Required checks:
  1. Git is installed and visible on PATH.
  2. The workspace is inside a Git worktree.
  3. Node is available.
  4. The production ledger validates.
  5. Windows and macOS shell entrypoints exist.
  6. Git attributes exist for line endings and binary media handling.
  7. Production ledger paths are portable.
  8. Reference governance loads without warnings and reference-index is fresh.
  9. Project context-index is fresh.

Recommended checks:
  - Git identity is configured.
  - Active harness files avoid host-specific absolute paths.
`);
}

function printHuman(result) {
  console.log(`Project root: ${result.project_root}`);
  console.log(`Verdict: ${result.verdict}`);
  for (const check of result.checks) {
    const marker = check.ok ? "PASS" : check.required ? "FAIL" : "WARN";
    console.log(`[${marker}] ${check.label}`);
    if (check.details) console.log(`  ${check.details}`);
    if (!check.ok && check.fix) console.log(`  Fix: ${check.fix}`);
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

function findWindowsGit() {
  if (process.platform !== "win32") return null;
  const candidates = [
    "C:\\Program Files\\Git\\cmd\\git.exe",
    "C:\\Program Files\\Git\\bin\\git.exe",
    "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
    "C:\\Program Files (x86)\\Git\\bin\\git.exe",
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function runCommand(command, args, { timeoutMs, trimOutput = true }) {
  return new Promise((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const child = spawn(command, args, {
      cwd: projectRoot,
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    const settle = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult({
        command,
        args,
        stdout: trimOutput ? trim(stdout) : stdout,
        stderr: trimOutput ? trim(stderr) : stderr,
        timed_out: timedOut,
        ...payload,
      });
    };

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      settle({ ok: false, exit_code: null, error: error.message });
    });
    child.on("close", (code) => {
      settle({ ok: code === 0 && !timedOut, exit_code: code, error: null });
    });
  });
}

function firstFailure(result) {
  if (result.error) return result.error;
  if (result.timed_out) return "Command timed out";
  if (result.stderr) return result.stderr;
  if (result.stdout) return result.stdout;
  if (result.exit_code !== null && result.exit_code !== undefined) {
    return `Exit code ${result.exit_code}`;
  }
  return "Command failed";
}

function trim(text) {
  return text.trim().slice(0, 4000);
}

function summarizeLedgerValidate(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    const errorCount = Array.isArray(parsed.errors)
      ? parsed.errors.length
      : Array.isArray(parsed.error_items)
        ? parsed.error_items.length
        : parsed.errors;
    const warningCount = Array.isArray(parsed.warnings)
      ? parsed.warnings.length
      : Array.isArray(parsed.warning_items)
        ? parsed.warning_items.length
        : parsed.warnings;
    return `${parsed.entries} entries, ${errorCount} errors, ${warningCount} warnings`;
  } catch {
    return stdout;
  }
}

function buildGitInstallHint() {
  if (process.platform === "darwin") {
    return [
      "macOS 推荐先安装 Xcode Command Line Tools：`xcode-select --install`。",
      "也可以使用 Homebrew：`brew install git`。",
      "安装后运行 `git --version` 和 `./tools/project-harness/doctor.sh`。",
    ].join(" ");
  }
  return [
    "Windows 推荐使用 winget：`winget install --id Git.Git -e --source winget`。",
    "安装后重启 PowerShell，再运行 `git --version` 和 `.\u005ctools\u005cproject-harness\u005cdoctor.ps1`。",
    "如果使用 Scoop：`scoop install git`；如果使用 Chocolatey：`choco install git -y`。",
  ].join(" ");
}

function checkCrossSystemEntrypoints(root) {
  const required = [
    "tools/project-harness/doctor.ps1",
    "tools/project-harness/doctor.sh",
    "tools/project-harness/self-test.ps1",
    "tools/project-harness/self-test.sh",
    "tools/project-harness/context-index.ps1",
    "tools/project-harness/context-index.sh",
    "tools/project-harness/startup-brief.ps1",
    "tools/project-harness/startup-brief.sh",
    "tools/project-harness/token-meter.ps1",
    "tools/project-harness/token-meter.sh",
    "tools/project-harness/media-manifest.ps1",
    "tools/project-harness/media-manifest.sh",
    "tools/project-harness/reference-index.ps1",
    "tools/project-harness/reference-index.sh",
    "tools/project-harness/reference-board.ps1",
    "tools/project-harness/reference-board.sh",
    "tools/project-harness/reference-board-data.ps1",
    "tools/project-harness/reference-board-data.sh",
    "tools/project-harness/reference-picker.ps1",
    "tools/project-harness/reference-picker.sh",
    "tools/project-harness/generation-capture.ps1",
    "tools/project-harness/generation-capture.sh",
    "tools/project-harness/media-card.ps1",
    "tools/project-harness/media-card.sh",
    "tools/project-harness/review-board.ps1",
    "tools/project-harness/review-board.sh",
    "tools/project-harness/review-board-data.ps1",
    "tools/project-harness/review-board-data.sh",
    "tools/project-harness/review-board-open.ps1",
    "tools/project-harness/review-board-open.sh",
    "tools/project-harness/review-decision.ps1",
    "tools/project-harness/review-decision.sh",
    "bluespace/tools/production-ledger/ledger.ps1",
    "bluespace/tools/production-ledger/ledger.sh",
  ];
  const missing = required.filter((item) => !existsSync(join(root, ...item.split("/"))));
  return {
    ok: missing.length === 0,
    details: missing.length === 0 ? "" : `Missing: ${missing.join(", ")}`,
  };
}

async function checkLedgerPortablePaths(ledgerPath) {
  const text = await readFile(ledgerPath, "utf8");
  const issues = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      return;
    }
    const paths = [
      ["asset.output_path", entry.asset?.output_path],
      ["asset.declared_output_path", entry.asset?.declared_output_path],
      ["generation.prompt_file", entry.generation?.prompt_file],
      ...(entry.generation?.references || []).map((ref, refIndex) => [
        `generation.references[${refIndex}].path`,
        ref.path,
      ]),
    ];
    for (const [field, value] of paths) {
      if (!value) continue;
      if (isAbsoluteLike(value)) {
        issues.push(`line ${index + 1} ${field} is absolute: ${value}`);
      }
      if (value.includes("\\")) {
        issues.push(`line ${index + 1} ${field} uses backslashes: ${value}`);
      }
    }
  });
  return { ok: issues.length === 0, issues };
}

async function checkReferenceGovernanceAndIndex(scriptPath, indexPath, markdownPath) {
  if (!existsSync(scriptPath)) {
    return {
      ok: false,
      details: `Missing ${normalizeSlashes(relative(projectRoot, scriptPath))}`,
    };
  }

  const generatedResult = await runCommand(process.execPath, [scriptPath, "--dry-run", "--json"], {
    timeoutMs: 30000,
    trimOutput: false,
  });
  if (!generatedResult.ok) {
    return {
      ok: false,
      details: firstFailure(generatedResult),
    };
  }

  let generated;
  try {
    generated = JSON.parse(generatedResult.stdout);
  } catch (error) {
    return {
      ok: false,
      details: `reference-index dry-run did not return JSON: ${error.message}`,
    };
  }

  const warnings = generated.governance?.warnings || [];
  const savedExists = existsSync(indexPath);
  const markdownExists = existsSync(markdownPath);
  let stale = false;

  if (savedExists) {
    try {
      const saved = JSON.parse(await readFile(indexPath, "utf8"));
      stale = JSON.stringify(referenceComparable(saved)) !== JSON.stringify(referenceComparable(generated));
    } catch (error) {
      return {
        ok: false,
        details: `Saved reference-index.json could not be parsed: ${error.message}`,
      };
    }
  }

  const ok = warnings.length === 0 && savedExists && markdownExists && !stale;
  const details = [
    `${generated.assets?.length || 0} assets`,
    `${generated.skipped?.length || 0} skipped`,
    `${warnings.length} governance warnings`,
    `${generated.governance?.matched_assets || 0} governed`,
    savedExists ? "json present" : "json missing",
    markdownExists ? "markdown present" : "markdown missing",
    stale ? "saved index stale" : "saved index fresh",
  ].join(", ");

  return { ok, details };
}

function referenceComparable(index) {
  return {
    refs_root: index.refs_root,
    governance: index.governance,
    counts: index.counts,
    rules: index.rules,
    assets: (index.assets || []).map((asset) => ({
      asset_id: asset.asset_id,
      category: asset.category,
      entity: asset.entity,
      status: asset.status,
      path: asset.path,
      usage: asset.usage,
      priority: asset.priority,
      source_bucket: asset.source_bucket,
      notes: asset.notes,
      cautions: asset.cautions,
      governance: asset.governance || null,
    })),
    skipped: (index.skipped || []).map((item) => ({
      path: item.path,
      reason: item.reason,
      governance: item.governance || null,
    })),
  };
}

async function checkContextIndex(scriptPath, indexPath, markdownPath) {
  if (!existsSync(scriptPath)) {
    return {
      ok: false,
      details: `Missing ${normalizeSlashes(relative(projectRoot, scriptPath))}`,
    };
  }

  const generatedResult = await runCommand(process.execPath, [scriptPath, "--dry-run", "--json"], {
    timeoutMs: 30000,
    trimOutput: false,
  });
  if (!generatedResult.ok) {
    return {
      ok: false,
      details: firstFailure(generatedResult),
    };
  }

  let generated;
  try {
    generated = JSON.parse(generatedResult.stdout);
  } catch (error) {
    return {
      ok: false,
      details: `context-index dry-run did not return JSON: ${error.message}`,
    };
  }

  const savedExists = existsSync(indexPath);
  const markdownExists = existsSync(markdownPath);
  let stale = false;

  if (savedExists) {
    try {
      const saved = JSON.parse(await readFile(indexPath, "utf8"));
      stale = JSON.stringify(contextComparable(saved)) !== JSON.stringify(contextComparable(generated));
    } catch (error) {
      return {
        ok: false,
        details: `Saved context-index.json could not be parsed: ${error.message}`,
      };
    }
  }

  const ledgerEntries = generated.current_state?.ledger?.entries ?? 0;
  const referenceAssets = generated.current_state?.references?.assets ?? 0;
  const phase9 = generated.phase_status?.find((item) => item.phase === 9)?.status || "unknown";
  const phase11 = generated.phase_status?.find((item) => item.phase === 11)?.status || "unknown";
  const phase12 = generated.phase_status?.find((item) => item.phase === 12)?.status || "unknown";
  const ok = savedExists && markdownExists && !stale;
  const details = [
    `${ledgerEntries} ledger entries`,
    `${referenceAssets} reference assets`,
    `phase9=${phase9}`,
    `phase11=${phase11}`,
    `phase12=${phase12}`,
    savedExists ? "json present" : "json missing",
    markdownExists ? "markdown present" : "markdown missing",
    stale ? "saved index stale" : "saved index fresh",
  ].join(", ");

  return { ok, details };
}

function contextComparable(index) {
  return {
    project_root_marker: index.project_root_marker,
    startup_sequence: index.startup_sequence,
    source_of_truth: index.source_of_truth,
    phase_status: index.phase_status,
    default_excludes: index.default_excludes,
    query_recipes: index.query_recipes,
    current_state: index.current_state,
  };
}

function isAbsoluteLike(pathText) {
  return /^[A-Za-z]:[\\/]/.test(pathText) || pathText.startsWith("/Users/") || pathText.startsWith("/home/");
}

async function scanHostSpecificPaths(root) {
  const files = [
    join(root, "AGENTS.md"),
    join(root, "bluespace", "AGENTS.md"),
    join(root, "tools", "project-harness"),
    join(root, "bluespace", "tools", "production-ledger"),
    join(root, "bluespace", "refs", "_docs", "production-ledger-standard.md"),
  ];
  const textFiles = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    if ((await safeIsDirectory(file))) {
      textFiles.push(...(await collectTextFiles(file)));
    } else {
      textFiles.push(file);
    }
  }

  const matches = [];
  const pathPattern = /(?:[A-Za-z]:\\Users\\[^`"'\s)]+|[A-Za-z]:\/Users\/[^`"'\s)]+|\/Users\/[^`"'\s)]+|\/home\/[^`"'\s)]+)/g;
  for (const file of textFiles) {
    const rel = normalizeSlashes(relative(root, file));
    const text = await readFile(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const lineMatches = line.match(pathPattern) || [];
      for (const match of lineMatches) {
        if (isAllowedHostPath(match)) continue;
        matches.push(`${rel}:${index + 1} ${match}`);
      }
    });
  }

  return { matches };
}

async function safeIsDirectory(pathText) {
  try {
    const entries = await readdir(pathText, { withFileTypes: true });
    return Array.isArray(entries);
  } catch {
    return false;
  }
}

async function collectTextFiles(root) {
  const result = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await collectTextFiles(fullPath)));
    } else if (entry.isFile() && isTextFile(fullPath)) {
      result.push(fullPath);
    }
  }
  return result;
}

async function scanCaseCollisions(root) {
  const files = await collectProjectFiles(root);
  const seen = new Map();
  const collisions = [];
  for (const file of files) {
    const rel = normalizeSlashes(relative(root, file));
    const key = rel.toLowerCase();
    if (seen.has(key) && seen.get(key) !== rel) {
      collisions.push(`${seen.get(key)} <-> ${rel}`);
    } else {
      seen.set(key, rel);
    }
  }
  return collisions;
}

async function collectProjectFiles(root) {
  const result = [];
  const skipDirs = new Set([
    ".git",
    ".stfolder",
    "log",
    "tmp",
    "tmp_imagine_upload",
    "node_modules",
    "__pycache__",
  ]);
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (skipDirs.has(entry.name)) continue;
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await collectProjectFiles(fullPath)));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result;
}

function isTextFile(pathText) {
  if (isLocalStateFile(pathText)) return false;
  return [".md", ".mjs", ".js", ".ps1", ".json", ".jsonl", ".yml", ".yaml", ".txt"].includes(
    extname(pathText).toLowerCase(),
  );
}

function isLocalStateFile(pathText) {
  return /\.(?:local\.json|local\.ps1|local\.sh|local\.env)$/i.test(normalizeSlashes(pathText));
}

function isAllowedHostPath(pathText) {
  const normalized = normalizeSlashes(pathText);
  return normalized.includes("/Program Files/") || normalized.includes("/Program Files (x86)/");
}

function normalizeSlashes(pathText) {
  return pathText.replace(/\\/g, "/");
}
