# Story Engine 命名清理阶段 1 记录

日期：2026-06-29

范围：迁移后低风险清理。

## 已执行

- 建立实际执行表：`docs/migration/20260629_story-engine_naming-cleanup-table.md`。
- 建立工具索引：`projects/story-engine/_pipeline/tool-index.json`。
- 删除两个可复现 Python 缓存目录：
  - `projects/story-engine/tools/scripts/__pycache__/`
  - `projects/story-engine/曲影番外二/__pycache__/`
- 归档 5 个硬编码旧路径的一次性脚本到 `projects/story-engine/trash/scripts/20260629_migration-legacy/`。

## 未执行

- 未删除、移动或重命名正文。
- 未移动或重命名人物卡。
- 未处理发布稿和 Google Docs 同步稿。
- 未清理 `.story-history/`、`.story-canvas-drafts/` 或 `*.story.json`。
- 旧项目目录已在后续步骤标记为历史归档；旧 Story Canvas 工具目录已降级为兼容包装器。

## 已归档脚本

以下脚本已移出活跃目录：

- `projects/story-engine/trash/scripts/20260629_migration-legacy/generate_report.py`
- `projects/story-engine/trash/scripts/20260629_migration-legacy/modify_ch2_questionnaire.py`
- `projects/story-engine/trash/scripts/20260629_migration-legacy/modify_ch3_long_marathon.py`
- `projects/story-engine/trash/scripts/20260629_migration-legacy/modify_ch3_marathon.py`
- `projects/story-engine/trash/scripts/20260629_migration-legacy/recount.py`

这些脚本含旧项目路径或单轮写回逻辑，不作为新任务默认工具。如需复用，先参数化并改为 Story Engine 新路径。

## 验证

- 两个 `__pycache__/` 清理目标删除后 `Test-Path` 均为 `False`。
- 5 个一次性脚本源路径删除后 `Test-Path` 均为 `False`，归档路径均为 `True`。
- Story Canvas 草稿和历史目录仍保留。
- `_pipeline/tool-index.json` 可被 Node 正常解析。
- 活跃 Python 脚本中未命中旧 `projects/pixiv novel` 路径。
- `projects/story-canvas/app/server.mjs`、`projects/story-canvas/app/build-canvas-import.mjs` 和 `projects/story-engine/tools/google-docs-sync/upload-markdown-to-drive-doc.js` 均通过 `node --check`。
- `http://127.0.0.1:4307/api/health` 返回 `ok: true`，默认根仍为 `projects/story-engine/人偶番外/主干`。
