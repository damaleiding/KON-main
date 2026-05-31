# 项目结构规则

## 顶层目录职责

- `docs/`：工作区级长期文档、协作说明、同步规则、架构说明、迁移记录和高优先级扩展规则。
- `methods/`：跨项目写作方法论，例如长篇规划、章节拆分、润色流程、分支合并、prompt 审稿规则。
- `projects/`：具体小说创作项目或作品集。每个项目应有自己的规则、设定、正文、分支、账本和工作流。
- `tools/`：工作区级可复用工具，例如索引、账本、文本拆分、批量替换、发布整理脚本。
- `references/`：跨项目参考资料入口。项目专属参考资料优先放进对应项目的 `refs/`。
- `templates/`：新项目模板、章节模板、角色卡模板、prompt 模板、账本 schema、交接模板。

## 项目目录职责

每个项目建议使用：

```text
projects/<project-name>/
  AGENTS.md
  PROJECT.md
  WORKFLOW.md
  <project-name>_project-brief.html
  _pipeline/
  _ledger/
  docs/
  refs/
  prompts/
  outputs/
  review/
  trash/
```

- `AGENTS.md`：项目级规则，只放对该项目长期有效的约束。
- `PROJECT.md`：项目记忆，包括作品范围、世界观、目标风格、角色锚点、连续性问题和当前状态。
- `WORKFLOW.md`：项目工作流，包括启动方式、写作节奏、审稿模式、收口动作和交接格式。
- `<project-name>_project-brief.html`：给人类阅读的静态 HTML 项目纲要，必须和 `PROJECT.md` 同级。
- `_pipeline/`：项目级路由、工具索引、技能索引和上下文索引配置。
- `_ledger/`：生产账本、prompt 索引、审稿决策、版本流转和文本版本清单等事实记录。
- `docs/`：项目文档、写作标准、制作记录、问题池和复盘。
- `refs/`：项目参考资料、外部摘录、风格参考和治理索引。
- `prompts/`：可复用 prompt、角色 prompt、风格 prompt、续写 prompt、润色 prompt。
- `outputs/`：生成、改写、导出或发布前整理结果。
- `review/`：审稿记录、候选对比、分支采纳结论和可视化看板导出。
- `trash/`：失败、废弃或临时文本，不作为默认参考源。

## 人类项目纲要

- 每个项目必须同时维护 Agent 阅读入口和人类阅读入口。
- Agent 阅读入口包括 `AGENTS.md`、`PROJECT.md`、`WORKFLOW.md` 和 `_pipeline/`。
- 人类阅读入口固定为项目根目录下的 `<project-name>_project-brief.html`。
- 人类项目纲要应避免堆砌脚本细节，重点说明“这是干什么的、有什么文本和设定、从哪里开始、当前状态、下一步建议”。
- 项目的目标、作用、目录结构、关键文本状态或工作流发生明显变化时，必须同步更新 `<project-name>_project-brief.html`。
