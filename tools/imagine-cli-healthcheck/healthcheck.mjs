#!/usr/bin/env node

import { spawn } from "node:child_process";
import dns from "node:dns/promises";
import { mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SERVER = "https://a1composerv2.gameaigc.bytedance.net";
const DEFAULT_OUTPUT_DIR = join(SCRIPT_DIR, "reports");

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`参数错误：${error.message}`);
  console.error("运行 --help 查看用法。");
  process.exit(2);
}

if (opts.help) {
  printHelp();
  process.exit(0);
}

const startedAt = new Date();
const outputDir = opts.outputDir
  ? isAbsolute(opts.outputDir)
    ? opts.outputDir
    : resolve(process.cwd(), opts.outputDir)
  : DEFAULT_OUTPUT_DIR;

const report = {
  tool: "imagine-cli-healthcheck",
  started_at: startedAt.toISOString(),
  cwd: process.cwd(),
  imagine_bin: opts.imagineBin,
  server: opts.server || null,
  options: {
    probes: opts.probes,
    timeout_ms: opts.timeoutMs,
    full: opts.full,
    full_timeout_ms: opts.fullTimeoutMs,
    argv_canary: opts.argvCanary,
  },
  checks: {},
  verdict: null,
};

report.checks.node = {
  ok: true,
  version: process.version,
  executable: process.execPath,
};

report.checks.cli_version = sanitizeCommandResult(
  await runCommand(opts.imagineBin, ["--version"], {
    timeoutMs: opts.timeoutMs,
  }),
);

const authProbes = [];
for (let i = 0; i < opts.probes; i += 1) {
  const result = await runCommand(opts.imagineBin, ["auth", "status"], {
    timeoutMs: opts.timeoutMs,
  });
  const parsed = parseAuthStatus(result.stdout);
  const authOk = result.ok && parsed?.logged_in !== false;
  if (parsed?.server && !report.server) {
    report.server = parsed.server;
  }
  authProbes.push({
    ...sanitizeCommandResult(result),
    ok: authOk,
    command_ok: result.ok,
    auth: parsed,
    category: authOk ? "ok" : parsed?.logged_in === false ? "auth" : classifyFailure(result),
  });
}
report.checks.auth_status = summarizeCommandProbes(authProbes);

const probeServer = report.server || opts.server || DEFAULT_SERVER;
report.server = probeServer;
const serverUrl = normalizeServerUrl(probeServer);
const serverHost = new URL(serverUrl).hostname;

const dnsProbes = [];
for (let i = 0; i < opts.probes; i += 1) {
  dnsProbes.push(await dnsProbe(serverHost, opts.timeoutMs));
}
report.checks.dns = summarizeGenericProbes(dnsProbes);
report.checks.dns.host = serverHost;

const httpProbes = [];
for (let i = 0; i < opts.probes; i += 1) {
  httpProbes.push(await httpProbe(serverUrl, opts.timeoutMs));
}
report.checks.http_tls = summarizeGenericProbes(httpProbes);
report.checks.http_tls.url = serverUrl;

if (opts.full) {
  await mkdir(outputDir, { recursive: true });
  const imageOutput = join(outputDir, `smoke-image2-${timestampForFile(startedAt)}.png`);
  const prompt =
    "Imagine CLI 连接性能检测：一块简洁的状态屏，屏幕上写着 IMAGINE CLI OK，低成本烟雾测试，清晰、无水印。";
  const fullArgs = [
    "image",
    "gen",
    "--model",
    "image2",
    "--prompt",
    prompt,
    "--aspect-ratio",
    "1:1",
    "--quality",
    "low",
    "--output",
    imageOutput,
  ];
  if (opts.server) {
    fullArgs.push("--server", opts.server);
  }
  const fullResult = await runCommand(opts.imagineBin, fullArgs, {
    timeoutMs: opts.fullTimeoutMs,
  });
  report.checks.full_smoke = {
    ...sanitizeCommandResult(fullResult),
    output: imageOutput,
    category: fullResult.ok ? "ok" : classifyFailure(fullResult),
  };
}

if (opts.argvCanary) {
  report.checks.argv_transport = await argvTransportCanary(opts.timeoutMs);
}

report.verdict = buildVerdict(report);

