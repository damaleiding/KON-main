# Pixiv Novel 规则路由

## 目的

本文件用于把任务路由到最小规则集合，避免每次把所有写作规则、风格规则和词表都读入上下文。

## 默认入口

1. `AGENTS.md`
2. `PROJECT.md`
3. `WORKFLOW.md`
4. `_pipeline/context-routes.md`
5. 本文件

## 按任务读取

| 任务 | 必读规则 | 按需读取 |
| --- | --- | --- |
| 规则修正 | 根 `project-entry-governance.md`、本文件 | `docs/rules/README.md` |
| 工具层/生成层边界 | `docs/rules/layer-boundaries.md`、本文件 | `docs/rules/story-canvas.md`、目标工具 README |
| 故事画布/章节节点 | 根 `story-canvas.md`、`_pipeline/story-canvas-workflow.md` | `_ledger/story-canvas/`、目标作品当前状态、人物卡 |
| 三章剧情规划 | 根 `plot-and-chapter-planning.md`、`_pipeline/chapter-planning-workflow.md`、`docs/rules/longform-generation.md` | 目标作品当前状态、故事圣经、风格指南、伏笔表、人物卡 |
| 章节续写/润色 | 根 `novel-writing.md`、`chapter-governance.md`、`style-and-avoidance.md`、`docs/rules/longform-generation.md` | 目标作品风格指南、伏笔表、人物卡 |
| 首尾衔接检查 | `_pipeline/chapter-continuity-workflow.md`、`docs/rules/longform-generation.md` | 相邻章节、章节索引、伏笔表 |
| 文风检查 | `_pipeline/style-quality-check-workflow.md` | 作品 `设定/风格指南.md`、项目 `docs/rules/` |
| 规避词表维护或扫描 | `_pipeline/avoidance-lexicon-workflow.md` | 作品级词表、目标章节 |
| 路径结构/命名规则 | `docs/rules/path-and-naming.md`、`_pipeline/text-organization-workflow.md` | `docs/current-layout.md`、迁移表 |
| 文本整理/迁移 | `docs/rules/path-and-naming.md`、`_pipeline/text-organization-workflow.md`、`_pipeline/text-version-backup-workflow.md` | `docs/current-layout.md`、迁移表 |
| 章节自检 | `_pipeline/chapter-self-check-workflow.md` | 上述专项工作流中被触发的部分 |
| 发布整理 | 根 `text-organization.md`、项目发布流程 | 发布目录、Google Docs 工作流 |

## 落点原则

- 跨项目规则写入根 `docs/agent-rules/`。
- 项目级规则写入 `projects/pixiv novel/docs/rules/`。
- 工具层与生成层边界写入 `projects/pixiv novel/docs/rules/layer-boundaries.md`；不要把生成规则全文塞进工具 README。
- 路径结构、文件命名、生成落点和同步清单写入 `projects/pixiv novel/docs/rules/path-and-naming.md`。
- 故事画布 schema、节点索引和 reroll 记录写入 `_ledger/story-canvas/`。
- 作品事实写入对应作品 `设定/`。
- 单轮生产事实写入 `_ledger/` 或 `review/`。
- Prompt 写入 `prompts/` 或输出旁 `_prompts/`。
