---
description: Bluespace 本地媒体审片页面生成规则。
---

# Review Board

Review Board 是一个本地 HTML 页面，用于批量查看 production ledger 中的图片和视频结果。它解决的是“候选太多，不适合全部贴进聊天”的问题。

它属于 project harness 基础工程：聊天里只给页面入口和短摘要，真实媒体清单、prompt 状态和 per-shot 数据都留在本地 `_review/` 数据包里。打开页面、让页面停留在浏览器里、或手动刷新页面不会持续消耗 token；只有把数据内容读进对话、分析截图或完整贴出来时才会占用上下文。

默认输出：

```text
bluespace/outputs/blue_space_bridge_0421/_review/index.html
```

配套数据包：

```text
bluespace/outputs/blue_space_bridge_0421/_review/
  index.html
  review-data.js
  manifest.json
  data/all.json
  data/shots/<shot_id>.json
  open_in_chrome.cmd
  open_in_chrome.command
```

数据契约：

```text
tools/project-harness/review-board-data.schema.json
tools/project-harness/review-board-manifest.schema.json
```

## 扩展原则

- `production-ledger.jsonl` 是事实源，Review Board 数据包是派生缓存。
- `index.html` 是稳定 UI 壳；媒体条目、shot 索引和 prompt 覆盖率从 `review-data.js`/`data/*.json` 读取。
- `schemaVersion` 用于数据兼容；新增字段优先追加，避免重命名或改变已有字段含义。
- `assets[]` 保持扁平、可扫描；`byShot` 和 `data/shots/<shot_id>.json` 是派生索引，方便后续只刷新或读取单个镜头。
- `shots/` 下服务于镜头生产的素材先进入 production ledger，再进入 Review Board；这个动作统一叫 `ingest`。默认可通过 `ledger.ps1 ingest` 纳入 `videos/`、`keyframes/`、以及 `refs/` 中明显的分镜/四格/sheet/grid。
- `review/` 抽帧、contact sheet、preview sheet、临时对比图和纯确认拼接图默认不入账，避免 Review Board 被衍生检查图淹没。
- 用户的新喜欢/不喜欢先留在浏览器本地状态；已经写入 `_ledger/review-decisions.jsonl` 的判断会在生成 Review Board 时读回，作为项目已保存标记。
- 页面里的有效标记规则是“待保存本地草稿优先，其次项目已保存标记”。同步按钮只导出待保存草稿，避免把已保存标记反复写成新 decision。
- `_review/` 是本机生成物，默认不提交。跨主机重新生成，保持路径和 file URL 对当前机器有效。
- 浏览器刷新只会重新读取已经生成好的 `_review/review-data.js` 和 `data/*.json`，不会自己扫描 `outputs/` 或重建 production ledger。
- `_review/index.html` 是稳定页面壳；普通账本或 decision 变化只刷新 `_review/review-data.js` 和 `data/*.json`。使用 `review-board-data.ps1/.sh` 做数据刷新，只有页面工程升级或页面壳缺失时才跑完整 `review-board`。
- production ledger、review decisions 或媒体条目变化后，负责该变化的对话应主动刷新数据包；之后用户刷新已打开页面即可看到新数据。

## 使用

Windows:

```powershell
.\tools\project-harness\review-board.ps1
```

macOS:

```bash
./tools/project-harness/review-board.sh
```

自定义账本或输出：

```powershell
.\tools\project-harness\review-board.ps1 `
  --ledger "bluespace/outputs/blue_space_bridge_0421/_ledger/production-ledger.jsonl" `
  --output "bluespace/outputs/blue_space_bridge_0421/_review/index.html"
```

强制刷新：

```powershell
.\tools\project-harness\review-board.ps1 --force
```

默认运行会比较账本 hash、数据 source hash、页面 hash 和当前主机根目录。如果没有变化，会直接复用已有页面和数据包。