let reportPath = null;
if (!opts.noReport) {
  await mkdir(outputDir, { recursive: true });
  reportPath = join(outputDir, `healthcheck-${timestampForFile(startedAt)}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  report.report_path = reportPath;
}

if (opts.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  printHumanSummary(report, reportPath);
}

process.exit(report.verdict.exit_code);

function parseArgs(args) {
  const result = {
    help: false,
    imagineBin: "imagine",
    probes: 2,
    timeoutMs: 10000,
    full: false,
    fullTimeoutMs: 180000,
    argvCanary: false,
    server: null,
    outputDir: null,
    json: false,
    noReport: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const [key, inlineValue] = arg.includes("=") ? arg.split(/=(.*)/s, 2) : [arg, null];
    const readValue = () => {
      if (inlineValue !== null) return inlineValue;
      i += 1;
      if (i >= args.length) {
        throw new Error(`缺少参数值：${arg}`);
      }
      return args[i];
    };

    if (arg === "-h" || arg === "--help") result.help = true;
    else if (key === "--imagine-bin") result.imagineBin = readValue();
    else if (key === "--probes") result.probes = parsePositiveInt(readValue(), "--probes");
    else if (key === "--timeout-ms") result.timeoutMs = parsePositiveInt(readValue(), "--timeout-ms");
    else if (key === "--full-timeout-ms") {
      result.fullTimeoutMs = parsePositiveInt(readValue(), "--full-timeout-ms");
    } else if (key === "--server") result.server = readValue();
    else if (key === "--output-dir") result.outputDir = readValue();
    else if (arg === "--full") result.full = true;
    else if (arg === "--argv-canary") result.argvCanary = true;
    else if (arg === "--json") result.json = true;
    else if (arg === "--no-report") result.noReport = true;
    else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  return result;
}

function parsePositiveInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} 必须是大于 0 的整数`);
  }
  return parsed;
}

function printHelp() {
  process.stdout.write(`Imagine CLI 连接性能检测工具

用法:
  node tools/imagine-cli-healthcheck/healthcheck.mjs [选项]
  tools/imagine-cli-healthcheck/check.sh [选项]

常用选项:
  --probes <n>             每项探测次数，默认 2
  --timeout-ms <ms>        快速探测超时时间，默认 10000
  --full                  额外跑一次低质量 image2 真实生成烟雾测试
  --argv-canary           本地检查多行 prompt 穿过 Windows cmd/CLI 参数链是否会被截断
  --full-timeout-ms <ms>   真实生成超时时间，默认 180000
  --server <url>           覆盖服务地址；默认从 auth status 读取，失败时使用内置地址
  --imagine-bin <path>     指定 imagine 可执行文件，默认 imagine
  --output-dir <path>      报告输出目录，默认 tools/imagine-cli-healthcheck/reports
  --json                  只输出 JSON
  --no-report             不写报告文件
  -h, --help              显示帮助

说明:
  默认不会提交生成任务，只检查 CLI、登录态、DNS 和 HTTPS/TLS 连通性。
  --full 会真的调用 image2 生成一张小图，适合确认真实任务链路。
  --argv-canary 不提交任务，只验证本地命令行参数传递。
`);
}

function runCommand(command, args, { timeoutMs }) {
  return new Promise((resolveResult) => {
    const started = performance.now();
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let killTimer = null;

    const settle = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolveResult({
        command,
        args,
        duration_ms: Math.round(performance.now() - started),
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        timed_out: timedOut,
        ...payload,
      });
    };

    const spawnSpec = buildSpawnCommand(command, args);
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      cwd: process.cwd(),
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 750);
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout = appendLimited(stdout, chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendLimited(stderr, chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      settle({
        ok: false,
        code: null,
        signal: null,
        error: error.message,
      });
    });
    child.on("close", (code, signal) => {
      settle({
        ok: code === 0 && !timedOut,
        code,
        signal,
        error: timedOut ? `命令超时：${timeoutMs}ms` : null,
      });
    });
  });
}

function buildSpawnCommand(command, args) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", command, ...args] };
  }
  return { command, args };
}

function appendLimited(existing, next) {
  const merged = existing + next;
  return merged.length > 20000 ? merged.slice(-20000) : merged;
}

function trimOutput(value) {
  const trimmed = value.trim();
  return trimmed.length > 4000 ? `${trimmed.slice(0, 4000)}\n...<truncated>` : trimmed;
}

