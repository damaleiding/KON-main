# Story Canvas 当前目录映射

## 项目级目录

| 目录 | 用途 | 当前状态 |
| --- | --- | --- |
| `app/` | 前后端实现位置 | 当前唯一维护实现 |
| `docs/ui-design/` | UI/UX 和交互设计 | 已建立入口 |
| `docs/data-contracts/` | sidecar 与生成请求契约 | 已建立入口 |
| `docs/api/` | server/API 说明 | 已建立入口 |
| `docs/testing/` | 浏览器测试和截图验证说明 | 已建立入口 |
| `_pipeline/` | 上下文路由、工具索引和测试流程 | 已建立骨架 |
| `_ledger/` | 迁移账本、版本记录和发布说明 | 已建立骨架 |
| `outputs/` | 工具输出和测试导出 | 空目录 |
| `review/` | 测试报告和设计评审 | 空目录 |
| `trash/` | 废弃材料 | 空目录 |
| `_tmp/` | 临时文件 | 空目录 |

## 外部依赖

- 迁移设计：`docs/migration/20260629_story-engine_story-canvas_split-design.md`。
- 旧工具兼容入口：轻量包装器，转发到 `projects/story-canvas/app/`。
- 生成层项目：`projects/story-engine/`。

## 暂不迁移

- 正文旁 `.story.json`、`.story-canvas.folder.json`、`.story-canvas.ledger.jsonl` 和 `.story-history/`
