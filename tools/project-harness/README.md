---
description: trae_projects 项目级 harness 前置检查。
---

# Project Harness Doctor

这个工具用于检查当前工作区是否具备可交付、可回滚、可复现的基本条件。它应该在新机器部署、开新窗口接手、提交重要生成批次之前运行。

跨主机运行规则见 [CROSS_HOST.md](CROSS_HOST.md)。

媒体展示规范见 [MEDIA_PRESENTATION.md](MEDIA_PRESENTATION.md)。

本地批量审片页面见 [REVIEW_BOARD.md](REVIEW_BOARD.md)。

Bluespace 新对话默认先运行 `startup-brief`，再按简报点查事实源。完整计划、检索入口和待办见 [harness-workflow-index.md](../../bluespace/docs/workflow/harness-workflow-index.md)；只有要修改 harness 规则/工具或排查系统本身时才需要读完整索引。

## 快速使用

Windows:

```powershell
.\tools\project-harness\doctor.ps1
```

macOS:

```bash
./tools/project-harness/doctor.sh
```

Phase 1-12 自动自测：

```powershell
.\tools\project-harness\self-test.ps1
```

```bash
./tools/project-harness/self-test.sh
```

Phase 8/9/11/12 上下文、参考图索引、参考图页面和 prompt reference picker：

```powershell
.\tools\project-harness\reference-index.ps1
.\tools\project-harness\reference-board.ps1
.\tools\project-harness\reference-picker.ps1 --entity oldA --usage prompt_reference
.\tools\project-harness\context-index.ps1
```

媒体库完整性检查和手动同步清单：

```powershell
.\tools\project-harness\media-manifest.ps1 check --warn-only
.\tools\project-harness\media-manifest.ps1 missing --output bluespace/_media/missing-media.json --warn-only
.\tools\project-harness\media-manifest.ps1 scan --hash
```

```bash
./tools/project-harness/reference-index.sh
./tools/project-harness/reference-board.sh
./tools/project-harness/reference-picker.sh --entity oldA --usage prompt_reference
./tools/project-harness/context-index.sh
```

```bash
./tools/project-harness/media-manifest.sh check --warn-only
./tools/project-harness/media-manifest.sh missing --output bluespace/_media/missing-media.json --warn-only
./tools/project-harness/media-manifest.sh scan --hash
```

输出 JSON：

```powershell
.\tools\project-harness\doctor.ps1 --json
```

```bash
./tools/project-harness/doctor.sh --json
```

## 当前硬性前置条件

1. Git 已安装，并且 `git` 在 PATH 中可见。
2. 当前工作区是 Git worktree。
3. Node 可用。
4. Bluespace production ledger 能通过校验。
5. Windows/macOS 双入口都存在。
6. `.gitattributes` 已定义换行和二进制媒体处理规则。
7. Production ledger 使用可移植的项目相对路径。
8. Reference governance 无 warning，且 `reference-index.json` 是最新派生结果。
9. Project Context Index 是最新派生结果。

## Phase 1-12 Completion Matrix

| Phase | Status | Scope | Main verification |
| --- | --- | --- | --- |
| Phase 1 | done | Preflight、跨主机入口、doctor、路径可移植性 | `doctor.ps1/.sh`、`self-test` entrypoint check |
| Phase 2 | done | 媒体 Review 卡片，少量精选媒体的聊天展示格式 | `media-card.ps1/.sh` fixture render |
| Phase 3 | done | Production ledger、`ingest`、`validate`、镜头级素材入账规则 | `ledger ingest` + `ledger validate --strict` |
| Phase 4 | done | Review Board 页面壳、数据包、manifest、data-only refresh | `review-board.ps1/.sh` + `review-board-data.ps1/.sh` |
| Phase 5 | done | Review decision 持久化、liked/disliked/cleared 回写 | `review-decision import --apply-ledger` |
| Phase 6 | done | `generation-capture`、prompt 文件、prompt index、配方追踪 | `generation-capture record` + `ledger prompt-index` |
| Phase 7 | done | 自动 fixture 回归测试和人工验收清单 | `self-test.ps1/.sh` |
| Phase 8 | done | Context Index、Reference Index、ledger 定向查询、media manifest 缺失检查 | `context-index.ps1/.sh`、`reference-index.ps1/.sh`、`media-manifest.ps1/.sh`、`ledger find/recipe` |
| Phase 9 | done | Reference governance、selected/deprecated 人工边界、usage/cautions | `reference-governance.json` + `reference-index.ps1/.sh` + `self-test.ps1/.sh` |
| Phase 10 | waiting | macOS 实机验证 | 后置，不阻塞 Windows harness 推进 |
| Phase 11 | done | Reference Board、参考图可视化筛选、governance 边界查看 | `reference-board.ps1/.sh` + `reference-board-data.ps1/.sh` + `self-test.ps1/.sh` |
| Phase 12 | done | Prompt Reference Picker、安全 prompt 参考筛选、默认排除 deprecated | `reference-picker.ps1/.sh` + `self-test.ps1/.sh` |

