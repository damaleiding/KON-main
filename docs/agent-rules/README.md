# Agent Rules Index

这个目录保存 KVA 的高优先级扩展规则。根 `AGENTS.md` 只保留最核心、最通用、最必要的内容；具体任务需要细则时，Agent 应按主题读取本目录文件。

## 读取顺序

1. 永远先读根 `AGENTS.md`。
2. 如果任务属于具体项目，再读项目 `AGENTS.md`、`PROJECT.md`、`WORKFLOW.md` 和 `_pipeline/`。
3. 如果需要细则，再读取本目录对应文件。

## 文件说明

- `project-structure.md`：目录、项目入口、HTML 项目纲要、索引和账本职责。
- `ai-production.md`：AI 写作、prompt、参考资料、审稿和生产记录。
- `subagent-collaboration.md`：Claude / DeepSeek 子 Agent 使用规则。
- `git-security.md`：Git 同步边界、安全隐私、媒体和临时输出处理。
- `writing-and-modification.md`：语言命名、修改联动、新项目和新工具规则。
