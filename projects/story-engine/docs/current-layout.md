# Story Engine 当前目录映射

## 项目级目录

| 目录 | 用途 | 当前状态 |
| --- | --- | --- |
| `docs/` | 项目说明、规则、桥接契约和迁移记录 | 已建立骨架 |
| `docs/rules/` | 生成层规则和 Story Canvas 桥接契约 | 已建立骨架 |
| `_pipeline/` | 上下文路由、规则路由、工具索引和工作流 | 已建立骨架，已补 `tool-index.json` |
| `_ledger/` | 生产账本、迁移记录和版本流转索引 | 已建立骨架 |
| `refs/` | 范文学习和参考资料入口 | 已迁入索引和 analysis，未批量复制 `licensed-texts/` |
| `prompts/` | 可复用 prompt | 已迁入 |
| `outputs/` | 生成、改写和整理输出 | 空目录 |
| `review/` | 审稿记录、迁移复核报告和工具检查记录 | 已迁入历史 review，并新增迁移复核报告 |
| `trash/` | 废弃材料 | 已归档迁移旧脚本；不作为默认上下文 |
| `_tmp/` | 临时文件 | 空目录 |
| `tools/` | 项目级生成辅助脚本和发布同步工具 | 已迁入，入口见 `_pipeline/tool-index.json` |

## 外部依赖

- 迁移设计：`docs/migration/20260629_story-engine_story-canvas_split-design.md`。
- 旧生成项目：历史归档/回滚入口。
- Story Canvas 项目：`projects/story-canvas/`。

## 已迁入作品

| 作品 | 默认路径 | 历史归档/回滚入口 |
| --- | --- | --- |
| 曲影番外二 | `projects/story-engine/曲影番外二/` | 旧项目同名目录 |
| 人偶番外 | `projects/story-engine/人偶番外/` | 旧项目同名目录 |
| 曲影 | `projects/story-engine/曲影/` | 旧项目同名目录 |
| 柠檬 | `projects/story-engine/柠檬/` | 旧项目同名目录 |

## 仍需清理

- 一次性脚本已初步归档；如需复用，需从 `trash/scripts/20260629_migration-legacy/` 参数化后迁入工具目录。
- 更大规模作品内部命名调整，需另建批次迁移表。
- 旧项目目录保留为历史归档/回滚入口，不作为默认上下文。
- `refs/范文参考/**/licensed-texts/` 原文目录未批量迁入。
