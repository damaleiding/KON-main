---
description: Imagine CLI 视频异步编排层。
---

# Imagine 视频异步工具

这个目录不是一个新的 Imagine CLI，也不应该复刻官方 CLI 的完整参数表。它只是一个薄的异步编排层：

- 官方 `imagine video submit` 参数直接传给 Imagine CLI。
- 工具只负责保存 manifest、记录 `task_id`、轮询状态、回收下载和失败后恢复。
- 非异步能力，比如 `image gen`、`video kling-v3`、`auth`、`update`，仍然直接使用官方 `imagine`。

这样做是为了避免封装层挡住官方新功能。Imagine CLI 会持续更新，官方 CLI 是能力事实源，封装层只管异步生产工作流。

## PowerShell 标准命令

从仓库根目录运行。`--output` 和 `--manifest` 属于封装层；其他视频生成参数会转给官方 `imagine video submit`。

```powershell
.\tools\imagine-video-async\video-async.ps1 submit `
  --output "bluespace/outputs/blue_space_bridge_0421/shots/s020_n02_olda_drift_midwide/videos/s020_example_sd2_1080p_v001.mp4" `
  --manifest "bluespace/outputs/blue_space_bridge_0421/shots/s020_n02_olda_drift_midwide/work/example_i2v/s020_example_sd2_1080p_v001.manifest.json" `
  --model sd2 `
  --prompt "camera slowly pushes in, restrained cinematic motion" `
  --allow-short-prompt `
  --first-frame "bluespace/outputs/blue_space_bridge_0421/shots/s020_n02_olda_drift_midwide/work/example_i2v/start.png" `
  --last-frame "bluespace/outputs/blue_space_bridge_0421/shots/s020_n02_olda_drift_midwide/work/example_i2v/end.png" `
  --resolution 1080p `
  --duration 5 `
  --ratio 16:9 `
  --no-generate-audio
```

如果官方 CLI 后续新增普通参数，通常也可以直接写在同一条命令里：

```powershell
.\tools\imagine-video-async\video-async.ps1 submit `
  --output "path/to/out.mp4" `
  --manifest "path/to/job.manifest.json" `
  --model sd2 `
  --prompt "..." `
  --first-frame "path/to/start.png" `
  --new-official-flag "new value"
```

## 严格透传模式

如果新增参数很复杂，或者担心 PowerShell 对引号、布尔开关、多值参数的解析影响官方语义，用 JSON 数组文件。数组里的每一项就是传给 `imagine video submit` 的一个 argv token。

正式 `sd2` 提交仍必须显式钉住 `--model`、`--resolution`、`--duration`、`--ratio` 和音频行为。透传参数缺少这些生产钉子时，`video-async` 会拒绝提交；只有做诊断时才用 `--allow-unsafe-submit-defaults` 绕过。

`submit-args.json`:

```json
[
  "--model",
  "sd2",
  "--prompt",
  "camera slowly pushes in, restrained cinematic motion",
  "--first-frame",
  "path/to/start.png",
  "--resolution",
  "1080p",
  "--duration",
  "5",
  "--ratio",
  "16:9",
  "--no-generate-audio",
  "--new-official-flag",
  "new value"
]
```

运行：

```powershell
.\tools\imagine-video-async\video-async.ps1 submit `
  --output "path/to/out.mp4" `
  --manifest "path/to/job.manifest.json" `
  --submit-args-file "path/to/submit-args.json"
```

## prompt 文件

复杂 prompt 建议放文件里，避免 PowerShell 引号和特殊字符问题。封装层会读取 `--prompt-file`，再转成官方 `--prompt`。

正式生产默认启用 prompt 审计：少于 400 字符的短 prompt 会被拒绝，避免后台只收到一句通用 i2v 指令却进入生产账本。快速连通性测试可以显式加 `--allow-short-prompt`；正式镜头应使用 `--prompt-file`，并写清 shot id、画面锚点、运动边界、负面约束和剪辑用途。

Windows 注意：当前官方 CLI 只有 `--prompt`，没有原生 `--prompt-file`。本封装会把 prompt 文件读出来再传给官方 `--prompt`。如果这条链路经过 `.cmd/cmd.exe`，多行 prompt 可能被截断，后续 `--duration`、`--ratio`、`--no-generate-audio` 等参数也可能回到默认值。现在 `video-async` 在 Windows 上会优先直接用 Node 执行 Imagine CLI 的 JS 入口，并且拒绝 fallback 到 `cmd.exe` shim；`doctor` 里应看到 `transport: direct-node-imagine-cli`。`tools/imagine-cli-healthcheck/check.ps1 --imagine-bin C:\workspace\Trae\nodejs\imagine.cmd --argv-canary` 如果只显示 `cmd_shell` 失败、`direct_node` 通过，说明裸 `.cmd` 不可信，但当前封装路径可以继续用；如果 direct node 也失败，改用直接 JS/API JSON payload。

