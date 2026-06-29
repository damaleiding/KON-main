# Story Engine 上下文路由

## 路由原则

- 不默认读取旧项目全部正文。
- 先判断任务对象，再读取最小必要文件。
- 迁移任务先读工作区迁移设计文档。
- Story Canvas 请求只作为桥接输入，不读取或修改工具实现。

## 通用入口

- 项目规则：`AGENTS.md`
- 项目记忆：`PROJECT.md`
- 工作流：`WORKFLOW.md`
- 规则路由：`_pipeline/rule-router.md`
- 工具索引：`_pipeline/tool-index.json`
- 当前布局：`docs/current-layout.md`
- 规则索引：`docs/rules/README.md`
- Canvas 桥接契约：`docs/rules/canvas-bridge-contract.md`

## 任务路由

- 迁移设计：读 `docs/migration/20260629_story-engine_story-canvas_split-design.md`、本项目入口和旧项目归档提示。
- 命名清理：读 `docs/migration/20260629_story-engine_naming-cleanup-plan.md` 和 `docs/migration/20260629_story-engine_naming-cleanup-table.md`，再按批次读取目标路径。
- 生成规则维护：读本项目 `docs/rules/README.md` 和对应规则文件；旧项目规则只作历史对照。
- Prompt 迁移或生成：读根 `docs/agent-rules/prompt-generation.md` 和本项目 `prompts/README.md`。
- 范文学习维护：读本项目 `refs/范文参考/README.md` 和 `all-reference-learning-index.md`。
- Story Canvas 桥接：读 `docs/rules/canvas-bridge-contract.md`、请求中的 sidecar/ledger 路径和目标作品必要事实。
- 工具维护：读 `_pipeline/tool-index.json`、目标工具 README 和对应 workflow；发布或上传动作必须等用户明确要求。
- 作品正文任务：优先读取 `projects/story-engine/<作品名>/`；旧项目目录仅作历史归档/回滚参照。