## Self-Test

`self-test` 会在已忽略的 `tmp/project-harness-self-test/` 中创建临时 fixture，跑通：

- Phase 1 entrypoint check
- `reference-index` 参考图索引生成
- `context-index` 项目上下文索引生成
- `media-card` 媒体 Review 卡片渲染
- `ledger ingest`
- `ledger enrich-recipes`
- `generation-capture record`
- `ledger validate --strict`
- `ledger prompt-index`
- `ledger find` / `ledger recipe`
- `reference-governance.json` 的 selected/deprecated 边界
- Reference Board 页面壳和数据包
- Prompt Reference Picker 默认排除 deprecated，并按 entity/usage/status 输出 prompt reference block
- Review Board 完整生成
- `review-board-data` 数据刷新入口
- `review-decision import --apply-ledger`

默认成功后会清理临时 fixture；失败时会保留现场，方便检查账本、prompt index 和 Review Board 数据包。需要主动保留时：

```powershell
.\tools\project-harness\self-test.ps1 --keep-fixture
```

```bash
./tools/project-harness/self-test.sh --keep-fixture
```

机器可读输出：

```powershell
.\tools\project-harness\self-test.ps1 --json
```

## 推荐条件

- Git 提交身份已经配置。
- active harness 文件里没有主机用户目录型绝对路径。
- 文件名没有只靠大小写区分的冲突。

## Phase 8 Context Index

Phase 8 的目标是减少新对话启动时的全项目搜索。当前入口：

- `bluespace/_harness/context-index.json`
- `bluespace/_harness/context-index.md`
- `tools/project-harness/startup-brief.ps1`
- `tools/project-harness/startup-brief.sh`
- `tools/project-harness/token-meter.ps1`
- `tools/project-harness/token-meter.sh`
- `tools/project-harness/media-manifest.ps1`
- `tools/project-harness/media-manifest.sh`
- `bluespace/refs/_index/reference-index.json`
- `bluespace/refs/_index/reference-index.md`
- `bluespace/refs/_index/reference-governance.json`
- `bluespace/refs/_index/reference-governance.md`
- `bluespace/refs/_review/index.html`
- `bluespace/refs/_review/reference-data.js`

刷新索引：

```powershell
.\tools\project-harness\reference-index.ps1
.\tools\project-harness\reference-board.ps1
.\tools\project-harness\context-index.ps1
```

低 token 新会话启动简报：

```powershell
.\tools\project-harness\startup-brief.ps1
.\tools\project-harness\startup-brief.ps1 --shot-id s040
.\tools\project-harness\startup-brief.ps1 --topic generation
.\tools\project-harness\startup-brief.ps1 --topic media-sync
```

macOS:

```bash
./tools/project-harness/startup-brief.sh
./tools/project-harness/startup-brief.sh --shot-id s040
./tools/project-harness/startup-brief.sh --topic generation
./tools/project-harness/startup-brief.sh --topic media-sync
```

这个入口只输出当前项目状态、本轮主题、建议下一步、按需事实源、目标 shot 的少量 ledger 摘要和推荐命令；不要用完整 `production-ledger.jsonl`、`prompt-index.json`、`review-data.js`、`_review/data/*.json` 或完整规则文档栈代替它。

可用 topic：`status`、`generation`、`review-board`、`references`、`ledger`、`prompt`、`harness`、`media-sync`。默认 `status` 不展开最近资产；需要全局最近资产时加 `--recent`，需要更少条目时用 `--limit <n>`。

低成本 token 尾注：

```powershell
.\tools\project-harness\token-meter.ps1
```

macOS:

```bash
./tools/project-harness/token-meter.sh
```