```powershell
.\tools\imagine-video-async\video-async.ps1 submit `
  --output "path/to/out.mp4" `
  --manifest "path/to/job.manifest.json" `
  --prompt-file "path/to/prompt.txt" `
  --model sd2 `
  --first-frame "path/to/start.png" `
  --resolution 1080p `
  --duration 5 `
  --ratio 16:9 `
  --no-generate-audio
```

## 查看状态

```powershell
.\tools\imagine-video-async\video-async.ps1 status `
  --manifest "path/to/job.manifest.json"
```

需要看流式进度时：

```powershell
.\tools\imagine-video-async\video-async.ps1 status `
  --manifest "path/to/job.manifest.json" `
  --stream
```

## 回收下载

```powershell
.\tools\imagine-video-async\video-async.ps1 fetch `
  --manifest "path/to/job.manifest.json"
```

`fetch` 默认使用 `--skip-if-exists`，可以安全重复运行。如果需要覆盖已有输出，显式加：

```powershell
--overwrite
```

`fetch` 下载后会用 `ffprobe` 检查实际媒体：如果请求的是 `1080p` 但文件低于 1080 高度、请求 `16:9` 但实际比例不匹配、请求 `--no-generate-audio` 但文件仍有音轨、实际时长明显超过请求时长，或 `ffprobe` 本身不可用/探测失败，manifest 会标为 `fetched_with_mismatch` 并返回失败。确实只是做平台行为测试时，可以显式加 `--allow-media-mismatch`；正式生产不要绕过。

遇到 `error: download failed: fetch failed` 时，不要重新 submit。只要 manifest 里已经有 `task_id`，就反复运行 `fetch --manifest ...`，直到网络链路恢复。

## 一条命令跑完

`run` 会 submit、轮询、fetch。如果下载阶段失败，manifest 已经保存 `task_id`，下次重复同一条命令会跳过 submit，继续 status/fetch。

```powershell
.\tools\imagine-video-async\video-async.ps1 run `
  --output "path/to/out.mp4" `
  --manifest "path/to/job.manifest.json" `
  --timeout-minutes 20 `
  --poll-seconds 20 `
  --model sd2 `
  --prompt "camera slowly pushes in" `
  --allow-short-prompt `
  --first-frame "path/to/start.png" `
  --resolution 1080p `
  --duration 5 `
  --ratio 16:9 `
  --no-generate-audio
```

正式批量生产仍建议优先用 `submit`，等一组任务都提交完后再统一 `status` / `fetch`。

## CLI 更新后的检查

每次运行 `imagine update` 或安装新版本后，先跑：

```powershell
.\tools\imagine-video-async\video-async.ps1 doctor
.\tools\imagine-cli-healthcheck\check.ps1 --imagine-bin C:\workspace\Trae\nodejs\imagine.cmd --argv-canary
```

`doctor` 不会提交真实任务，只会读取：

- `imagine --version`
- `imagine video submit --help`
- `imagine task status --help`
- `imagine task fetch --help`
- `imagine video kling-v3 --help`

如果 `video submit`、`task status` 或 `task fetch` 的 stdout 结构发生变化，比如不再返回 `task_id`，这个封装层才需要跟着调整。单纯新增官方参数时，优先直接传参或使用 `--submit-args-file`，不需要改封装。

如果 `argv-canary` 只有 `cmd_shell` 失败而 `direct_node` 通过，并且 `video-async.ps1 doctor` 显示 `direct-node-imagine-cli`，说明裸 `.cmd` 路径不可信，但封装层已绕开它；如果 direct node 也失败，暂停 `--prompt-file` 正式视频提交，不要靠 manifest 里的本地 prompt 判断后台真实收到的内容，先切回直接 JS/API JSON payload，或等待官方 CLI 提供可验证的原生 prompt-file 入口。

## 兼容入口

旧入口仍保留：

```powershell
.\tools\imagine-video-async\i2v.ps1 ...
```

新文档统一写 `video-async.ps1`，避免误解为只能做首帧图生视频。
