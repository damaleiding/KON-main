# Pixiv Novel 上下文路由

## 路由原则

- 本项目是统一小说创作项目，但不默认读取所有作品正文。
- 先判断任务对象，再读取最小必要文件；能通过索引、状态文件和目录清单解决的任务，不读取章节正文。
- `_backups/`、`review/`、`.trae/skills/`、`refs/范文参考/`、`_tmp/` 仅在任务明确要求时读取。
- 需要跨作品复用经验时，先读取项目级方法和目标作品轻量入口，再决定是否进入正文。

## 通用入口

- 项目规则：`AGENTS.md`
- 项目记忆：`PROJECT.md`
- 工作流：`WORKFLOW.md`
- 人类纲要：`novel_project-brief.html`
- 项目说明：`README.md`
- 当前目录映射：`docs/current-layout.md`
- 人物卡同步：`_pipeline/character-card-workflow.md`
- Gemini 辅助写作：`_pipeline/gemini-assisted-writing-workflow.md`
- Google Docs 同步：`_pipeline/google-docs-clasp-sync-workflow.md`
- 正文版本备份：`_pipeline/text-version-backup-workflow.md`
- 章节自检：`_pipeline/chapter-self-check-workflow.md`

## 作品入口

| 任务对象 | 轻量入口 | 正文入口 | 说明 |
| --- | --- | --- | --- |
| 曲影番外二 | `曲影番外二/README.md`、`曲影番外二/设定/当前状态.md`、`曲影番外二/设定/分支记录.md` | `曲影番外二/主干/拆章原文/`、`曲影番外二/发布/GoogleDocs/` | 当前重点生产作品；优先沉淀可复用流程和提示词。 |
| 人偶番外 | `人偶番外/设定/当前状态.md`、`人偶番外/设定/分支记录.md`、`人偶番外/设定/目录结构.md` | `人偶番外/主干/`、指定 `分支/` 或 `发布/` | 涉及角色时读 `人偶番外/设定/角色卡.md` 或 `人偶番外/设定/人物卡/`。 |
| 曲影 | `曲影/设定/故事圣经.md`、`曲影/设定/风格指南.md`、`曲影/设定/人物卡/` | `曲影/主干/润色稿/` 或指定原文 | 适合作为曲影系列基础设定来源；不要默认读取全部原文。 |
| 柠檬 | `柠檬/设定/当前状态.md`、`柠檬/设定/分支记录.md`、`柠檬/设定/故事圣经.md` | `柠檬/主干/拆章原文/` 或 `柠檬/分支/新作/` | 涉及角色时读 `柠檬/设定/人物卡/`。 |

## 任务路由

- 规则修正：读项目入口、`docs/current-layout.md` 和相关 `_pipeline/` 文件，不读正文。
- 目录整理：读目录清单、`README.md`、`PROJECT.md`、`docs/current-layout.md`，必要时读 `_pipeline/tool-index.json`。
- 方法沉淀：先读已验证来源作品的轻量入口、相关 prompt、审稿记录或流程文件，再抽象到项目级 `docs/`、`prompts/` 或 `_pipeline/`。
- 结构调整：读目录清单、作品轻量入口、`_ledger/iteration-ledger.md`、工具索引和可能引用路径；正文内容按需读取。
- 设定整理：先读目标作品轻量入口和相关设定文件，再按需要读取目标章节。
- 章节润色：先读目标章节，再读必要相邻章节、目标作品 `风格指南.md`、`当前状态.md` 和出场人物卡。
- 续写：读最近主干章节、目标作品 `故事圣经.md`、`伏笔表.md`、`当前状态.md` 和出场人物卡。
- 分支合并：读目标 `分支/`、对应 `主干/`、`设定/分支记录.md` 和必要人物卡。
- 发布整理：读来源 `主干/` 或已确认分支、`发布/` 和发布目标要求，不直接从实验分支生成。
- 工具维护：读 `90_工具/`、`_pipeline/tool-index.json` 和工具自身 README，不读作品正文。
- Gemini 辅助写作：先读 `_pipeline/gemini-assisted-writing-workflow.md`，再按目标作品读取设定、主干或分支。
- Google Docs 同步：先读 `_pipeline/google-docs-clasp-sync-workflow.md`，再确认同步来源、目标文档和 `clasp` 环境。
- 人物卡同步：先读 `_pipeline/character-card-workflow.md`，再读取或创建对应角色的独立人物卡。
- 章节自检/生成后复查：先读 `_pipeline/chapter-self-check-workflow.md`，再读目标章节、目标作品必要设定和出场角色人物卡。
- 正文修改、拆分、合并、格式清理、编码修复、字数统计更新：先读 `_pipeline/text-version-backup-workflow.md`，并只备份本次会改动的文件。

## 结构调整原则

- 现阶段保留统一项目入口和既有作品目录。
- 需要移动时，先在 `docs/` 中生成迁移表。
- 迁移表至少包含旧路径、目标路径、文件用途、引用风险、回滚方式和迁移状态。
