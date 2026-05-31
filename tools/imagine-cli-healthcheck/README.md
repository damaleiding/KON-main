---
description: Imagine CLI 连接性能检测工具。
---

# Imagine CLI 连接性能检测工具

这个工具用于快速判断当前机器通过 VPN 访问公司 Imagine 服务时是否稳定。默认只跑轻量检查，不会提交生图或生视频任务。

## 快速使用

在项目根目录运行：

```bash
tools/imagine-cli-healthcheck/check.sh
```

Windows PowerShell：

```powershell
.\tools\imagine-cli-healthcheck\check.ps1
```

也可以直接用 Node：

```bash
node tools/imagine-cli-healthcheck/healthcheck.mjs
```

## 检测内容

默认检测四件事：

- 本机 Node 和 `imagine --version` 是否可用。
- `imagine auth status` 是否能连上服务并返回登录态。
- 服务域名是否能解析 DNS。
- 服务地址是否能完成 HTTPS/TLS 连接。

可选检测：

- `--argv-canary`：本地验证多行 `--prompt` 经过 Windows `.cmd/cmd.exe` 参数链时是否会被截断。这个检查不会提交生成任务。

报告会保存到：

```text
tools/imagine-cli-healthcheck/reports/
```

## 常用命令

多跑几次，适合检查间歇性抖动：

```bash
tools/imagine-cli-healthcheck/check.sh --probes 5
```

VPN 慢的时候，把超时拉长：

```bash
tools/imagine-cli-healthcheck/check.sh --probes 5 --timeout-ms 15000
```

指定服务地址：

```bash
tools/imagine-cli-healthcheck/check.sh --server https://a1composerv2.gameaigc.bytedance.net
```

输出 JSON，方便之后做自动化或对比：

```bash
tools/imagine-cli-healthcheck/check.sh --json
```

检查视频提交参数链，尤其是 CLI 更新或 Windows 入口变更之后：

```powershell
.\tools\imagine-cli-healthcheck\check.ps1 --imagine-bin C:\workspace\Trae\nodejs\imagine.cmd --argv-canary
```

如果 `argv canary` 提示多行 prompt 被截断，不要用 `.cmd/cmd.exe -> --prompt <多行文本>` 路径提交正式视频；改用直接 JS/API JSON payload，或等官方 CLI 原生支持 `--prompt-file` 后重新验证。

真实提交一个低质量 `image2` 小图任务：

```bash
tools/imagine-cli-healthcheck/check.sh --full
```

注意：`--full` 会真的调用 Imagine 服务生成图片，耗时和资源消耗都更接近真实使用；平时排查 VPN 是否通，先用默认快速检查即可。

## 结果判断

- `PASS`：快速链路健康，当前可以直接使用 Imagine CLI。
- `WARN`：能连上，但存在部分失败、耗时偏高，或真实生成烟雾测试失败。
- `FAIL`：CLI 不可用、登录态检查全失败、DNS 全失败，或服务链路无法建立。

常见含义：

- `fetch failed` / `network error`：优先怀疑 VPN、公司 DNS、代理或网络抖动。
- `no token` / `unauthorized`：先运行 `imagine auth login`。
- `DNS 解析失败`：VPN 可能没接入公司网络，或当前 DNS 没走公司链路。
- `HTTPS/TLS 失败`：VPN 连接了但服务链路不完整，或代理/证书链路有问题。
- `auth status` 成功但 `HTTPS/TLS` 失败：以 `auth status` 为准，根路径探测可能被服务网关限制；报告中会标成警告而不是直接判死。

## 参数

```text
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
```
