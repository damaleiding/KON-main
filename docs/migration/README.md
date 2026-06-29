# Migration Docs

本目录保存工作区级项目拆分、项目改名、跨项目迁移和目录边界调整设计文档。

规则：

- 先写迁移设计文档和迁移表，再移动文件。
- 迁移文档必须列出旧路径、新路径、迁移状态、引用风险、兼容策略和回滚方式。
- 未经确认，不移动既有正文、设定、发布稿、账本和工具数据。
- 单个项目内部的小整理可放项目自己的 `docs/`；跨项目或工作区级拆分放本目录。

## 文档索引

- `20260629_story-engine_story-canvas_split-design.md`：Story Engine / Story Canvas 拆分与迁移设计。
- `20260629_story-engine_naming-cleanup-plan.md`：Story Engine 迁移后的命名清理边界、顺序和候选映射。
- `20260629_story-engine_naming-cleanup-table.md`：Story Engine 命名清理的实际批次表和执行状态。
- `20260629_story-engine_story-canvas_completion-report.md`：Story Engine / Story Canvas 迁移完成状态、保留边界和后续维护入口。
