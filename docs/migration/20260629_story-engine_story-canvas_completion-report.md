# Story Engine / Story Canvas 迁移完成报告

日期：2026-06-29

## 完成标准

- Story Engine 是生成层默认入口。
- Story Canvas 是网页工具层默认入口。
- 旧小说项目目录仅保留为历史归档/回滚入口。
- 旧 Story Canvas 工具目录不再保留第二套实现，只保留兼容包装器。
- 活跃工具脚本不再写入旧小说项目路径。
- 迁移后的命名清理、工具索引、执行表和验证记录已经落盘。

## 已完成事项

- `projects/story-engine/` 已承接生成规则、prompt、refs 索引/analysis、review、账本、辅助工具和四个已写作品目录。
- `projects/story-canvas/` 已承接 Story Canvas app、数据契约、测试流程、账本和浏览器验证记录。
- `tools/story-canvas/` 已降级为兼容包装器，转发到 `projects/story-canvas/app/`。
- `projects/pixiv novel/` 已新增归档提示，入口文档标明不再作为默认工作入口。
- `projects/story-engine/_pipeline/tool-index.json` 已建立。
- 迁移后清理表已更新到 `docs/migration/20260629_story-engine_naming-cleanup-table.md`。
- 曲影原文文件和 6 个人物卡文件已完成稳定命名映射。
- 两个 Python `__pycache__/` 缓存目录已清理。
- 5 个硬编码旧路径的一次性脚本已归档到 `projects/story-engine/trash/scripts/20260629_migration-legacy/`。
- `refs/范文参考/` 下的抓取脚本已改为相对路径，cookie 文件改为通过环境变量传入。

## 验证结果

- 活跃 Python / JS / MJS / PowerShell 脚本中未命中旧小说项目路径或本机 cookie 路径。
- 已重命名的曲影原文与人物卡旧文件名不再出现在 Story Engine 活跃文档中。
- `tools/tool-index.json`、`projects/story-engine/_pipeline/tool-index.json`、`projects/story-canvas/_pipeline/tool-index.json` 均可解析。
- `projects/story-canvas/app/server.mjs`、`projects/story-canvas/app/build-canvas-import.mjs`、`tools/story-canvas/server.mjs`、`tools/story-canvas/build-canvas-import.mjs` 和 Google Docs 上传脚本均通过 `node --check`。
- `http://127.0.0.1:4307/api/health` 返回 `ok: true`，默认根为 `projects/story-engine/人偶番外/主干`。
- 旧 `tools/story-canvas/server.mjs` 包装器已在临时端口 `4311` 启动验证，health 正常；验证后临时进程已停止。
- Story Engine 下未残留 `__pycache__/`。

## 保留边界

- 历史 iteration 账本和历史 review 中的旧路径不批量改写，它们记录迁移前事实。
- `refs/范文参考/**/licensed-texts/` 未批量迁入；后续按授权、体积和忽略规则逐项处理。
- Story Canvas 的 `.story-history/`、`.story-canvas-drafts/` 和 `*.story.json` 保留在正文同目录，不按普通临时文件清理。

## 后续维护

- 新生成、润色、审稿、发布整理和 prompt 维护默认进入 Story Engine。
- 新 UI、server、sidecar、历史回滚和浏览器测试默认进入 Story Canvas。
- 旧目录只在历史对照、回滚和人工核查时读取。
