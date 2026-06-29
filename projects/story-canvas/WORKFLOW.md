# Story Canvas 工作流

## 启动流程

1. 读取 `AGENTS.md`、`PROJECT.md`、`WORKFLOW.md` 和 `_pipeline/context-routes.md`。
2. 明确任务类型：迁移设计、工具维护、UI/UX 设计、sidecar schema、server/API、浏览器测试、数据迁移或文档整理。
3. 按 `_pipeline/context-routes.md` 选择最小上下文。
4. 涉及旧工具入口时，只确认兼容包装器是否仍能转发；实际实现读取 `projects/story-canvas/app/` 中的具体文件。
5. 涉及生成规则时，只确认桥接字段，不修改 Story Engine 的规则或 prompt。

## 常见任务

- 工具迁移：先更新迁移账本，不立即移动旧代码。
- UI/UX 设计：写入 `docs/ui-design/`，不改生成规则。
- sidecar schema：写入 `docs/data-contracts/sidecar-schema.md`，兼容旧 `.story.json`。
- 生成请求契约：写入 `docs/data-contracts/generation-request-contract.md`。
- server/API：写入 `docs/api/`，实现未来放 `app/`。
- 浏览器测试：按 `_pipeline/browser-test-workflow.md` 验证页面加载、画布交互、sidecar 读写和截图。

## 收口要求

- 工具代码改动需记录测试方式和影响范围。
- schema 改动需记录兼容策略和迁移脚本需求。
- 生成请求字段变更需同步 Story Engine 的桥接契约。
- 不直接修改作品正文、人物卡、伏笔表或发布稿。