这个命令可以在任何 Codex 对话里主动运行。常规规则是：候选媒体发生变化或账本被改动时，对话负责顺手刷新 Review Board；如果只是查看现有页面，不需要反复重建。

从 `shots/` ingest 镜头级生产素材到账本：

```powershell
.\bluespace\tools\production-ledger\ledger.ps1 ingest
.\bluespace\tools\production-ledger\ledger.ps1 enrich-recipes
.\tools\project-harness\review-board-data.ps1
```

macOS:

```bash
./bluespace/tools/production-ledger/ledger.sh ingest
./bluespace/tools/production-ledger/ledger.sh enrich-recipes
./tools/project-harness/review-board-data.sh
```

`ingest --dry-run --json` 可先预览会入账的条目。默认 ingest 规则会记录镜头视频、关键帧、分镜和四格/sheet/grid；如需额外纳入 `work/` 下的工作视频或工作分镜，显式加 `--include-work`。旧命令 `discover-shot-media` 保留为兼容别名。

`enrich-recipes` 会从 shot 工作日志里补 prompt 文件、task_id、首帧参考和 settings。没有运行这一步时，靠 `ingest` 发现的媒体通常只能显示为 `仅摘要`。

直接生成并用系统 Chrome 打开：

```powershell
.\tools\project-harness\review-board-open.ps1
```

macOS:

```bash
./tools/project-harness/review-board-open.sh
```

`review-board-open` 会先调用 `review-board`，再打开 `_review/index.html`。生成后的 `_review/open_in_chrome.cmd` 和 `_review/open_in_chrome.command` 也可以在文件管理器里双击使用。这个入口不需要常驻服务，只是一次性启动 Chrome。

## 页面能力

- 直接预览视频和图片。
- 按 `review.verdict`、`shot_id`、`model`、`kind` 筛选。
- 左侧 `Shots` 快捷栏会从当前数据包提取全部镜头组，点击镜头按钮即可同步切换 `Shot` 筛选；窄屏时自动变成横向快捷栏。
- 按 `role` 筛选镜头视频、关键帧、分镜/四格图等 ingest 后的用途分类。
- 按 `Recipe` 筛选完整配方、仅摘要或缺 prompt 的资产，用来检查哪些 liked 资产可以复用生成过程。
- 用 `Sort` 控制排序：默认按账本/ingest 顺序，也可以切换为喜欢优先、时间新到旧、时间旧到新、Shot 顺序或 Review 状态。喜欢不再被隐式强制置顶，除非用户选择喜欢优先。
- 搜索 title、task_id、entry_id、路径和说明。
- 对单个媒体标记“喜欢”或“不喜欢”。
- “喜欢”会优先显示并高亮，适合作为后续镜头或风格参考。
- “不喜欢”会默认折叠并排在后面，但仍然保留在页面里，必要时可以展开查看。
- 新标记保存在当前浏览器本地；已同步的标记保存在 `_ledger/review-decisions.jsonl`，重新生成页面后可以读回。
- 卡片上的标记会区分“已保存”和“待保存”。“撤销本地”只清除浏览器草稿；“取消标记”会生成一个待保存的取消 decision，用于取消已经保存过的喜欢/不喜欢。
- 每个媒体卡片显示生成配方状态：`完整配方`、`仅摘要` 或 `缺 prompt`。
- 卡片内的“生成配方”区域用于查看 prompt 摘要、完整 prompt、prompt 文件、negative prompt、seed、settings、参考图/参考视频和提交命令。
- `完整配方` 的核心是 prompt 或 prompt 文件；提交命令、参考资产和 settings 只能作为补充。`仅摘要` 可以作为视觉参考但不应被当成完整可复用生成过程；`缺 prompt` 只能作为弱参考。
- Prompt 的正式查找入口是 production ledger 的 `generation.prompt_file`/`generation.prompt`，以及 `_ledger/prompt-index.json`。Review Board 只是展示这些字段，不替代账本事实源。
- 搜索、所有筛选项和 `Sort` 会保存在浏览器本地的全局 Review Board 偏好里；刷新页面或 `Update` 后继续沿用上一次审片视角。点“重置”会把这组显示偏好恢复为默认值。
- 复制可见路径。
- 单条媒体可复制“本机路径”或“项目路径”：本机路径用于粘贴到文件管理器、播放器或命令行；项目路径用于账本和 Markdown 记录。
- 复制喜欢路径或标记 JSON，便于交给后续 ledger update / decision log 工具。
- `Update` 用于同步当前待保存判断。Windows 一键同步时，页面会先把待保存 JSON 放入剪贴板，再下载兜底。
- 复制单条配方或所有喜欢配方，便于把 liked 资产作为后续生成美基准。
- 如果浏览器在 `file://` 页面拦截剪贴板 API，页面会自动退回隐藏 textarea 复制；仍失败时，会显示可手动复制的文本框。
- Windows 注册本机协议后，可直接点 `Update` 触发一次性导入和账本更新，不需要常驻 harness 服务。
- 需要使用 `Update` 回写时，优先在系统 Chrome 里打开 Review Board；Codex 内置浏览器可以预览，但可能拦截 `trae-review-sync://`。
- 打开文件，走系统默认播放器；当前 Windows 主机的视频默认已设置为 mrv2。

