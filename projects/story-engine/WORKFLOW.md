# Story Engine 工作流

## 启动流程

1. 读取 `AGENTS.md`、`PROJECT.md`、`WORKFLOW.md`、`_pipeline/context-routes.md` 和 `_pipeline/rule-router.md`。
2. 明确任务类型：迁移设计、规则整理、prompt 生成/修改、范文学习、章节规划、正文生成、审稿检查、账本整理或发布整理。
3. 按 `_pipeline/context-routes.md` 选择最小上下文。
4. 涉及迁移时，先读 `docs/migration/20260629_story-engine_story-canvas_split-design.md`。
5. 涉及 Story Canvas 请求时，只读取桥接字段和目标作品必要事实，不读取或修改 Story Canvas 工具实现。
6. 涉及范文技法用于生成时，读取 `docs/rules/reference-learning-application.md`；具体技法、词条和作品级偏好不写入 `AGENTS.md`。

## 常见任务

- 迁移整理：先更新迁移表和状态，不移动正文，除非已有明确迁移表和用户确认。
- 生成规则整理：修改 `docs/rules/`，并同步规则索引和路由。
- Prompt 生成/修改：按根 `docs/agent-rules/prompt-generation.md` 记录目标、模型、输入参考、限制、输出格式和版本差异。
- 范文学习：只保存结构分析和可迁移方法，不复制长原文；范文技法应用规则落到 `docs/rules/reference-learning-application.md`。
- 章节规划：读取目标作品状态、故事圣经、风格指南、伏笔表和必要人物卡。
- 正文生成：输出到 `outputs/`、分支或用户指定路径；不直接覆盖主干。
- 审稿检查：输出到 `review/`，重要结论登记到 `_ledger/`。
- Story Canvas 桥接：读取 canvas 请求后，由 Story Engine 组织 prompt 和候选生成；候选采纳仍需用户确认。

## 收口要求

- 正文修改后使用工作区 `tools/word-count/` 更新字数统计。
- 重要 prompt 保存到 `prompts/` 或输出旁 `_prompts/`。
- 重要改写、合并、发布和审稿结论写入 `_ledger/` 或 `review/`。
- 迁移动作必须更新迁移文档、当前布局和必要索引。
