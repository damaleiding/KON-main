---
description: trae_projects 跨主机运行规则。
---

# Cross-Host Runtime

这个项目会在不同 Windows/macOS 主机、不同用户目录，甚至不同 Codex/Trae 环境中打开。harness 的目标不是记住某台机器，而是从仓库根目录自举。

## 核心规则

- 可提交脚本必须通过仓库根目录定位文件，不写死某台机器的用户目录。
- 账本、manifest、review 记录和 Markdown 生产记录优先使用项目相对路径。
- 主机专属信息放入 `.local` 文件或环境变量，不提交到 Git。
- 新机器先跑 project doctor，再开始生产任务。
- Windows 使用 `.ps1` 入口，macOS 使用 `.sh` 入口；核心逻辑放在同一个 Node 脚本里。
- 如果 Node 或 Git 不在 PATH，入口脚本应给出安装提示，而不是静默失败。
- 文本换行、Shell 脚本和媒体资产由 `.gitattributes` 约束，避免 Windows/macOS 之间反复改换行或误提交大文件。

## 新机器最小部署

Windows 在仓库根目录执行：

```powershell
.\tools\project-harness\doctor.ps1
```

macOS 在仓库根目录执行：

```bash
./tools/project-harness/doctor.sh
```

Windows 如果缺 Git：

```powershell
winget install --id Git.Git -e --source winget
```

Windows 如果缺 Node：

```powershell
winget install --id OpenJS.NodeJS.LTS -e --source winget
```

macOS 如果缺 Git 或 Node：

```bash
xcode-select --install
brew install git node
```

Windows 安装完成后重启 PowerShell，再运行：

```powershell
git --version
node --version
.\tools\project-harness\doctor.ps1
```

macOS 安装完成后新开终端，再运行：

```bash
git --version
node --version
./tools/project-harness/doctor.sh
```

## 本地配置

Windows 可复制模板：

```powershell
Copy-Item .\tools\project-harness\host.local.example.json .\tools\project-harness\host.local.json
```

macOS 可复制模板：

```bash
cp tools/project-harness/host.local.example.json tools/project-harness/host.local.json
```

`host.local.json` 不提交到仓库。它用于记录本机工具路径、缓存目录或外部应用位置。脚本读取它时必须有合理默认值，不能让跨主机运行必须依赖某台机器的配置。

## 脚本入口

Windows:

```powershell
.\tools\project-harness\doctor.ps1
.\tools\project-harness\self-test.ps1
.\tools\project-harness\reference-index.ps1
.\tools\project-harness\context-index.ps1
.\tools\project-harness\generation-capture.ps1 record --title "<title>" --output "<asset>" --tool "<tool>" --model "<model>" --prompt-file "<prompt.md>"
.\tools\project-harness\media-card.ps1 --from-ledger --review selected
.\tools\project-harness\review-board.ps1
.\tools\project-harness\review-board-data.ps1
.\tools\project-harness\review-board-open.ps1
.\tools\project-harness\review-decision.ps1 import --file "<review-marks.json>"
.\bluespace\tools\production-ledger\ledger.ps1 validate
```

macOS:

```bash
./tools/project-harness/doctor.sh
./tools/project-harness/self-test.sh
./tools/project-harness/reference-index.sh
./tools/project-harness/context-index.sh
./tools/project-harness/generation-capture.sh record --title "<title>" --output "<asset>" --tool "<tool>" --model "<model>" --prompt-file "<prompt.md>"
./tools/project-harness/media-card.sh --from-ledger --review selected
./tools/project-harness/review-board.sh
./tools/project-harness/review-board-data.sh
./tools/project-harness/review-board-open.sh
./tools/project-harness/review-decision.sh import --file "<review-marks.json>"
./bluespace/tools/production-ledger/ledger.sh validate
```

Review Board 的 `_review/` 输出是主机本地生成物，不提交到 Git。换到 macOS 或另一台 Windows 后先运行完整 `review-board` 生成页面壳；之后普通账本/decision 更新只运行 `review-board-data` 刷新数据包。它会根据当前主机根目录写入本机可点击的 `file://` 媒体链接，并从 `_ledger/review-decisions.jsonl` 读回已保存标记。

`generation-capture` 只把项目相对路径写进 ledger，prompt 文件也必须在项目内。换主机后只要媒体文件和 prompt 文件随项目一起存在，账本和 Review Board 就能重新生成；不要把某台机器的绝对路径写进 `--output`、`--prompt-file` 或 `--ref`。

需要系统 Chrome 参与回写时，优先用 `review-board-open` 打开页面。它会先刷新 Review Board 数据包，再把 `_review/index.html` 交给当前主机的 Google Chrome。生成物里也会带 `_review/open_in_chrome.cmd` 和 `_review/open_in_chrome.command`，用于在文件管理器里双击打开。

Windows 的 `trae-review-sync://` 是可选的本机协议触发器，用来从 Review Board 页面一键导入 marks JSON。它属于当前用户、当前主机配置，不是项目硬依赖；换主机后如果需要页面按钮回写，再运行一次：

```powershell
.\tools\project-harness\review-decision.ps1 register-protocol
```

macOS 协议入口等实机验证后再加入；当前保持 `review-decision.sh import-latest` 或 `import --file`。

如果 macOS 提示脚本没有执行权限：

```bash
chmod +x tools/project-harness/doctor.sh tools/project-harness/self-test.sh tools/project-harness/reference-index.sh tools/project-harness/context-index.sh tools/project-harness/generation-capture.sh tools/project-harness/media-card.sh tools/project-harness/review-board.sh tools/project-harness/review-board-data.sh tools/project-harness/review-board-open.sh tools/project-harness/review-decision.sh bluespace/tools/production-ledger/ledger.sh
```

如果需要给新机器做 harness 回归检查，先跑 doctor，再跑 self-test：

```bash
./tools/project-harness/doctor.sh
./tools/project-harness/self-test.sh
```

## 资产路径原则

正确：

```text
bluespace/outputs/blue_space_bridge_0421/_ledger/production-ledger.jsonl
bluespace/outputs/blue_space_bridge_0421/shots/s270_n27_eye_loses_focus/videos/example.mp4
```

避免：

```text
<user-home>\Documents\trae_projects\bluespace\outputs\...
```

如果需要在交互回复里给用户可点击路径，可以使用绝对路径；但脚本、账本和可复用 Markdown 规范里应该保留项目相对路径。

## 文件名和大小写

不要创建只靠大小写区分的文件名，例如 `Shot.md` 和 `shot.md`。Windows 和默认 macOS 文件系统通常大小写不敏感，容易在同步和 Git checkout 时冲突。
