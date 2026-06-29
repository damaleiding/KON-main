# Story Canvas Browser Smoke Test

## 测试时间

2026-06-29

## 测试入口

- URL: `http://127.0.0.1:4307/`
- Server: `projects/story-canvas/app/server.mjs`
- 默认读取目录：`projects/story-engine/人偶番外/主干`

## 检查结果

| 检查项 | 结果 |
| --- | --- |
| 页面标题 | `Story Canvas` |
| 默认路径输入框 | `projects/story-engine/人偶番外/主干` |
| 扫描状态 | 已读取 18 篇文章，形成 11 个章节节点 |
| DOM 主节点 | 10 |
| DOM 展开子节点 | 3 |
| 画布截图 | 非空白，节点和右侧检查器均可见 |

## 截图

`projects/story-canvas/review/20260629_story-canvas_browser-smoke.png`

## 结论

Story Canvas 新项目入口可以在浏览器中加载 Story Engine 默认作品目录，画布节点、展开节点、右侧检查器和续写设置显示正常。4177 端口存在旧响应，本次验证使用 4307 端口，避免干扰旧兼容入口。
