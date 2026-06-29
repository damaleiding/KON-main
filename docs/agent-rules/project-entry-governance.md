# 项目入口文件治理规则

## 目标

本规则约束每个 `projects/<project-name>/` 下的 `AGENTS.md`、`PROJECT.md`、`WORKFLOW.md` 如何读写和修改，避免项目入口文件逐渐混入具体写作细则、单轮生产状态、prompt 长文、规避词表和临时审稿意见。

核心原则：入口轻量、规则分层、事实单源、修改有路由。

## 三个入口文件职责

| 文件 | 允许保存 | 禁止保存 |
| --- | --- | --- |
| `AGENTS.md` | 项目级硬规则、目录职责、规则读取路由、长期安全/同步边界 | 章节正文、prompt 长文、单轮审稿记录、临时风格反馈、作品级长词表 |
| `PROJECT.md` | 项目定位、稳定事实、作品范围、关键入口、当前状态入口、待办索引 | 生产日报、单章修改细节、候选稿全文、过期分支结论 |
| `WORKFLOW.md` | 启动顺序、任务分类、读取顺序、检查清单、生成前后收口动作 | 具体章节怎么写、完整风格词表、质量评分细则全文、正文片段库 |

入口文件可以引用规则路径，但不得把被引用规则全文复制进来。

## 规则应该写到哪里

| 内容类型 | 推荐落点 |
| --- | --- |
| 跨项目小说写作硬规则 | `docs/agent-rules/novel-writing.md` |
| 三章剧情单元、主线/分线和章节长度规划 | `docs/agent-rules/plot-and-chapter-planning.md` 或项目 `docs/rules/` |
| 无限画布、章节节点、reroll 和角色变化表 | `docs/agent-rules/story-canvas.md` 或项目 `_ledger/story-canvas/` |
| 章节拆分、合并、命名和首尾衔接规则 | `docs/agent-rules/chapter-governance.md` 或项目 `docs/rules/` |
| 文风校验、表达黑名单、规避词表治理 | `docs/agent-rules/style-and-avoidance.md` 与作品级 `设定/风格指南.md` |
| 文本整理、目录归类、原文/主干/分支/发布边界 | `docs/agent-rules/text-organization.md` 与项目 `docs/current-layout.md` |
| 具体作品设定、角色、时间线、伏笔 | 作品内 `设定/`、`人物卡/`、`伏笔表.md`、`当前状态.md` |
| Prompt、模型提交词和复用配方 | 项目 `prompts/` 或输出旁 `_prompts/` |
| 生产账本、采纳/否决、版本流转事实 | 项目 `_ledger/`、`review/`、作品局部账本 |
| 工具用法、输入输出、同步边界 | `tools/README.md`、工具旁 README 或项目 `docs/tools/` |

如果项目尚未建立对应目录，先新增目录 README 或索引文件，再写入具体规则。

## 修改流程

1. 先判断本次内容是入口导航、稳定项目记忆、执行流程、写作规则、章节规则、风格词表、文本整理规则，还是账本事实。
2. 优先修改真正事实源，不把同一条细则复制到多个入口文件。
3. 修改入口文件时，只补路径、路由、读取顺序或硬约束摘要。
4. 修改项目规则或目录结构时，同步检查该项目的 `PROJECT.md`、`WORKFLOW.md`、`<project-name>_project-brief.html`、相关 `README.md` 和 `_pipeline/` 索引。
5. 如果迁移时遇到重复或冲突规则，建立 `docs/migration/` 或 `docs/reports/` 下的迁移/冲突清单，不静默删除。

## 判断清单

- 写入 `AGENTS.md` 前，确认它是不是长期硬约束或路由。
- 写入 `PROJECT.md` 前，确认它是不是稳定项目记忆或入口。
- 写入 `WORKFLOW.md` 前，确认它是不是执行顺序或检查动作。
- 写入作品 `设定/` 前，确认它是不是该作品事实，而不是跨项目方法论。
- 写入 `_ledger/` 前，确认它是不是已经发生的生产事实、筛选结论或版本流转。

不能归类时，先建立轻量索引文件说明用途，再放入更具体的目录。