## 工作流定位

- 少量精选结果：在聊天里用媒体 Review 卡片展示。
- 批量候选结果：刷新 Review Board，只把页面入口和短摘要发给用户。
- 不在每次对话无条件重建页面；只有账本变化、用户要求刷新、换主机、页面工程升级或使用 `--force` 时才重写。
- 已打开的浏览器页面属于查看层。数据包被 harness 重写后，刷新页面即可看到新内容；如果数据包没有被重写，单纯刷新页面不会发现新的文件或账本变化。
- 用户筛选之后：下一步用 decision log 或 ledger update 工具把判断回写到账本。

## Review Decision 回写

Review Board 的喜欢/不喜欢先存在浏览器本地。Windows 上推荐先注册一次本机协议：

```powershell
.\tools\project-harness\review-decision.ps1 register-protocol
```

注册后页面里的 `Update` 会直接触发：

- 导入当前待保存 marks JSON 到 `_ledger/review-decisions.jsonl`。
- 同步更新 `production-ledger.jsonl` 的 `review.verdict`。

这个方案不会启动常驻服务。浏览器可能会第一次询问是否允许打开 `trae-review-sync://`，确认后脚本只运行一次。协议脚本会优先读取剪贴板里的待保存 JSON，读不到时再尝试找最新下载的 `review-marks-*.json`。导入后会强制刷新 Review Board 数据包；页面如果没有自动更新，手动刷新当前页面即可看到“已保存”状态。

注意：Codex 内置浏览器可能拦截外部协议。需要确认回写链路时，用 `review-board-open.ps1`、`review-board-open.sh`，或双击 `_review/open_in_chrome.cmd/.command` 进入系统 Chrome。

手动流程仍然可用：从页面复制或导出待保存 JSON 后，再运行：

```powershell
.\tools\project-harness\review-decision.ps1 import --file "<downloaded-review-marks.json>"
```

这一步只写入稳定决策日志：

```text
bluespace/outputs/blue_space_bridge_0421/_ledger/review-decisions.jsonl
```

如果要把 liked/disliked 同步到生产账本的 `review.verdict`，显式加：

```powershell
.\tools\project-harness\review-decision.ps1 import --file "<downloaded-review-marks.json>" --apply-ledger
```

如果已经下载了 marks JSON，但不想找文件路径，也可以让工具找最新下载：

```powershell
.\tools\project-harness\review-decision.ps1 import-latest
```

默认映射：

```text
liked -> selected
disliked -> rejected
cleared -> needs_review
```

如果只想预览变化：

```powershell
.\tools\project-harness\review-decision.ps1 import --file "<downloaded-review-marks.json>" --apply-ledger --dry-run --json
```
