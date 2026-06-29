# Story Canvas Release Notes

## 2026-06-29 迁移完成

- `tools/story-canvas/` 已复制到 `projects/story-canvas/app/`。
- 默认读取路径切换为 `projects/story-engine/人偶番外/主干`。
- 已验证 `server.mjs` health/scan 和 `build-canvas-import.mjs`。
- 已完成浏览器冒烟测试，截图保存到 `review/20260629_story-canvas_browser-smoke.png`。
- 旧 `tools/story-canvas/` 已降级为兼容包装器，避免维护两套实现。
