# 文本整理工作流

## 触发场景

- 目录整理、文本归类、正文迁移、章节拆分、合并、发布整理。
- 清理临时文件、移动旧项目管理文件、整理 prompt 或账本。
- 用户要求把旧框架拆出来、建立新项目模板或重排规则层级。

## 必读上下文

1. 项目 `AGENTS.md`、`PROJECT.md`、`WORKFLOW.md`。
2. `_pipeline/context-routes.md`、`_pipeline/rule-router.md`。
3. `docs/rules/path-and-naming.md`。
4. `docs/current-layout.md`。
5. 若涉及正文修改，读取 `_pipeline/text-version-backup-workflow.md`。

## 目录判定

- `原文/`：默认只读。
- `设定/`：稳定事实和作品级规则。
- `主干/`：认可正文。
- `分支/`：实验和替代路线。
- `发布/`：对外整理版本。
- `outputs/`：生成或整理结果。
- `_ledger/`：生产事实和版本流转。
- `review/`：审稿记录和候选对比。
- `_tmp/`：临时脚本和中间产物。

## 生成落点判定

- 新增或修改路径、命名、区域生成规则：写入 `docs/rules/path-and-naming.md`，并同步 `docs/rules/README.md` 与 `_pipeline/rule-router.md`。
- 新增作品入口：写入 `<作品名>/README.md`；同步 `PROJECT.md`、`README.md`、`docs/current-layout.md` 和 `_pipeline/context-routes.md`。
- 新增主干版本：放入 `<作品名>/主干/<版本名>/`；同步作品 README 或 `设定/当前状态.md`。
- 新增分支：放入 `<作品名>/分支/<分支名>/`；同步 `设定/分支记录.md`。
- 新增发布稿：放入 `<作品名>/发布/<发布目标>/`；同步发布清单和来源说明。
- 新增可复用 prompt：放入项目 `prompts/` 或 `<作品名>/prompts/`；写明模型、输入参考、限制条件和用途。
- 新增审稿报告：放入 `review/`；重要结论同步 `_ledger/iteration-ledger.md`。
- 新增临时脚本或中间稿：放入 `_tmp/`；可复用后再迁移到工具目录、`docs/`、`prompts/` 或 `_ledger/`。

## 迁移流程

1. 先生成迁移表，不直接移动正文。
2. 迁移表包含旧路径、目标路径、用途、引用风险、备份状态和回滚方式。
3. 确认后再移动，并同步更新入口、索引、账本或发布说明。
4. 迁移后检查是否有旧路径残留引用。
5. 新路径和文件名必须符合 `docs/rules/path-and-naming.md`；若因兼容旧脚本必须保留例外，需在迁移表中说明原因。

## 清理规则

- 临时文件不进入项目根目录、作品根目录、`主干/`、`设定/` 或 `发布/`。
- 可复用脚本登记到 `_pipeline/tool-index.json` 或上移到工作区 `tools/`。
- 可复用规则沉淀到 `docs/rules/`、`methods/` 或根 `docs/agent-rules/`。
