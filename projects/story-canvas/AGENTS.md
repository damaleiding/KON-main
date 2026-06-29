# Story Canvas 项目规则

## 项目定位

`projects/story-canvas` 是 KVA 的网页工具层项目，用于管理故事画布的前后端、交互设计、sidecar schema、server、历史快照、回滚、测试和工具文档。

本项目从工作区旧工具演进而来。当前已完成工具层迁移，`app/` 是唯一维护实现；旧 `tools/story-canvas/` 仅保留轻量兼容包装器。

## 最高原则

- Story Canvas 是工具层，不维护长篇生成规则、prompt 模板或范文学习结论。
- 工具层只记录用户意见、选区锚点、生成请求、候选状态、sidecar 和历史快照。
- 候选正文不自动进入主干；采纳由 Story Engine 和用户确认。
- 修改网页 UI、server、schema 或工具 README 时，不顺手修改 Story Engine 的生成规则和 prompt。
- 临时文件统一放 `_tmp/`，工具输出放 `outputs/` 或明确的数据目录。

## 读取顺序

1. 先读本文件、`PROJECT.md`、`WORKFLOW.md`、`_pipeline/context-routes.md`。
2. 涉及迁移时，读工作区 `docs/migration/20260629_story-engine_story-canvas_split-design.md`。
3. 涉及工具实现时，优先读 `app/README.md` 和 `app/` 下目标源码文件；旧工具路径只作兼容包装器参照。
4. 涉及生成请求契约时，读 `docs/data-contracts/generation-request-contract.md`。
5. 不读取 Story Engine 正文，除非任务是测试工具读取目标文件夹。

## 落点

- 工具实现：`app/`；旧工具路径只保留兼容包装器。
- 数据契约：`docs/data-contracts/`。
- UI/UX 设计：`docs/ui-design/`。
- API 和 server 说明：`docs/api/`。
- 测试说明：`docs/testing/`。
- 工具账本：`_ledger/`。
