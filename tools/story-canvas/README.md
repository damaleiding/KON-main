# Story Canvas Legacy Entry

Story Canvas 已迁入 `projects/story-canvas/app/` 作为当前实现位置。本目录只保留旧命令兼容包装器，避免旧启动习惯失效；功能修改、测试和文档维护均应进入 `projects/story-canvas/`。

`story-canvas` 是一个本地网页程序，用于把小说章节作为无限画布节点查看和编辑。它由 `server.mjs` 读取本机作品文件夹，再用浏览器页面展示。

## 功能

- 章节节点无限画布：支持拖拽平移、滚轮缩放和章节节点拖动。
- 工作区实时保存：画布视角、缩放、选中节点、展开状态、检查器宽度和节点位置会自动保存到当前文件夹索引。
- 画布撤销/重做：在焦点不在输入框时，`Ctrl+Z` 撤回上一步画布修改，`Ctrl+Alt+Z` 重做。
- 草稿删除：选中续写草稿节点后按 `Delete`，可从画布移除该草稿；正式章节节点不会被 Delete 删除。
- 大章节节点：同一章的上/中/下会合成一个章节大节点，节点可展开查看内部部分。
- 拖出续写草稿：鼠标移到章节节点或展开后的章节框边缘，会出现小圆点；从小圆点拖出新节点即可创建续写草稿。
- 分支与插入：草稿落在相邻两章之间时记为插入草稿，例如第 4 章和第 5 章之间的 4.5；拖到主线外侧时记为独立分支路线。
- 续写生成请求：草稿节点可记录使用的 Agent/模型、生成版本数、目标字数、拆章数、生成形态和用户方向意见；这些记录是桥接数据，不是生成规则本身。
- 草稿拆章：草稿可保留为一段文字，也可按 Markdown 标题、`---` 或 1-4 章拆分为多个草稿章节节点。
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

旧命令仍可转发到新实现：

```powershell
node tools/story-canvas/server.mjs
```

然后打开：

```text
http://127.0.0.1:4177/
```

Story Canvas 固定使用 `127.0.0.1:4177`。旧命令不会再自动切换其他端口；如果端口被非 Story Canvas 进程占用，请先关闭占用进程。

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
- 点击“记录生成请求”会追加 `generation_requests`，并在 `.story-canvas.ledger.jsonl` 记录 `draft-generate-request`。

生成请求只是可追踪的桥接记录，不会自动覆盖正文，也不会自动生成 prompt。后续 Agent 必须读取请求，再由生成层规则组织 prompt、生成候选、保存模型/时间/输入参考和筛选结论。

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
node tools/story-canvas/build-canvas-import.mjs
```
