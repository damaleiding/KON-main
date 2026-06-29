# Story Canvas

Story Canvas 是 KVA 的网页工具层项目，负责故事画布的前后端、交互、sidecar、历史快照、回滚、数据契约和工具测试。

当前工具实现已迁入 `app/`，默认读取 Story Engine 的作品目录。旧 `tools/story-canvas/` 已降级为轻量兼容包装器，功能维护以本项目为准。

## 入口

- `AGENTS.md`：项目级规则和读取顺序。
- `PROJECT.md`：项目记忆和迁移状态。
- `WORKFLOW.md`：工具层工作流。
- `story-canvas_project-brief.html`：给人类看的静态纲要。
- `docs/data-contracts/`：sidecar 和生成请求契约。
- `docs/ui-design/`：界面与交互设计。
- `app/`：当前工具实现。
- `docs/api/`：server/API 说明。
- `_pipeline/`：上下文路由、工具索引和测试工作流。

## 当前边界

- 不在旧 `tools/story-canvas/` 里维护第二套实现。
- 不维护 Story Engine 生成规则和 prompt。
- 不自动接收候选文本进入主干；确认和落稿仍由生成层/用户决策。