它只读 Codex session 日志里的 `token_count` 统计事件，不读取或打印聊天正文。默认会用 `tools/project-harness/token-meter.local.json` 保存上一轮基线；首次运行、换会话或需要归零时使用 `--reset`。推荐每轮正式回复末尾只显示一行，例如 `Token: 本轮约 +3.1k（截至回复前） | 当前 164k/258k 63% | 输出 +0.8k | 缓存 96%`。

修改参考图治理规则后，先改 `bluespace/refs/_index/reference-governance.json`，再刷新 `reference-index`、`reference-board` 和 `context-index`。`reference-index.json` 里的 `governance` 字段会标出每个资产来自 exact asset、rule 还是 fallback 分类。

账本定向查询：

```powershell
.\bluespace\tools\production-ledger\ledger.ps1 find --shot-id s071 --limit 10
.\bluespace\tools\production-ledger\ledger.ps1 find --shot-id s071 --kind video --prompt-status prompt_file --limit 10
.\bluespace\tools\production-ledger\ledger.ps1 recipe --entry-id <entry_id>
```

## Phase 11 Reference Board

参考图页面入口：

```powershell
.\tools\project-harness\reference-board.ps1
```

数据包轻量刷新：

```powershell
.\tools\project-harness\reference-board-data.ps1
```

页面输出在 `bluespace/refs/_review/index.html`，数据包是 `bluespace/refs/_review/reference-data.js`。它从 `reference-index.json` 派生，只用于本地查看和筛选，不回写治理规则；治理仍改 `reference-governance.json`。

## Phase 12 Prompt Reference Picker

写 prompt 前从已治理参考里拿安全引用：

```powershell
.\tools\project-harness\reference-picker.ps1 --entity oldA --usage prompt_reference
.\tools\project-harness\reference-picker.ps1 --entity shuttle --paths-only
```

机器可读输出：

```powershell
.\tools\project-harness\reference-picker.ps1 --entity oldA --usage prompt_reference --json
```

默认只返回 `selected` 且存在于磁盘上的参考图。`deprecated` 默认排除，只有显式传入 `--status deprecated --include-deprecated` 时才会作为 trace-only 结果出现。

## 媒体展示

生成结果给用户看时，优先用媒体 Review 卡片：

```powershell
.\tools\project-harness\media-card.ps1 --from-ledger --review selected --limit 5
```

macOS:

```bash
./tools/project-harness/media-card.sh --from-ledger --review selected --limit 5
```

批量候选结果优先生成 Review Board：

```powershell
.\tools\project-harness\review-board.ps1
```

macOS:

```bash
./tools/project-harness/review-board.sh
```

如果要直接进入系统 Chrome，使用打开入口：

```powershell
.\tools\project-harness\review-board-open.ps1
```

macOS:

```bash
./tools/project-harness/review-board-open.sh
```

Review Board 是本地基础查看器。它会生成稳定页面壳和 `_review/` 数据包，并用 manifest/hash 判断是否需要刷新；任何对话都可以主动运行它。对话里只返回入口和短摘要，避免把大量媒体条目塞进上下文。

打开页面、让页面停留在浏览器里、或手动刷新页面不会持续消耗 token；只有把页面数据、截图分析或大量条目内容读进对话时才会占用上下文。

Review Board 的浏览器刷新只会重新读取已经生成好的 `_review/review-data.js` 和 `data/*.json`。`_review/index.html` 是稳定页面壳，普通数据变化只需要刷新数据包：

```powershell
.\tools\project-harness\review-board-data.ps1
```

如果 production ledger、review decisions 或媒体条目变化，负责该变化的对话应主动运行数据刷新；只有 Review Board 工程升级、页面壳不存在或需要重新生成打开入口时才运行完整 `review-board`。

新生成的正式图片或视频优先用 `generation-capture` 收口：

```powershell
.\tools\project-harness\generation-capture.ps1 record `
  --title "镜头视频：s030 走廊漂移 v2" `
  --output "bluespace/outputs/blue_space_bridge_0421/shots/s030_example/videos/s030_v002.mp4" `
  --tool imagine-cli `
  --model sd2 `
  --task-id "<task_id>" `
  --prompt "完整 prompt" `
  --ref first_frame:"bluespace/outputs/blue_space_bridge_0421/shots/s030_example/keyframes/s030_v001.png" `
  --version v002 `
  --setting resolution=1080p `
  --setting aspect_ratio=16:9 `
  --setting audio=no_audio
