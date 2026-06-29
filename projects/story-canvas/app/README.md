# Story Canvas

迁移说明：本目录是 Story Canvas 的当前项目内实现位置。旧 `tools/story-canvas/` 仅保留轻量兼容包装器，后续功能修改在 `projects/story-canvas/app/` 进行。

`story-canvas` 是一个本地网页程序，用于把小说章节作为无限画布节点查看和编辑。它由 `server.mjs` 读取本机作品文件夹，再用浏览器页面展示。

## 目录边界

```text
projects/story-canvas/app/
  server.mjs                  # 后端 HTTP/API 服务，只固定监听 127.0.0.1:4177
  story-canvas.config.mjs     # 固定端口、默认作品目录和静态资源路径
  story-canvas.html           # 页面结构骨架
  public/story-canvas.css     # 页面样式
  public/story-canvas.js      # 画布交互、检查器和 API 调用
  start-story-canvas.ps1      # 固定端口启动脚本
```

前端结构、样式和交互已分离，后续 UI 修改优先落在 `public/story-canvas.css` 或 `public/story-canvas.js`；只有页面 DOM 骨架变化才改 `story-canvas.html`。后端接口和文件系统读写仍落在 `server.mjs`，端口与默认路径落在 `story-canvas.config.mjs`。

## 功能

- 章节节点无限画布：支持拖拽平移、滚轮缩放和章节节点拖动。
- CRATE 风格低噪声画布：顶部只保留当前节点路径和缩放状态，常用缩放/整理操作放到底部 dock，右栏用“故事/文本或生成/历史”快速跳转。
- Agent 状态检查：左侧会显示 Gemini、Claude、DeepSeek、Codex、Trae 和手动填稿的当前链路状态，区分“可用 / 未配置 / 桥接”。
- 工作区实时保存：画布视角、缩放、选中节点、展开状态、检查器宽度和节点位置会自动保存到当前文件夹索引。
- 画布撤销/重做：在焦点不在输入框时，`Ctrl+Z` 撤回上一步画布修改，`Ctrl+Alt+Z` 重做。
- 草稿删除：选中续写草稿节点后按 `Delete`，可从画布移除该草稿；正式章节节点不会被 Delete 删除。
- 大章节节点：同一章的上/中/下会合成一个章节大节点，节点可展开查看内部部分。
- 拖出续写草稿：鼠标移到章节节点或展开后的章节框边缘，会出现小圆点；从小圆点拖出新节点即可创建续写草稿。
- 分支与插入：草稿落在相邻两章之间时记为插入草稿，例如第 4 章和第 5 章之间的 4.5；拖到主线外侧时记为独立分支路线。
- 开始生成：草稿节点可设置 Agent/文字模型、生成版本数、目标字数、拆章数、生成形态和用户方向意见；Gemini Flash 会直接调用本机 Gemini API；Claude 走 OneAgent，DeepSeek 走 Ark；Codex 走本地桥接任务队列；未配置的模型先写入待外部生成请求。
- 并发生成与处理中状态：生成多个 Gemini 版本时，服务端会并发请求候选；网页按钮会显示转圈处理状态，避免误以为页面卡住。
- 多版本节点：生成 2 个版本就在画布上铺出 2 个草稿版本节点，生成 4 个版本就铺出 4 个；空壳草稿会被复用为第 1 版，已有正文的草稿会保留原文并在旁边生成新版本节点。
- 草稿版本决策：生成后的草稿版本可在右栏标记为“采纳本版 / 放弃本版 / 恢复草稿”；采纳只标记生产候选，不覆盖主线正文，同批次其他版本会标为放弃并保留文件。
- Codex 队列可见：选择 Codex / GPT-5 时，网页会写入桥接任务队列；左侧“Codex 队列”可直接看到待执行任务和任务 JSON 路径。
- Gemini 直接生成：选择 Gemini Flash 时，可由本机 `GOOGLE_API_KEY` / `GEMINI_API_KEY` 调用 Google Generative Language API，为续写草稿、部分 reroll、剧情块 reroll 和整章 reroll 生成候选；草稿续写候选会物化为画布节点，reroll 候选保存在 sidecar 或账本中，不自动进入主干。
- 草稿上下文连接：草稿节点和右栏会显示上游章节、下游章节或独立分支路线、目标字数、版本序号和模型，便于把生成结果当成可追踪的任务节点处理。
- 草稿阶段不显示正式章节的反馈重Roll框；草稿修改意见写入草稿方向和生成请求。
- 草稿拆章：草稿可保留为一段文字，也可按 Markdown 标题、`---` 或 1-4 章拆分为多个草稿章节节点；拆章处理中会显示转圈状态，拆完后以半透明虚线大框包住各段，像正式章节的上/中/下展开视图，但标记为未确认草稿。
- 节点详情：右侧按文章部分展示正文内容，像代码编辑器一样把每个剧情块显示为独立块。
- 剧情块编号：每个剧情块都有稳定编号、行号和字数，支持单块 reroll 记录。
- 节点 reroll：为当前节点新增候选版本，不覆盖 selected。
- 剧情段 reroll：选择一个剧情块后，可记录本块重录目标和候选，不覆盖整章。
- 设定增量表：记录本章角色、环境、剧情节点、世界规则、道具、组织、伏笔等变化和同步状态。
- 同目录 sidecar：每篇 `.md` / `.txt` 旁边生成同名 `.story.json`，保存剧情块编号、行号、候选和元数据。
- 文件夹索引：节点位置和工作区状态保存到当前读取文件夹下的 `.story-canvas.folder.json`。
- 实时同步：网页会定时检查当前文件夹内正文、sidecar、文件夹索引和账本变动，发现变化后自动刷新页面内容。
- 历史回溯：每篇文章旁边的 `.story-history/` 保存正文快照和 sidecar 快照，方便恢复上一版。
- 账本记录：当前文件夹下的 `.story-canvas.ledger.jsonl` 记录扫描、快照、reroll、节点位置保存和回滚操作。

