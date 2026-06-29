# Pixiv Novel 小说创作工作流（历史归档）

> 迁移完成提示：本目录已迁出，不再作为默认工作流入口。生成层工作流见 `projects/story-engine/WORKFLOW.md`，工具层工作流见 `projects/story-canvas/WORKFLOW.md`。

## 启动流程

1. 读取 `AGENTS.md`、`PROJECT.md`、`WORKFLOW.md`、`_pipeline/context-routes.md` 和 `_pipeline/rule-router.md`。
2. 明确任务类型：合集整理、迁移规划、规则修正、工具维护、作品写作、章节修改、发布同步或审稿检查。
3. 按 `_pipeline/context-routes.md` 选择最小上下文；没有明确作品或章节时，不读取正文目录。
4. 只在任务触发对应流程时读取专项工作流，例如备份、自检、人物卡或 Google Docs 同步。
5. 涉及新增文件、路径整理、命名统一、迁移规划、生成结果归档或发布稿落点时，先读取 `docs/rules/path-and-naming.md`。
6. 涉及网页工具、sidecar、脚本、生成规则、prompt 或两者交接时，先读取 `docs/rules/layer-boundaries.md`，确认属于工具层、生成层还是桥接层。

## 常见任务

- 合集整理：只读项目入口、`docs/`、`_pipeline/`、`docs/rules/path-and-naming.md` 和必要目录清单，不读正文内容。
- 迁移规划：先生成迁移表，列出旧路径、新路径、引用风险、回滚方式和暂缓项；确认后再移动文件。
- 设定整理：读取目标作品的状态文件、相关设定文件和必要章节；新增事实标记为待确认。
- 故事画布：按 `_pipeline/story-canvas-workflow.md` 管理章节节点、reroll 候选、角色变化表、10章篇章和50章卷；画布节点不保存正文全文。
- 三章剧情规划：按 `_pipeline/chapter-planning-workflow.md` 和 `docs/rules/longform-generation.md` 规划每章 3000 到 6000 字、主线动作、分线动作、章节接力卡、四账本更新和章尾交付物；确认前不写正文。
- 章节续写/润色：读取目标章节、必要相邻章节、风格指南和出场人物卡；正式生成前按 `docs/rules/longform-generation.md` 填写章节接力卡，默认输出到 `outputs/`、`分支/` 或用户指定路径，不直接覆盖主干。
- 分支试写：在 `分支/<方向名>/` 下写作，不直接覆盖 `主干/`；分支人物经历应标注来源和采纳状态。
- 分支合并：先做设定一致性检查，再记录来源章节、采纳范围和替代内容。
- 发布整理：只从 `主干/` 或已确认合并的分支生成，输出到 `发布/`。
- 人物卡同步：正文新增或改动角色经历、关系、心理、状态、秘密或伏笔时，同步更新或在最终回复中列出待确认条目。
- 正文备份：覆盖、拆分、合并、格式清理、编码修复、字数统计更新前，按 `_pipeline/text-version-backup-workflow.md` 只备份本次会改动的文件。
- 章节自检：按 `_pipeline/chapter-self-check-workflow.md` 读取目标章节和必要设定，只输出设定、角色、风格、伏笔、格式、待同步项和修改建议；用户明确要求修改后再改正文。
- 首尾衔接检查：按 `_pipeline/chapter-continuity-workflow.md` 读取目标章节和必要相邻章节，检查上一章尾部与下一章开头是否串联。
- 文风质量检查：按 `_pipeline/style-quality-check-workflow.md` 读取目标作品风格指南、目标正文和人物卡，检查叙述声音、节奏、对白和设定呈现。
- 规避词表扫描：按 `_pipeline/avoidance-lexicon-workflow.md` 读取词表和目标正文，使用确定性搜索优先定位命中词。
- 文本整理：按 `_pipeline/text-organization-workflow.md` 确认目录边界、迁移表、备份和索引同步。
- 路径命名：按 `docs/rules/path-and-naming.md` 判断项目区、作品区、主干、分支、发布、prompt、review、ledger、outputs、trash 和 `_tmp/` 的生成落点。
- 工具维护：按 `docs/rules/layer-boundaries.md` 确认只修改网页工具、脚本、schema、sidecar 或工具 README；不得顺手改生成规则和 prompt。
- 生成规则或 prompt 修改：按 `docs/rules/layer-boundaries.md` 确认只修改规则、prompt、模板或范文沉淀；不得顺手改网页工具和 sidecar schema。
- 范文长篇分析：按工作区 `methods/longform-reference-analysis-workflow.md` 和本机 skill `longform-reference-analysis`，把参考文本整理为一个文本一个文件夹、结构学习、章节/篇章地图和可迁移技法总结；原文只放 `licensed-texts/` 并默认排除 Git。
- Google Docs 同步：按 `_pipeline/google-docs-clasp-sync-workflow.md` 确认来源版本、目标文档、新建/覆盖/追加策略和本机 `clasp` 环境；只在用户明确发出同步、上传或发布指令时执行。

## 记录要求

- 字数统计：每一部分/每一章正文结尾应只有一行字数统计，口径为非空白 Unicode 字符数；正文修改后必须更新。
- Prompt：重要 prompt 保存到 `prompts/`，或保存到输出旁的 `_prompts/`。
- 重要改写：记录任务目标、输入文件、输出文件、模型、版本差异和审稿结论。
- 分支合并：记录来源、目标、合并范围、删除或替代内容。
- 发布稿：记录来源章节、排版规则、上传目标和最终文件路径。
- Google Docs：记录来源路径、Google 文档标题或脱敏 ID、同步模式、排版策略、执行结果和失败项。
- 迭代账本：只对大段正文修改、章节合并、发布整理、重要审稿结论或用户明确要求记录的任务创建分章节账本；总索引 `_ledger/iteration-ledger.md` 只登记账本路径、日期、作品、版本、章节和一句话结论。

## 文件移动原则

- 不直接移动既有正文、设定和发布稿。
- 需要重排目录时，先生成迁移表，包含旧路径、目标路径、用途、是否被 skill/脚本/Google Docs 流程引用、迁移风险和回滚方式。
- 新增文件命名、生成落点和同步清单以 `docs/rules/path-and-naming.md` 为准。
- 迁移完成后，同步更新 `README.md`、`PROJECT.md`、`_pipeline/context-routes.md`、`docs/current-layout.md` 和相关作品索引。

## 临时文件原则

- 一次性脚本、临时提示词、临时合并稿、调试输出和排查中间文件统一放入 `_tmp/`。
- 禁止把 `temp_*.py`、`test.txt`、临时 HTML、临时 JSON 或临时合并稿放在项目根目录、作品根目录、`主干/`、`设定/` 或 `发布/`。
- `_tmp/` 默认不纳入 Git；需要沉淀为事实的内容应迁移到 `_ledger/`、`review/`、`prompts/`、`docs/` 或正式工具目录。

## 章节衔接检查

- 生成、润色或批量修正文稿后，检查相邻章节首尾：上一章结尾不做主题升华，下一章开头不重复上一章动作。
- 检查硬性设定说明：凡是直接解释世界观、人物定位、场景用途或关系基调的段落，优先改成物件、动作、对白或旁观反应。
- 如果用户明确要求暂缓某章，正文修改必须排除该章；可在目录、账本或待办中标记，不擅自改动正文。
- 具体检查步骤以 `_pipeline/chapter-continuity-workflow.md` 为准；文风和规避词检查分别读取 `_pipeline/style-quality-check-workflow.md` 与 `_pipeline/avoidance-lexicon-workflow.md`。
