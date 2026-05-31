# KVA Tools

`tools/` 保存 KVA 工作区级可复用工具。这里的工具可以服务多个 `projects/<project-name>/`，不应该绑定单个项目的输出目录、媒体资产或聊天上下文。

## 使用原则

- 优先读取 `tools/tool-index.json` 判断是否需要加载某个工具。
- 不把大型媒体、模型权重、缓存、日志、依赖目录和本机密钥放进 `tools/`。
- 从旧项目提升的工具，必须逐步清理绝对路径、项目专属术语和硬编码输出目录。
- 工具被项目使用后，应在该项目 `_pipeline/tool-index.json` 里登记入口。

## 工具清单

| 工具 | 分类 | 用途 | 状态 |
| --- | --- | --- | --- |
| project-harness | workflow | 工作区 doctor/self-test、上下文索引、参考图索引、Review Board、media manifest、generation capture、token meter | imported-needs-kva-adaptation |
| word-count | text | 字数统计 CLI；用于章节、稿件、目录文本长度统计，Agent 遇到字数需求必须调用 | active |
| production-ledger | ledger | JSONL 生产账本、ingest、validate、find、recipe、prompt index | imported-needs-kva-adaptation |
| imagine-cli-healthcheck | generation | Imagine CLI 登录态、网络、DNS、TLS、VPN 与真实提交链路检查 | imported |
| imagine-video-async | generation | sd2 视频异步 submit/status/fetch、manifest 与媒体校验 | imported |
| imagebatch-toolkit | generation | 批量图像生成 provider、GPT Image 2 路由、Liblib adapter、命名和 harness 校验 | promoted-from-project |
| prompt-audit | prompt | 视频 prompt 审计、HTML 报告抽取、禁用项/覆盖项校验、词条模板 | promoted-from-project |
| after-effects-js | dcc | AE ExtendScript 脚本：抽帧、掉帧、运动拖影、脚本模板 | imported |
| nuke-auto-keyer | dcc | Nuke 自动 keying 工程生成 | imported-needs-path-cleanup |
| nuke-alpha-avi-exporter | dcc | Nuke alpha AVI / Sofdec 相关导出 | imported-needs-path-cleanup |
| git-workflow | workflow | Git 提交前检查与核心文件暂存辅助 | imported-needs-kva-adaptation |
| animatic-maker | storyboard | 分镜 animatic/GIF 生成辅助 | imported-macos-only |
| storyboard-panel-strip | storyboard | 分镜 panel strip 导出辅助 | imported-macos-only |
| video-concat | video | 视频拼接辅助 | imported-macos-only |
| ai-debate | research | 多专家辩论 CLI 与 SearXNG helper | imported-lightweight |
| gui-split | ui-art | HTML UI 组件截图拆分、透明/实色背景合成 | imported-lightweight |
| corridorkey | video-keying | 绿幕/视频抠像与 AI unmixing/keying 工具源码 | imported-without-weights-media |
| midjourney-proxy | generation-service | Midjourney Discord API 代理服务源码 | imported-without-logs-media |
| midjourney-proxy-clients | generation-service | Midjourney proxy Python 客户端/生成脚本 | imported-lightweight |
| gui-result-saver | ui-art | GUI 结果保存脚本，可作为 UI 生成/拆图流程的结果落盘辅助 | imported-lightweight |

## 状态说明

- imported：已导入，基本可按原 README 使用。
- active：已适配 KVA，可直接用于当前工作区。
- promoted-from-project：从 KVA 项目内提升出来，需要后续继续参数化。
- imported-needs-kva-adaptation：已导入，但还需要把旧项目路径改为 KVA 通用路径。
- imported-needs-path-cleanup：已导入，但使用前要检查本机绝对路径和 DCC 软件路径。
- imported-macos-only：当前 Windows 环境保留源码，运行依赖 macOS/Swift。
- imported-lightweight：只导入轻量源码/脚本，排除了环境、缓存、输出和密钥。
- imported-without-weights-media：只导入源码，模型权重和媒体输入输出需要外部管理。

## 后续整理优先级

1. 先适配 project-harness 和 production-ledger 到 KVA 项目结构。
2. 再把 prompt-audit 与 imagebatch-toolkit 参数化成正式 CLI。
3. 然后按需清理 DCC 工具中的绝对路径和软件安装路径。
4. 最后为外部服务型工具补 README.kva.md 和最小启动示例。
