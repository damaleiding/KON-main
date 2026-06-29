# Story Canvas 上下文路由

## 路由原则

- 工具维护不读取 Story Engine 正文，除非任务是测试工具读取目标文件夹。
- 生成规则、prompt 和范文学习不属于本项目。
- 工具实现优先读取 `app/`；旧工具路径仅作兼容包装器参照。

## 通用入口

- 项目规则：`AGENTS.md`
- 项目记忆：`PROJECT.md`
- 工作流：`WORKFLOW.md`
- 当前布局：`docs/current-layout.md`
- 数据契约：`docs/data-contracts/README.md`
- 工具索引：`_pipeline/tool-index.json`
- 浏览器测试流程：`_pipeline/browser-test-workflow.md`

## 任务路由

- 迁移设计：读 `docs/migration/20260629_story-engine_story-canvas_split-design.md` 和本项目入口。
- UI/UX：读 `docs/ui-design/README.md` 和目标页面文件。
- sidecar schema：读 `docs/data-contracts/sidecar-schema.md` 和旧工具相关实现。
- 生成请求契约：读 `docs/data-contracts/generation-request-contract.md`。
- server/API：读 `docs/api/README.md` 和 `app/server.mjs`。
- 浏览器测试：读 `_pipeline/browser-test-workflow.md` 和工具 README。