```

这个入口会写入 production ledger，默认把长 prompt 落到输出旁边的 `_prompts/*.md`，然后严格运行 `ledger validate` 并刷新 Review Board 数据包。它用于新生成结果；旧文件补账仍走 `ledger ingest`。

把镜头级生产素材写入 production ledger 的动作统一叫 `ingest`。如果 `shots/` 下已有镜头级生产素材没有进 Review Board，先 ingest，再刷新页面：

```powershell
.\bluespace\tools\production-ledger\ledger.ps1 ingest
.\bluespace\tools\production-ledger\ledger.ps1 enrich-recipes
.\tools\project-harness\review-board-data.ps1
```

默认会记录 `videos/` 视频、`keyframes/` 单帧、以及 `refs/` 中明显的分镜/四格/sheet/grid；会排除 `review/` 抽帧、contact sheet、preview sheet 和临时对比图。

`enrich-recipes` 会从 `shots/**/work/**/logs/video_submit_*.json` 等生成日志中补回 prompt、task_id、首帧参考和 settings；如果只运行 `ingest`，新条目可能只是 `仅摘要`。

Review Board 数据包带 `schemaVersion`，数据契约见 `review-board-data.schema.json` 和 `review-board-manifest.schema.json`。后续扩展优先追加字段，保持旧字段含义稳定。

Review Board 页面排序由 `Sort` 控件决定。默认按账本/ingest 顺序；用户可以切换为喜欢优先、时间新到旧、时间旧到新、Shot 顺序或 Review 状态。

Review Board 会把搜索、筛选项和 `Sort` 作为浏览器本地的全局显示偏好保存。刷新页面、重新生成数据包或点 `Update` 后，页面应恢复用户上一次选择的审片视角；点“重置”才回到默认视图。

Review Board 页面也提供 `Recipe` 筛选，用于区分完整配方、仅摘要和缺 prompt。完整配方的核心是 `generation.prompt` 或 `generation.prompt_file`；refs/settings/command 只能作为补充，不能替代 prompt。`ledger validate` 会对新生成但缺少 prompt/prompt_file 的图片或视频给出 warning；历史 `markdown_import` 和 `shot_media_discovery` 条目可以只有摘要。

Prompt 快速查询入口是 `_ledger/prompt-index.json`。它由 `ledger prompt-index` 生成，列出每个资产的 `output_path`、`prompt_file`、inline prompt 状态、task_id 和摘要。

Review Board 生成时会读回 `_ledger/review-decisions.jsonl`，卡片上能区分“已保存”和“待保存”。新的喜欢/不喜欢先作为浏览器本地草稿存在；已经保存过的标记可以用“取消标记”生成 `cleared` decision。页面里的 `Update` 是轻量 sync：有待保存标记时先写回 decisions，然后运行 ingest、enrich-recipes、validate，并只刷新数据包。手动排错时也可以导出待保存 JSON 后导入：

```powershell
.\tools\project-harness\review-decision.ps1 import --file "<review-marks.json>"
```

要同步更新 production ledger 的 `review.verdict`，加 `--apply-ledger`。
默认映射是 `liked -> selected`、`disliked -> rejected`、`cleared -> needs_review`。

Windows 上也可以注册一次轻量本机协议，让 Review Board 页面里的 `Update` 按钮直接触发导入和账本更新：

```powershell
.\tools\project-harness\review-decision.ps1 register-protocol
```

这个协议不是常驻服务；页面会先把当前待保存 marks JSON 放进剪贴板并下载兜底，再唤起一次 `trae-review-sync://` 脚本。脚本导入后会刷新 Review Board 数据包，手动刷新页面即可看到“已保存”状态。macOS 暂时保持手动 `import-latest` 或 `import --file`，等实机测试后再补协议入口。

`Update` 建议在系统 Chrome 里使用。Codex 内置浏览器适合预览页面，但可能拦截外部协议，因此需要回写时优先用 `review-board-open` 或 `_review/open_in_chrome.cmd` 打开页面。

## Windows 安装 Git

当前工作区优先推荐 winget：

```powershell
winget install --id Git.Git -e --source winget
```

安装完成后重启 PowerShell，再确认：

```powershell
git --version
.\tools\project-harness\doctor.ps1
```

如果不用 winget：

```powershell
scoop install git
choco install git -y
```

如果安装 Git 后 doctor 提示当前目录不是 worktree，在项目根目录初始化：

```powershell
git init
```

## macOS 安装

推荐先装 Xcode Command Line Tools 和 Homebrew，再补齐 Git 和 Node：

```bash
xcode-select --install
brew install git node
```
