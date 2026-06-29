# Story Engine 迁移后命名清理计划

日期：2026-06-29

状态：已完成低风险清理、命名映射和兼容入口归档；历史账本和 Story Canvas 运行数据仍按保留边界处理。

## 背景

`projects/story-engine/` 已作为生成层默认入口，承载规则、prompt、范文学习、正文事实、审稿和账本。迁移阶段保留了旧作品目录的人工命名习惯，也保留了旧 `projects/pixiv novel/` 和 `tools/story-canvas/` 作为兼容与回滚入口。

本计划用于把迁移后发现的命名和路径问题分层处理，避免一次性批量改名影响正文、sidecar、发布稿、账本和工具引用。

## 执行底线

- 未建立迁移表前，不重命名正文、设定、发布稿、账本、sidecar 和工具数据。
- 不批量改写历史账本中的旧路径；历史账本记录当时事实，除非它被当前工具直接读取。
- 不把 `projects/pixiv novel/` 和 `tools/story-canvas/` 直接删除；归档前先确认没有活跃引用，并保留回滚说明。
- Story Canvas 运行数据不按普通临时文件清理：`.story-history/`、`.story-canvas-drafts/` 和 `*.story.json` 默认保留。
- 每次真实移动或改名前，先列出旧路径、新路径、受影响引用、备份位置、验证命令和回滚方式。

## 当前发现

| 类型 | 发现 | 处理判断 |
| --- | --- | --- |
| 缓存目录 | `projects/story-engine/tools/scripts/__pycache__/`、`projects/story-engine/曲影番外二/__pycache__/` | 可作为后续安全清理候选；执行前再确认没有调试产物需要保留。 |
| Story Canvas 运行数据 | `projects/story-engine/人偶番外/主干/.story-canvas-drafts/`、`projects/story-engine/人偶番外/主干/.story-history/` | 保留；属于画布草稿和历史快照，不纳入普通命名清理。 |
| 一次性脚本 | `projects/story-engine/review/generate_report.py`，以及 `projects/story-engine/曲影番外二/modify_ch2_questionnaire.py`、`modify_ch3_long_marathon.py`、`modify_ch3_marathon.py`、`recount.py` | 先确认是否仍可复用。可复用则迁入作品内 `tools/` 或项目 `tools/scripts/`；不可复用则归档到 `trash/scripts/`。 |
| 含空格或引号的人物卡 | `projects/story-engine/曲影/设定/人物卡/小周 _ CFO 女性.md`、`林振庭 _ Lin.md`、`老周 _ Debug.md`、`路人粉丝 _ “一夜七次”.md`、`铁牛 _ Tony.md`、`陈宇 _ “我”.md` | 需要迁移表和引用扫描；不直接改名。 |
| 含空格的原文文件 | `projects/story-engine/曲影/原文/曲影 正文.txt` | 可继续保留为人类阅读文件；若改名，需要同步来源说明和所有引用。 |
| 兼容目录 | `projects/pixiv novel/`、`tools/story-canvas/` | 已处理；旧小说项目标记为历史归档/回滚入口，旧 Story Canvas 工具目录降级为轻量包装器。 |
| 生成型工具产物 | Google Apps Script `Content.js` 可能含生成后的正文和路径常量 | 不作为规则事实层；如需更新，优先从同步工具重新生成。 |
| 历史账本旧路径 | `_ledger/iterations/` 内存在早期 `projects/pixiv novel/` 记录 | 保留历史事实；不做机械替换。 |

## 建议清理顺序

### 第一阶段：只读盘点

- 补一份实际迁移表：列出每个候选旧路径、新路径、引用位置、风险等级和是否需要用户确认。
- 对正文、设定、发布稿和 story sidecar 分别跑引用扫描，避免遗漏 `.story.json`、发布清单和工具脚本。
- 建立本阶段备份目录，例如 `projects/story-engine/_backups/20260629_naming-cleanup/`。

### 第二阶段：缓存与明显临时物

- 清理 `__pycache__/` 这类可复现缓存。
- 清理前后记录目录快照，不把缓存清理写成正文迁移。
- 不处理 `.story-history/`、`.story-canvas-drafts/` 和 `.story.json`。

### 第三阶段：一次性脚本归位

