# Story Canvas 迁移账本

| 日期 | 阶段 | 动作 | 结果 |
| --- | --- | --- | --- |
| 2026-06-29 | 阶段 1 | 建立项目空骨架 | 未移动旧工具代码 |
| 2026-06-29 | 阶段 2 | 复制 `tools/story-canvas/` 到 `projects/story-canvas/app/`，复制 canvas 规则/工作流/ledger | 工具实现已迁入新项目，旧路径保留兼容 |
| 2026-06-29 | 阶段 2 验证 | 切换 `app/` 默认读取路径到 `projects/story-engine/人偶番外/主干`，清理 canvas ledger 旧路径，运行 server health/scan 和 canvas import | 新入口可启动并扫描 18 篇文章；导入脚本写回 20 个画布节点 |
| 2026-06-29 | 浏览器冒烟测试 | 用应用内浏览器打开 `http://127.0.0.1:4307/` 并截图 | 页面标题、默认路径、扫描状态、画布节点和右侧检查器均验证通过；报告见 `review/20260629_story-canvas_browser-smoke.md` |
| 2026-06-29 | 兼容入口降级 | 将旧 `tools/story-canvas/` 实现副本替换为轻量包装器 | 当前唯一维护实现为 `projects/story-canvas/app/`；旧命令只转发到新实现 |