function sanitizeCommandResult(result) {
  return {
    ok: result.ok,
    duration_ms: result.duration_ms,
    code: result.code,
    signal: result.signal,
    timed_out: result.timed_out,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
  };
}

function parseAuthStatus(stdout) {
  if (!stdout) return null;
  try {
    const parsed = JSON.parse(stdout);
    return {
      logged_in: Boolean(parsed.logged_in),
      username: parsed.username || null,
      name: parsed.name || null,
      server: parsed.server || null,
    };
  } catch {
    return null;
  }
}

function normalizeServerUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname || "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function dnsProbe(host, timeoutMs) {
  const started = performance.now();
  try {
    const result = await withTimeout(dns.lookup(host), timeoutMs);
    return {
      ok: true,
      duration_ms: Math.round(performance.now() - started),
      address: result.address,
      family: result.family,
    };
  } catch (error) {
    return {
      ok: false,
      duration_ms: Math.round(performance.now() - started),
      error: error.message,
    };
  }
}

function httpProbe(rawUrl, timeoutMs) {
  const started = performance.now();
  return new Promise((resolveProbe) => {
    const url = new URL(rawUrl);
    const client = url.protocol === "http:" ? http : https;
    const request = client.request(
      url,
      {
        method: "HEAD",
        timeout: timeoutMs,
        headers: {
          "User-Agent": "imagine-cli-healthcheck/1.0",
          "Cache-Control": "no-cache",
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => {
          resolveProbe({
            ok: true,
            duration_ms: Math.round(performance.now() - started),
            status_code: response.statusCode,
            status_message: response.statusMessage,
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error(`请求超时：${timeoutMs}ms`));
    });
    request.on("error", (error) => {
      resolveProbe({
        ok: false,
        duration_ms: Math.round(performance.now() - started),
        error: error.message,
      });
    });
    request.end();
  });
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolveValue, rejectValue) => {
    const timer = setTimeout(() => rejectValue(new Error(`请求超时：${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolveValue(value);
      },
      (error) => {
        clearTimeout(timer);
        rejectValue(error);
      },
    );
  });
}

function summarizeCommandProbes(probes) {
  const generic = summarizeGenericProbes(probes);
  const firstAuth = probes.map((probe) => probe.auth).find(Boolean) || null;
  return {
    ...generic,
    username: firstAuth?.username || null,
    name: firstAuth?.name || null,
    server: firstAuth?.server || null,
    probes,
  };
}

function summarizeGenericProbes(probes) {
  const durations = probes.filter((probe) => probe.ok).map((probe) => probe.duration_ms);
  const okCount = probes.filter((probe) => probe.ok).length;
  return {
    ok: okCount === probes.length,
    ok_count: okCount,
    total: probes.length,
    avg_ms: average(durations),
    min_ms: durations.length ? Math.min(...durations) : null,
    max_ms: durations.length ? Math.max(...durations) : null,
    p95_ms: percentile(durations, 0.95),
    probes,
  };
}

function average(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values, rank) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * rank) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function classifyFailure(result) {
  const text = `${result.stdout || ""}\n${result.stderr || ""}\n${result.error || ""}`.toLowerCase();
  if (result.timed_out || text.includes("timeout") || text.includes("timed out")) return "timeout";
  if (text.includes("fetch failed") || text.includes("network error")) return "network";
  if (
    text.includes("enotfound") ||
    text.includes("eai_again") ||
    text.includes("econnreset") ||
    text.includes("etimedout") ||
    text.includes("econnrefused")
  ) {
    return "network";
  }
  if (text.includes("no token") || text.includes("unauthorized") || text.includes("not logged")) return "auth";
  if (text.includes("approval") || text.includes("forbidden") || text.includes("policy") || text.includes("403")) {
    return "gate";
  }
  if (text.includes("enoent") || text.includes("command not found")) return "cli";
  return "unknown";
}

function buildVerdict(currentReport) {
  const reasons = [];
  const advice = [];
  let status = "PASS";

  const cli = currentReport.checks.cli_version;
  const auth = currentReport.checks.auth_status;
  const dnsCheck = currentReport.checks.dns;
  const httpCheck = currentReport.checks.http_tls;
  const full = currentReport.checks.full_smoke;
  const argvTransport = currentReport.checks.argv_transport;

  if (!cli.ok) {
    status = "FAIL";
    reasons.push("imagine 可执行文件不可用");
    advice.push("先确认 imagine 已安装且在 PATH 中，或用 --imagine-bin 指向实际路径。");
  }

  if (auth.ok_count === 0) {
    status = "FAIL";
    reasons.push("imagine auth status 全部失败，CLI 无法完成登录态/服务检查");
    const categories = new Set(auth.probes.map((probe) => probe.category));
    if (categories.has("auth")) advice.push("登录态可能失效，运行 imagine auth login。");
    if (categories.has("network") || categories.has("timeout")) {
      advice.push("优先检查 VPN、公司内网 DNS、代理和网络稳定性。");
    }
  } else if (auth.ok_count < auth.total) {
    status = maxStatus(status, "WARN");
    reasons.push(`imagine auth status 部分失败：${auth.ok_count}/${auth.total}`);
    advice.push("这通常意味着 VPN 或公司服务链路存在间歇性抖动，建议稍后重复检测。");
  }

  if (dnsCheck.ok_count === 0) {
    status = "FAIL";
    reasons.push("服务域名 DNS 解析全部失败");
    advice.push("VPN 未连上、DNS 未走公司网络，或域名当前不可解析。");
  } else if (dnsCheck.ok_count < dnsCheck.total) {
    status = maxStatus(status, "WARN");
    reasons.push(`DNS 解析部分失败：${dnsCheck.ok_count}/${dnsCheck.total}`);
  }

  if (httpCheck.ok_count === 0) {
    status = maxStatus(status, auth.ok_count > 0 ? "WARN" : "FAIL");
    reasons.push("服务 HTTPS/TLS 探测全部失败");
    advice.push("如果 auth status 也失败，基本可判定为 VPN/网络链路问题。");
  } else if (httpCheck.ok_count < httpCheck.total) {
    status = maxStatus(status, "WARN");
    reasons.push(`服务 HTTPS/TLS 探测部分失败：${httpCheck.ok_count}/${httpCheck.total}`);
  }

  const authSlow = auth.max_ms !== null && auth.max_ms > 5000;
  const httpSlow = httpCheck.max_ms !== null && httpCheck.max_ms > 5000;
  if (authSlow || httpSlow) {
    status = maxStatus(status, "WARN");
    reasons.push("探测耗时偏高，可能会影响提交任务和下载结果");
    advice.push("如果连续几次 max 都超过 5 秒，建议切换网络或重连 VPN 后再跑生成。");
  }

  if (full && !full.ok) {
    status = maxStatus(status, auth.ok_count > 0 ? "WARN" : "FAIL");
    reasons.push(`真实 image2 烟雾测试失败：${full.category}`);
    advice.push("真实生成失败不一定是网络，也可能是服务排队、策略门禁或模型侧错误，先看报告里的 stdout/stderr。");
  }

  if (argvTransport && !argvTransport.ok) {
    status = maxStatus(status, "WARN");
    reasons.push(argvTransport.reason || "多行 prompt 经过当前命令行参数链可能被截断");
    advice.push("Windows 上不要把正式多行视频 prompt 通过 .cmd/cmd.exe 作为 --prompt 参数提交；改用直接 JS/API JSON payload，或等官方 CLI 提供原生 --prompt-file 后重新验证。");
  }

  if (!reasons.length) {
    reasons.push("快速链路健康，当前可以使用 Imagine CLI。");
  }

  return {
    status,
    exit_code: status === "FAIL" ? 2 : status === "WARN" ? 1 : 0,
    reasons,
    advice: [...new Set(advice)],
  };
}

function maxStatus(left, right) {
  const rank = { PASS: 0, WARN: 1, FAIL: 2 };
  return rank[right] > rank[left] ? right : left;
}

function timestampForFile(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function printHumanSummary(currentReport, reportPath) {
  const statusLabel = {
    PASS: "通过",
    WARN: "警告",
    FAIL: "失败",
  }[currentReport.verdict.status];
  const cli = currentReport.checks.cli_version;
  const auth = currentReport.checks.auth_status;
  const dnsCheck = currentReport.checks.dns;
  const httpCheck = currentReport.checks.http_tls;
  const argvTransport = currentReport.checks.argv_transport;

  process.stdout.write(`Imagine CLI 连接性能检测
时间：${formatDate(new Date(currentReport.started_at))}
服务：${currentReport.server}
结论：${currentReport.verdict.status} / ${statusLabel}

${formatLine("本机 Node", true, currentReport.checks.node.version)}
${formatLine("imagine 版本", cli.ok, cli.ok ? cli.stdout : firstError(cli))}
${formatLine("登录态检查", auth.ok_count > 0, probeSummary(auth, auth.username ? `用户 ${auth.username}` : ""))}
${formatLine("DNS 解析", dnsCheck.ok_count > 0, probeSummary(dnsCheck, dnsCheck.host))}
${formatLine("HTTPS/TLS", httpCheck.ok_count > 0, probeSummary(httpCheck, httpStatuses(httpCheck)))}
`);

  if (currentReport.checks.full_smoke) {
    const full = currentReport.checks.full_smoke;
    process.stdout.write(
      `${formatLine("真实生成", full.ok, full.ok ? `${full.duration_ms}ms，输出 ${full.output}` : firstError(full))}\n`,
    );
  }

  if (argvTransport) {
    process.stdout.write(
      `${formatLine("argv canary", argvTransport.ok, argvTransport.ok ? "多行参数传递正常" : argvTransport.reason)}\n`,
    );
  }

  process.stdout.write("\n判断：\n");
  for (const reason of currentReport.verdict.reasons) {
    process.stdout.write(`- ${reason}\n`);
  }
  if (currentReport.verdict.advice.length) {
    process.stdout.write("\n建议：\n");
    for (const item of currentReport.verdict.advice) {
      process.stdout.write(`- ${item}\n`);
    }
  }
  if (reportPath) {
    process.stdout.write(`\n报告：${reportPath}\n`);
  }
}

async function argvTransportCanary(timeoutMs) {
  const samplePrompt = "line1\n\nline2";
  const expected = ["--prompt", samplePrompt, "--duration", "4", "--ratio", "16:9", "--no-generate-audio"];
  const script = "process.stdout.write(JSON.stringify(process.argv.slice(1)))";

  const direct = await runCommand(process.execPath, ["-e", script, "--", ...expected], { timeoutMs });
  const directParsed = parseJsonArray(direct.stdout);
  const directOk = direct.ok && arraysEqual(directParsed, expected);

  let cmd = null;
  let cmdParsed = null;
  let cmdOk = true;
  if (process.platform === "win32") {
    cmd = await runCommand("cmd.exe", ["/d", "/s", "/c", process.execPath, "-e", script, "--", ...expected], {
      timeoutMs,
    });
    cmdParsed = parseJsonArray(cmd.stdout);
    cmdOk = cmd.ok && arraysEqual(cmdParsed, expected);
  }

  const ok = directOk && cmdOk;
  return {
    ok,
    reason: ok
      ? null
      : process.platform === "win32" && directOk && !cmdOk
        ? "Windows cmd.exe 参数链会截断多行 --prompt，后续 flags 可能回到默认值"
        : "本地多行 argv 传递异常",
    direct_node: {
      ...sanitizeCommandResult(direct),
      parsed: directParsed,
      matches_expected: directOk,
    },
    cmd_shell:
      cmd === null
        ? null
        : {
            ...sanitizeCommandResult(cmd),
            parsed: cmdParsed,
            matches_expected: cmdOk,
          },
  };
}

function parseJsonArray(stdout) {
  try {
    const parsed = JSON.parse(stdout || "null");
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function arraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function formatLine(label, ok, detail) {
  return `${ok ? "OK  " : "FAIL"} ${label}：${detail || "无详情"}`;
}

function probeSummary(summary, suffix = "") {
  const timing =
    summary.avg_ms === null
      ? "无成功样本"
      : `avg ${summary.avg_ms}ms / min ${summary.min_ms}ms / max ${summary.max_ms}ms / p95 ${summary.p95_ms}ms`;
  return `${summary.ok_count}/${summary.total} 成功，${timing}${suffix ? `，${suffix}` : ""}`;
}

function httpStatuses(summary) {
  const statuses = [
    ...new Set(
      summary.probes
        .filter((probe) => probe.ok && probe.status_code)
        .map((probe) => `${probe.status_code}${probe.status_message ? ` ${probe.status_message}` : ""}`),
    ),
  ];
  return statuses.length ? `HTTP ${statuses.join(", ")}` : "";
}

function firstError(result) {
  return result.error || result.stderr || result.stdout || "未知错误";
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
