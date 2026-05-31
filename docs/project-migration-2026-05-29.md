# 项目迁入记录 2026-05-29

## 概述

本次将 `projects/` 下现有的 `A1video` 与 `Imagebatch` 按 KVA 根目录规则整理为标准项目结构。

整理原则：

- 不删除原始资料。
- 大型媒体和旧输出保留在项目内，但归入 `refs/`、`outputs/` 或 `trash/`。
- 规则、项目记忆、工作流、路由索引和账本目录补齐。
- 运行入口配置尽量不破坏，`Imagebatch` 的 `package.json` 和 `package-lock.json` 暂留项目根目录；本机 `.env` 移入 `trash/local-config/`，不作为事实层。

## A1video

已补齐：

- `AGENTS.md`
- `PROJECT.md`
- `WORKFLOW.md`
- `_pipeline/context-routes.json`
- `_pipeline/tool-index.json`
- `_pipeline/skill-index.json`
- `_ledger/README.md`

主要迁移：

- `html_reports/` -> `review/html_reports/`
- `video_jobs/` -> `outputs/video_jobs/`
- `video_outputs/` -> `outputs/video_outputs/`
- `input image/` -> `refs/input_images/`
- `20260518新资料/` -> `refs/source-packages/20260518新资料/`
- 宗门资料目录 -> `refs/raw/`
- `log/` -> `trash/log/`
- `__pycache__/` -> `trash/cache/__pycache__/`
- `.tmp/` -> `trash/tmp/.tmp/`
- 根目录 Python 脚本 -> `tools/`
- `manifest.json` -> `_ledger/media-manifest.legacy.json`
- debate / audit / validation 报告 -> `docs/reports/`
- docx 与 extracted txt 来源资料 -> `docs/source/`
- 视频词条范本 -> `prompts/templates/`

## Imagebatch

已补齐：

- `AGENTS.md`
- `PROJECT.md`
- `WORKFLOW.md`
- `_pipeline/context-routes.json`
- `_pipeline/tool-index.json`
- `_pipeline/skill-index.json`
- `_ledger/README.md`

主要迁移：

- `archived_runs/` -> `outputs/archived_runs/`
- `output_images/` -> `outputs/output_images/`
- `round_inputs/` -> `outputs/intermediate/round_inputs/`
- `secondary_input_images/` -> `outputs/intermediate/secondary_input_images/`
- `input_images/` -> `refs/input_images/`
- `references/` -> `refs/references/`
- `tables/` -> `prompts/tables/`
- `dashboard.html` -> `review/dashboard.html`
- `viewer.html` -> `review/viewer.html`
- `debug-image-output-option.md` -> `docs/debug-image-output-option.md`
- `doc_content.xml` -> `docs/source/doc_content.xml`
- `harness/` -> `tools/harness/`
- `tests/` -> `tools/tests/`
- 根目录脚本文件 -> `tools/`
- `tmp/` -> `trash/tmp/`
- `.dbg/` -> `trash/.dbg/`
- `node_modules/` -> `trash/node_modules/`
- `shared-batch-image-tool-share.zip` -> `trash/shared-batch-image-tool-share.zip`

## 后续建议

- 为两个项目补 `_ledger/production-ledger.jsonl`，把关键旧输出纳入事实层。
- 为 `refs/` 补参考图索引，区分 selected、candidate、deprecated。
- 为 `prompts/` 补 prompt index，建立 prompt 与输出资产的关系。
- 为 `outputs/` 中的正式资产补 review 结论，避免旧素材无法判断是否可用。

