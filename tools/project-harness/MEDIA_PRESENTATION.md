---
description: 图片和视频结果的统一交互展示规范。
---

# Media Presentation

以后给用户展示图片或视频结果时，统一使用“媒体 Review 卡片”，不要只给裸路径。

## 默认格式

```markdown
**媒体 Review**

**1. 镜头标题或用途**
![镜头标题或用途](<absolute-path-for-current-host>)
[打开文件](<absolute-path-for-current-host>) · `video` · `sd2` · `selected`
说明：一句话说明这个结果为什么值得看，或当前判断是什么。
```

## 规则

- 第一优先级是直接预览：图片和视频都用 Markdown 媒体语法渲染。
- 第二优先级是可点击打开：每个媒体下面必须有 `[打开文件](<absolute-path>)`。
- 不要只给一条裸路径让用户自己复制。
- 回复用户时使用当前主机的绝对路径，保证 Codex app 能预览和点击。
- 账本、Markdown 记录和脚本内部仍然使用项目相对路径，避免跨主机失效。
- 一次展示默认 1 到 6 个结果；更多结果先给 contact sheet、精选列表或让用户选择范围。
- 对视频优先展示最终 `.mp4/.mov/.webm`；如果某格式不能内联预览，也保留 `[打开文件]`。
- 对历史迁移资产，如果账本里有 `declared_output_path` 和真实 `output_path`，展示真实 `output_path`。

## 工具

从 production ledger 展示已选中结果：

```powershell
.\tools\project-harness\media-card.ps1 --from-ledger --review selected --limit 5
```

macOS:

```bash
./tools/project-harness/media-card.sh --from-ledger --review selected --limit 5
```

展示指定文件：

```powershell
.\tools\project-harness\media-card.ps1 --path "bluespace/outputs/blue_space_bridge_0421/shots/s270_n27_eye_loses_focus/videos/r4_11_rt_awakening_eye_acting_sd2_1080p_v1.mp4" --title "2779 苏醒眼部"
```

工具只负责生成 Markdown；最终回复时可以直接采用它的输出。
