# Story Engine

Story Engine 是 KVA 的小说生成层项目，负责作品事实、生成规则、prompt、范文学习、审稿和生产账本。

当前它已完成从旧小说项目到 Story Engine 的生成层迁移：规则、prompt、refs 索引/analysis、review、生成账本入口、辅助工具和四个已写作品目录都以本项目为默认入口。旧 `projects/pixiv novel/` 仅作为历史归档/回滚入口。

## 入口

- `AGENTS.md`：项目级规则和读取顺序。
- `PROJECT.md`：项目记忆、迁移状态和待办。
- `WORKFLOW.md`：生成层工作流。
- `story-engine_project-brief.html`：给人类看的静态纲要。
- `_pipeline/`：上下文路由和规则路由。
- `docs/rules/`：生成层规则和 Story Canvas 桥接契约。
- `_ledger/`：生产账本和迁移记录索引。
- `prompts/`：可复用 prompt。
- `refs/`：范文学习和参考资料入口。
- `outputs/`：生成与整理输出。
- `review/`：审稿记录。

## 当前边界

- 新任务默认写入 `projects/story-engine/`，不再写入旧项目目录。
- 旧 `projects/pixiv novel/` 只保留历史对照、回滚和人工核查用途。
- 已完成迁移后的低风险命名清理；后续更大规模改名仍需按迁移表分批执行。
- 不批量改写历史 iteration 账本中的旧路径记录。
- Story Canvas 网页实现由 `projects/story-canvas/` 维护，不在本项目内维护。
