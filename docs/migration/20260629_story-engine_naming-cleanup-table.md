# Story Engine 命名清理迁移表

日期：2026-06-29

对应计划：`docs/migration/20260629_story-engine_naming-cleanup-plan.md`

状态：已完成。本文记录实际清理批次；历史账本和 Story Canvas 运行数据暂不移动、不重命名。

## 批次 A：可复现缓存

| 状态 | 旧路径 | 新路径 | 类型 | 风险 | 操作 | 验证 |
| --- | --- | --- | --- | --- | --- | --- |
| 已完成 | `projects/story-engine/tools/scripts/__pycache__/` | 无 | Python 缓存 | 低；可由 Python 重新生成 | 已删除目录 | 清理后 `Test-Path` 为 `False` |
| 已完成 | `projects/story-engine/曲影番外二/__pycache__/` | 无 | Python 缓存 | 低；可由 Python 重新生成 | 已删除目录 | 清理后 `Test-Path` 为 `False` |

不处理项：

- `projects/story-engine/人偶番外/主干/.story-canvas-drafts/`
- `projects/story-engine/人偶番外/主干/.story-history/`

这两类目录属于 Story Canvas 草稿和历史快照，不按缓存清理。

## 批次 B：一次性脚本归档

| 状态 | 旧路径 | 新路径 | 风险 | 处理结论 |
| --- | --- | --- | --- | --- |
| 已归档 | `projects/story-engine/review/generate_report.py` | `projects/story-engine/trash/scripts/20260629_migration-legacy/generate_report.py` | 中；硬编码旧 review 输出路径 | 不作为新 review 工具；如需复用，先改造成参数化脚本。 |
| 已归档 | `projects/story-engine/曲影番外二/modify_ch2_questionnaire.py` | `projects/story-engine/trash/scripts/20260629_migration-legacy/modify_ch2_questionnaire.py` | 中；硬编码旧正文路径并写回文件 | 单轮修改脚本，移出活跃作品根。 |
| 已归档 | `projects/story-engine/曲影番外二/modify_ch3_long_marathon.py` | `projects/story-engine/trash/scripts/20260629_migration-legacy/modify_ch3_long_marathon.py` | 中；硬编码旧正文路径并写回文件 | 单轮修改脚本，移出活跃作品根。 |
| 已归档 | `projects/story-engine/曲影番外二/modify_ch3_marathon.py` | `projects/story-engine/trash/scripts/20260629_migration-legacy/modify_ch3_marathon.py` | 中；硬编码旧正文路径并写回文件 | 单轮修改脚本，移出活跃作品根。 |
| 已归档 | `projects/story-engine/曲影番外二/recount.py` | `projects/story-engine/trash/scripts/20260629_migration-legacy/recount.py` | 中；硬编码旧正文路径；字数统计口径需统一 | 不再作为字数统计入口；后续使用工作区 `tools/word-count/`。 |

## 批次 C：人物卡和原文文件改名

| 状态 | 旧路径 | 新路径 | 同步结果 |
| --- | --- | --- | --- |
| 已完成 | `projects/story-engine/曲影/原文/曲影 正文.txt` | `projects/story-engine/曲影/原文/曲影正文.txt` | 已同步角色卡来源和曲影番外二生成 prompt 引用。 |
| 已完成 | `projects/story-engine/曲影/设定/人物卡/小周 _ CFO 女性.md` | `projects/story-engine/曲影/设定/人物卡/小周_CFO女性.md` | 未发现活跃文件名引用；内容标题保留人类可读写法。 |
| 已完成 | `projects/story-engine/曲影/设定/人物卡/林振庭 _ Lin.md` | `projects/story-engine/曲影/设定/人物卡/林振庭_Lin.md` | 未发现活跃文件名引用；内容标题保留人类可读写法。 |
| 已完成 | `projects/story-engine/曲影/设定/人物卡/老周 _ Debug.md` | `projects/story-engine/曲影/设定/人物卡/老周_Debug.md` | 未发现活跃文件名引用；内容标题保留人类可读写法。 |
| 已完成 | `projects/story-engine/曲影/设定/人物卡/路人粉丝 _ “一夜七次”.md` | `projects/story-engine/曲影/设定/人物卡/路人粉丝_一夜七次.md` | 未发现活跃文件名引用；内容标题保留人类可读写法。 |
| 已完成 | `projects/story-engine/曲影/设定/人物卡/铁牛 _ Tony.md` | `projects/story-engine/曲影/设定/人物卡/铁牛_Tony.md` | 未发现活跃文件名引用；内容标题保留人类可读写法。 |
| 已完成 | `projects/story-engine/曲影/设定/人物卡/陈宇 _ “我”.md` | `projects/story-engine/曲影/设定/人物卡/陈宇_我.md` | 未发现活跃文件名引用；内容标题保留人类可读写法。 |

## 批次 D：兼容目录归档

| 状态 | 当前路径 | 处理 | 验证 |
| --- | --- | --- | --- |
| 已完成 | `projects/pixiv novel/` | 保留为历史归档/回滚入口；新增 `ARCHIVE.md` 并更新入口 README/AGENTS/PROJECT/WORKFLOW 提示 | Story Engine 已作为默认入口；活跃脚本不再写旧项目路径 |
| 已完成 | `tools/story-canvas/` | 降级为轻量兼容包装器，转发到 `projects/story-canvas/app/` | Story Canvas 当前唯一维护实现为 `projects/story-canvas/app/` |

## 本批次回滚

- 批次 A 已删除可复现缓存，回滚方式为重新运行对应 Python 脚本生成缓存。
- 批次 B 已移动到 `projects/story-engine/trash/scripts/20260629_migration-legacy/`，回滚方式为按表移回旧路径。
- 批次 C 已完成文件名映射，回滚方式为按表移回旧路径并恢复两处引用。
- 批次 D 已完成归档/包装器处理；回滚方式为恢复旧入口文档或从项目实现重新复制工具副本。
