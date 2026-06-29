# 小说协作框架拆分说明

## 来源与目标

本框架吸收 `C:\Trae\KVA-main-0.1.17` 的工程经验：根规则轻量、细则分层、项目入口治理、事实层可追踪、模板可复用。当前工作区是文字类小说创作工程，因此规则重心从媒体资产生产调整为正文、设定、章节、文风、规避词表和版本流转。

## 五层事实结构

1. 工作区层：`AGENTS.md`、`README.md`、`docs/agent-rules/`、`tools/`、`templates/`，保存跨项目硬规则和可复用方法。
2. 项目层：`projects/<project>/AGENTS.md`、`PROJECT.md`、`WORKFLOW.md`、`_pipeline/`，保存入口、路由和执行流程。
3. 作品层：作品内 `设定/`、`主干/`、`分支/`、`发布/`，保存具体小说事实。
4. 生产层：`prompts/`、`outputs/`、`review/`、`_ledger/`，保存生成配方、候选结果、审稿和筛选结论。
5. 临时层：`_tmp/`、`trash/`、本地缓存和未筛选输出，不作为默认事实源。

## 规则分层

- `AGENTS.md`：只放最高优先级核心规则和扩展规则索引。
- `docs/agent-rules/project-entry-governance.md`：规定项目入口文件能写什么、不能写什么。
- `docs/agent-rules/novel-writing.md`：跨项目小说写作硬规则。
- `docs/agent-rules/chapter-governance.md`：章节拆分、命名、合并和首尾衔接。
- `docs/agent-rules/style-and-avoidance.md`：文风校验和规避词表治理。
- `docs/agent-rules/text-organization.md`：文本目录、版本、备份、发布和字数统计边界。
- 项目 `docs/rules/`：保存项目或作品级细则，不把长规则塞回入口文件。

## 默认读取路线

```text
根 AGENTS.md
  -> 根 README.md
  -> 目标项目 AGENTS.md / PROJECT.md / WORKFLOW.md
  -> 项目 _pipeline/context-routes.md / rule-router.md
  -> 只读取目标作品、目标章节和任务需要的专项规则
```

## 章节质量门

每次生成、润色、拆分、合并或发布整理后，至少检查：

- 相邻章节首尾是否串联。
- 文风是否符合目标作品风格指南。
- 是否命中作品规避词表。
- 角色、设定、时间线和伏笔是否冲突。
- 字数统计、文件命名和版本记录是否一致。

## 模板化方向

`templates/project-template/` 提供新小说项目骨架。新增项目时应复制模板，再补项目名、作品入口、规则路由和初始账本，而不是临时散放正文和设定文件。
