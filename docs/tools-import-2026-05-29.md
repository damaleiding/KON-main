# Tools 导入记录 2026-05-29

## 导入来源

- E:/trae/NEWG-main/tools：工作区 harness、Imagine、AE、Nuke、Git、Swift 视频/分镜工具。
- E:/trae/NEWG-main/bluespace/tools/production-ledger：生产账本工具。
- E:/trae/KVA-main/projects/A1video/tools：prompt audit 与 HTML 报告工具。
- E:/trae/KVA-main/projects/Imagebatch/tools：批量图像生成、provider adapter 与 harness 工具。
- E:/trae/ai-debate：多专家辩论和 SearXNG helper。
- E:/trae/GUIsplit：UI 拆图和合成脚本。
- E:/trae/Corridorkey：视频/绿幕 keying 源码，排除权重和媒体。
- E:/trae/midjourney：Midjourney proxy 服务源码与轻量客户端。
- E:/trae/GUIkiller：GUI 结果保存轻量脚本。

## 排除内容

导入时排除了：

- `node_modules/`、`venv/`、`__pycache__/`、`.git/`。
- `cache/`、`tmp/`、`logs/`、`output/`、`outputs/`。
- `.env`、本机 local 配置、密钥类文件。
- 图片、视频、PSD、EXR、压缩包、安装包和模型权重目录。

## 注意事项

- 部分工具仍保留原项目 README 或旧路径，需要使用前适配 KVA。
- project-harness 与 production-ledger 是最核心的下一步适配对象。
- prompt-audit 和 imagebatch-toolkit 当前是“提升副本”，原项目内工具仍保留。
- 外部服务型工具不代表已配置账号或密钥，只保存源码和启动参考。
