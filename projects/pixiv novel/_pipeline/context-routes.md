# Novel 上下文路由

## 通用入口

- 项目规则：`AGENTS.md`
- 项目记忆：`PROJECT.md`
- 工作流：`WORKFLOW.md`
- 人类纲要：`novel_project-brief.html`
- 项目说明：`README.md`
- 人物卡同步：`_pipeline/character-card-workflow.md`
- Gemini 辅助写作：`_pipeline/gemini-assisted-writing-workflow.md`
- Google Docs 同步：`_pipeline/google-docs-clasp-sync-workflow.md`
- 正文版本备份：`_pipeline/text-version-backup-workflow.md`
- 章节自检：`_pipeline/chapter-self-check-workflow.md`

## 作品入口

| 任务对象 | 优先读取 | 说明 |
| --- | --- | --- |
| 人偶番外 | `人偶番外/设定/`、`人偶番外/主干/` | 涉及角色时读 `人偶番外/设定/角色卡.md` 或独立人物卡；涉及重设、增补或发布时再读对应 `分支/`、`发布/`。 |
| 曲影 | `曲影/设定/`、`曲影/主干/` | 涉及角色时读 `曲影/设定/角色卡.md` 或独立人物卡；润色任务优先读取 `曲影/主干/润色稿/`。 |
| 曲影番外二 | `曲影番外二/设定/`、`曲影番外二/主干/拆章原文/` | 涉及角色时读 `曲影番外二/设定/角色卡.md` 和 `曲影番外二/设定/人物卡/`；检查章节时必须读取章节自检工作流。 |
| 柠檬 | `柠檬/设定/`、`柠檬/主干/` | 涉及角色时读 `柠檬/设定/人物卡/` 或现有设定；新作或替代路线任务再读取 `柠檬/分支/`。 |

## 任务路由

- 设定整理：先读目标作品 `设定/`，再读相关 `主干/` 章节。
- 章节润色：先读目标章节，再读同作品 `风格指南.md`、出场人物卡、`当前状态.md`。
- 续写：先读最近主干章节、`故事圣经.md`、`伏笔表.md`、出场人物卡、`当前状态.md`。
- 分支合并：先读目标 `分支/`、对应 `主干/`、出场人物卡、`设定/分支记录.md` 或同类记录。
- 发布整理：先读 `主干/`、`发布/` 和发布目标要求，不直接从实验分支生成。
- 工具维护：先读 `90_工具/` 和 `_pipeline/tool-index.json`。
- Gemini 辅助写作：先读 `_pipeline/gemini-assisted-writing-workflow.md`，再按目标作品读取设定、主干或分支。
- Google Docs 同步：先读 `_pipeline/google-docs-clasp-sync-workflow.md`，再确认同步来源、目标文档和 `clasp` 环境。
- 人物卡同步：先读 `_pipeline/character-card-workflow.md`，再读取或创建对应角色的独立人物卡。
- 章节自检/生成后复查：先读 `_pipeline/chapter-self-check-workflow.md`，再读目标章节、目标作品 `故事圣经.md`、`风格指南.md`、`当前状态.md`、`伏笔表.md`、`分支记录.md`、`角色卡.md` 和出场角色人物卡。
- 正文修改、拆分、合并、格式清理、编码修复、字数统计更新：先读 `_pipeline/text-version-backup-workflow.md`，并只备份本次会改动的文件。

## 迁移原则

- 现阶段不移动既有作品目录。
- 需要移动时，先在 `docs/` 中生成迁移表。
- 迁移表至少包含旧路径、目标路径、文件用途、引用风险和迁移状态。
