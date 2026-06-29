# Story Canvas 项目记忆

## 核心目标

Story Canvas 负责 KVA 的故事画布网页工具层：把章节节点、剧情块、reroll、草稿、sidecar、历史快照和生成请求做成可视化、可追踪、可回滚的工具层。

## 迁移状态

- 当前阶段：工具层迁移完成态；本项目是默认实现和维护入口。
- 当前实现入口：`projects/story-canvas/app/server.mjs`。
- 默认读取路径：`projects/story-engine/人偶番外/主干`。
- 生成层项目：`projects/story-engine/`。
- 旧 `tools/story-canvas/` 保留为轻量兼容包装器；后续功能维护只修改本项目 `app/`。

## 稳定职责

- 管理网页端交互、server、sidecar schema、历史快照、回滚和浏览器测试。
- 记录生成请求和 reroll 目标，作为 Story Engine 输入。
- 不判断候选文本是否进入主干。
- 不维护 prompt 和长篇生成规则全文。

## 当前待办

- 补齐 sidecar schema 文档。
- 补齐生成请求契约。
- 建立浏览器测试和截图验证流程。