## 工具层与生成层边界

`story-canvas` 属于工具层。它负责展示章节、记录选区、保存 reroll 目标、生成请求、候选状态、sidecar、历史快照和账本，不负责维护长篇生成规则、prompt 模板或章节质量门。

网页端的 reroll / 重构框是用户对当前选区、部分或整章的直接意见。工具只把这些意见写入 `.story.json`、`.story-canvas.folder.json` 或 `.story-canvas.ledger.jsonl`，后续由生成层按项目 `docs/rules/layer-boundaries.md` 和对应生成规则解释、合并和执行。

工具层不得因为新增按钮、字段或 UI 文案而顺手修改 `docs/rules/longform-generation.md`、项目 `prompts/` 或工作区 `templates/`。生成层也不得因为 prompt 或规则更新而顺手修改网页工具、sidecar schema 或历史快照机制。

如果网页重构框意见和生成规则冲突，冲突处理由生成层完成，并在生成说明中标出；工具层只保证意见被稳定记录。

## 使用方式

推荐启动方式：

```powershell
powershell -ExecutionPolicy Bypass -File projects/story-canvas/app/start-story-canvas.ps1
```

脚本固定使用：

```text
http://127.0.0.1:4177/
```

如果 `4177` 已经有 Story Canvas 在运行，脚本会直接复用并打印 PID；如果被其他程序占用，脚本会报错，不会自动换端口。

手动启动也可以，但仍固定监听 `4177`，`STORY_CANVAS_PORT` 和 `--port` 不再改变 Story Canvas 端口：

```powershell
node projects/story-canvas/app/server.mjs
```

然后打开固定地址：

```text
http://127.0.0.1:4177/
```

默认读取：

```text
projects/story-engine/人偶番外/主干
```

可以在页面左侧把作品文件夹改为其他目录，例如：

```text
projects/story-engine/人偶番外/分支/成人化重设
```

本工具会创建或更新 `.story.json` sidecar 和 `.story-canvas.folder.json`，但不直接改正文内容、人物卡或发布稿。确认后的正文替换仍需按项目工作流写回事实层。

## 续写草稿节点

续写入口不放在顶部按钮。选中或悬停章节节点时，从节点边缘的小圆点拖出草稿节点：

- 拖到相邻两章之间：`route_mode=interstitial`，记录 `after_group_key` 和 `before_group_key`，用于后续生成插入章节。
- 拖到主线外侧：`route_mode=branch`，记录 `branch_from_group_key`，用于后续独立分支试写。
- 草稿生成设置写入 `.story-canvas.folder.json` 的 `generation_settings`。
- 右栏“生成草稿”会先显示上下文连接条；`interstitial` 草稿展示上游和下游，`branch` 草稿展示上游和独立分支路线。
- 点击“开始生成”会调用 `/api/draft-node/generate`。Gemini 生成成功时，候选正文会直接写入 `.story-canvas-drafts/` 并成为画布上的草稿版本节点；非 Gemini 模型会追加 `generation_requests`，并在 `.story-canvas.ledger.jsonl` 记录 `draft-generate-request`。
- Codex / GPT-5 当前不由网页 server 直接启动 App 内部对话，而是写入 `.story-canvas-codex-bridge/` 的任务 JSON；Codex App 侧或后续本机桥接消费者读取后再创建/继续线程执行。
- 生成后的草稿版本用 `status` 记录决策：`draft` 表示待处理，`selected` 表示已采纳为生产候选，`rejected` 表示放弃。决策原因写入 `decision_note`，时间写入 `decided_at`，并同步到账本。
- 草稿节点处于候选阶段，不打开整章、部分或剧情块的正式反馈重Roll框。

生成请求只是可追踪的桥接记录，不会自动覆盖主干正文。Gemini 直接生成的续写候选只进入草稿版本节点；采纳、拆章或写回事实层仍需由用户确认。

## 历史与回滚

生成文件会放在当前读取的作品文件夹内：

```text
<article>.story.json
.story-canvas.folder.json
.story-canvas.ledger.jsonl
.story-canvas-drafts/<draft-id>.md
.story-history/<article>/source/<hash>.md
.story-history/<article.story>/sidecar/<timestamp>_<action>.json
```

网页右侧“历史记录与回滚”会列出当前文章的正文快照、sidecar 快照和最近账本记录。恢复正文会写回原 `.md` / `.txt`；恢复 JSON 会写回同名 `.story.json`。恢复前会自动留下当前版本快照。

画布级 `Ctrl+Z` / `Ctrl+Alt+Z` 通过 `.story-canvas.folder.json` 状态快照恢复节点位置、草稿节点和草稿正文。撤销不会删除磁盘上已产生过的草稿文件，只会把它们从当前画布索引中移出。

选中草稿节点按 `Delete` 会把草稿标记为 `archived` 并从画布索引移除；草稿 Markdown 文件默认保留，方便撤回或人工找回。

## 导入包生成

`build-canvas-import.mjs` 用于从既有作品文件生成画布导入包。脚本只写入节点索引、来源路径、行号和字数统计，不复制整章正文。

```powershell
node projects/story-canvas/app/build-canvas-import.mjs
```
