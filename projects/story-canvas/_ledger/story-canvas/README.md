# Story Canvas Ledger

本目录保存故事画布的索引、schema、节点版本和 reroll 记录。它不保存正文全文。

## 建议文件

- `story-canvas.schema.json`：画布数据结构。
- `canvas-index.json`：项目当前画布索引。
- `人偶番外.canvas.json`：人偶番外正式编辑线画布导入包，包含 20 个剧情节点、来源路径、行号和字数统计。
- `reroll-log.md`：节点 reroll 记录。
- `volume-direction-locks.md`：卷核心方向锁定与变更提案。

## 边界

- 画布节点只保存规划、状态、角色变化表和版本索引。
- 正文仍放在作品 `主干/`、`分支/`、`outputs/` 或用户指定路径。
- 人物卡稳定事实仍放在作品 `设定/人物卡/`。
