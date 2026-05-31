---
description: Bluespace 结构化生产账本工具。
---

# Production Ledger Tool

这个工具把生图、生视频、重试、精选和迁移信息记录成 JSONL。它不替代 shotlist；shotlist 仍然是镜头定义的唯一真相，ledger 只记录一次次生产动作和资产结果。

## 常用命令

在项目根目录运行：

Windows:

```powershell
.\tools\project-harness\doctor.ps1
.\bluespace\tools\production-ledger\ledger.ps1 init
.\bluespace\tools\production-ledger\ledger.ps1 import-video-batches
.\bluespace\tools\production-ledger\ledger.ps1 summary
.\bluespace\tools\production-ledger\ledger.ps1 validate
```

macOS:

```bash
./tools/project-harness/doctor.sh
./bluespace/tools/production-ledger/ledger.sh init
./bluespace/tools/production-ledger/ledger.sh import-video-batches
./bluespace/tools/production-ledger/ledger.sh summary
./bluespace/tools/production-ledger/ledger.sh validate
```

默认账本位置：

```text
bluespace/outputs/blue_space_bridge_0421/_ledger/production-ledger.jsonl
```

## 手动追加一条记录

```powershell
.\bluespace\tools\production-ledger\ledger.ps1 add `
  --shot-id s030 `
  --title "面罩眼睛猛醒 v005" `
  --output "bluespace/outputs/blue_space_bridge_0421/shots/s030_n03_visor_breath_eye_awake/videos/s030_eye_awake_video_sd2_1080p_noaudio_v005.mp4" `
  --task-id "<task_id>" `
  --model sd2 `
  --asset-kind video `
  --resolution 1080p `
  --aspect-ratio "16:9" `
  --review needs_review `
  --note "等待检查眼睑表演和裂纹稳定性"
```

## 设计原则

- 每行只记录一个资产，方便追加、diff 和脚本读取。
- 能确定的字段写结构化值；不能确定的 prompt、参考图、命令先留空，不编造。
- 新生成资产必须有 `generation.prompt` 或 `generation.prompt_file`；参考图、settings、命令不能替代 prompt。
- `_ledger/prompt-index.json` 是 prompt 快速索引，使用 `ledger.ps1 prompt-index` 从 production ledger 生成。
- `declared_output_path` 保留老文档里的原始路径，`output_path` 尽量解析到当前真实落盘路径。
- `shot_id` 可以为空；老 storyboard 阶段的 `R4-11`、`B03` 等编号保留到 `legacy_id`。
- `review.verdict` 记录人工判断，比如 `needs_review`、`selected`、`rejected`、`reference_only`。
- Git 是 harness 部署的硬性前置条件；生产账本交付前应先让 `tools/project-harness/doctor.ps1` 通过。

## 低 token 查询

查媒体时优先用 `find`，不要把完整 JSONL 读进聊天：

```powershell
.\bluespace\tools\production-ledger\ledger.ps1 find --shot-id s040 --kind video --limit 10
.\bluespace\tools\production-ledger\ledger.ps1 find --shot-id s040 --role keyframe --prompt-status prompt_file --limit 10
.\bluespace\tools\production-ledger\ledger.ps1 find --shot-id s040 --exists missing --limit 10
.\bluespace\tools\production-ledger\ledger.ps1 recipe --entry-id <entry_id>
```

`find` 默认只输出紧凑字段：entry、shot、review、kind、role、model、prompt 状态和 output path。需要完整生成配方时，再用单条 `recipe` 查询。