- 逐个读取脚本头部和调用路径，判断是否仍依赖旧作品结构。
- 可复用脚本进入 `projects/story-engine/tools/scripts/`，并更新 `projects/story-engine/_pipeline/tool-index.json`。
- 单作品、单轮使用脚本归入对应作品 `trash/scripts/` 或 `_tmp/`，保留简短说明。

### 第四阶段：人物卡和原文文件改名

- 只在确认引用表后执行。
- 文件名优先去除空格、英文引号和弯引号；中文角色名保留。
- 改名后同步更新作品 README、设定索引、引用清单、Story Canvas 侧引用和相关 prompt。

候选映射草案：

| 当前路径 | 候选路径 | 执行前必须同步 |
| --- | --- | --- |
| `projects/story-engine/曲影/原文/曲影 正文.txt` | `projects/story-engine/曲影/原文/曲影正文.txt` | 来源说明、作品 README、任何导入脚本或索引。 |
| `projects/story-engine/曲影/设定/人物卡/小周 _ CFO 女性.md` | `projects/story-engine/曲影/设定/人物卡/小周_CFO女性.md` | 人物卡索引、角色关系总览、prompt 引用。 |
| `projects/story-engine/曲影/设定/人物卡/林振庭 _ Lin.md` | `projects/story-engine/曲影/设定/人物卡/林振庭_Lin.md` | 人物卡索引、角色关系总览、prompt 引用。 |
| `projects/story-engine/曲影/设定/人物卡/老周 _ Debug.md` | `projects/story-engine/曲影/设定/人物卡/老周_Debug.md` | 人物卡索引、角色关系总览、prompt 引用。 |
| `projects/story-engine/曲影/设定/人物卡/路人粉丝 _ “一夜七次”.md` | `projects/story-engine/曲影/设定/人物卡/路人粉丝_一夜七次.md` | 人物卡索引、角色关系总览、prompt 引用。 |
| `projects/story-engine/曲影/设定/人物卡/铁牛 _ Tony.md` | `projects/story-engine/曲影/设定/人物卡/铁牛_Tony.md` | 人物卡索引、角色关系总览、prompt 引用。 |
| `projects/story-engine/曲影/设定/人物卡/陈宇 _ “我”.md` | `projects/story-engine/曲影/设定/人物卡/陈宇_我.md` | 人物卡索引、角色关系总览、prompt 引用。 |

### 第五阶段：兼容目录归档

- 先验证 Story Engine 和 Story Canvas 连续使用新路径。
- 将旧 `projects/pixiv novel/` 标记为兼容归档入口，而不是直接删除。
- 旧 `tools/story-canvas/` 仅在确认没有用户脚本或快捷入口依赖后归档。
- 归档动作要同步更新根 README、`docs/current-layout.md`、Story Canvas README 和迁移设计文档。

## 验证清单

每次真实改名或归档后至少执行：

```powershell
rg -n "projects/pixiv novel|pixiv novel|Pixiv Novel" projects/story-engine --glob "!_ledger/iterations/**"
rg -n "projects/pixiv novel|pixiv novel|Pixiv Novel" projects/story-canvas
node --check projects/story-canvas/app/server.mjs
node --check projects/story-canvas/app/build-canvas-import.mjs
node --check projects/story-engine/tools/google-docs-sync/upload-markdown-to-drive-doc.js
```

如涉及正文或发布稿，还需要按工作区规则调用 `tools/word-count/word-count.ps1` 或 `tools/word-count/word-count.mjs` 更新字数统计口径。

## 回滚方式

- 正文、设定、发布稿和 sidecar 改名前，先复制到 `_backups/<date>_<task>/`。
- 每次移动只做一批同类文件，并记录 PowerShell 绝对路径。
- 如果 Story Canvas 扫描节点数、发布清单或引用扫描异常，立即恢复本批文件名并保留失败记录。
- 历史兼容目录在确认归档完成前不删除，因此旧路径可作为人工比对入口。

## 本轮结论

本轮已完成迁移后的低风险清理：删除可复现缓存，归档硬编码旧路径的一次性脚本，完成曲影原文和人物卡文件名映射，并将旧兼容入口降级为历史归档/包装器。后续更大范围的作品内部改名仍需按批次迁移表执行。
