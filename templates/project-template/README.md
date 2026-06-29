# 小说项目模板

复制本目录作为新小说项目骨架后，先替换项目名、作品范围、入口说明和规则路由。

## 标准入口

- `AGENTS.md`：项目级长期规则和读取路由。
- `PROJECT.md`：项目记忆和稳定事实。
- `WORKFLOW.md`：启动顺序、任务类型、检查清单和收口动作。
- `<project-name>_project-brief.html`：给人类看的静态纲要，需手动创建或从现有项目改写。
- `_pipeline/`：上下文路由和规则路由。
- `_ledger/`：生产账本和版本流转索引。
- `docs/rules/`：项目级章节、文风、规避词和文本整理规则。
- `refs/`：参考资料入口。
- `prompts/`：可复用 prompt。
- `outputs/`：生成和整理输出。
- `review/`：审稿记录。
- `trash/`：废弃材料。

## 使用步骤

1. 复制模板目录到 `projects/<project-name>/`。
2. 替换模板文件中的 `<project-name>`、`<作品名>` 和 `<project-purpose>`。
3. 创建 `<project-name>_project-brief.html`。
4. 补齐作品级 `设定/`、`主干/`、`分支/`、`发布/` 或按项目需要调整。
5. 更新根 README 或项目矩阵。
