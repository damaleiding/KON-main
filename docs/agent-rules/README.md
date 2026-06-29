# Agent Rules Index

这个目录保存 KVA 的高优先级扩展规则。根 `AGENTS.md` 只保留最核心、最通用、最必要的内容；具体任务需要细则时，Agent 应按主题读取本目录文件。

## 读取顺序

1. 永远先读根 `AGENTS.md`。
2. 如果任务属于具体项目，再读项目 `AGENTS.md`、`PROJECT.md`、`WORKFLOW.md` 和 `_pipeline/`。
3. 如果需要细则，再读取本目录对应文件。

## 文件说明

- `project-structure.md`：目录、项目入口、HTML 项目纲要、索引和账本职责。
- `project-entry-governance.md`：项目 `AGENTS.md` / `PROJECT.md` / `WORKFLOW.md` 的职责边界、规则落点和修改流程。
- `ai-production.md`：AI 写作、prompt、参考资料、审稿和生产记录。
- `prompt-generation.md`：Prompt 生成、修改、审稿、保存和段落扩写提示词运行规则。
- `subagent-collaboration.md`：Claude / DeepSeek 子 Agent 使用规则。
- `git-security.md`：Git 同步边界、安全隐私、外部资料和临时输出处理。
- `writing-and-modification.md`：语言命名、修改联动、新项目和新工具规则。
- `novel-writing.md`：小说续写、润色、重写、设定呈现、角色一致性和首尾衔接。
- `plot-and-chapter-planning.md`：三章剧情单元、主线/分线、章节长度和写作前规划。
- `story-canvas.md`：无限画布、章节节点、reroll、角色变化表、10章篇章、50章卷，以及画布工具层与生成层的基础边界。
- `chapter-governance.md`：章节确定、拆分、合并、命名、相邻章节检查和版本流转。
- `style-and-avoidance.md`：文风校验、规避词表、禁用/慎用表达和替换建议治理。
- `text-organization.md`：原文、设定、主干、分支、发布、输出、账本和临时文件边界。

编码、中文文本和流程事故复盘的细则放在 `docs/standards/`；涉及乱码、批量改写、拆章合并或脚本生成时按需读取。
