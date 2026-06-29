# 小说大纲与整体创作辅助资源调研

调研时间：2026-06-28  
用途：为 KVA 的长篇大纲、章节规划、故事圣经、连续性检查和 agent skill 设计提供外部参考。  
结论口径：只吸收方法和流程，不复制外部模板长文；付费工具和第三方 skills 先作为候选，不默认安装。

## 立即可吸收的方法论

| 资源 | 适合吸收什么 | KVA 落点 |
| --- | --- | --- |
| [Snowflake Method](https://www.advancedfictionwriting.com/articles/snowflake-method/) | 从一句话核心逐步展开到人物、场景和章节。适合做“从核心命题到章节表”的分层生成。 | 新增“大纲金字塔”：一句话、五句段落、角色线、三章单元、章节/场景表。 |
| [Save the Cat! Writes a Novel](https://www.jessicabrody.com/2020/11/how-to-write-your-novel-using-the-save-the-cat-beat-sheet/) | 15 beat 结构，适合检查长篇宏观节奏和角色弧线。 | 作为 10 章篇章或 50 章卷的宏观节奏校验，不当硬模板。 |
| [Story Grid Foolscap](https://storygrid.com/foolscap/) | 一页故事计划，保存全局类型、核心冲突、价值变化和终点方向。 | 为每个作品建立“一页大纲卡”，放作品 `设定/` 或 `_ledger/story-canvas/`。 |
| [Reedsy Story Structure Guides](https://reedsy.com/blog/guide/story-structure/seven-point-story-structure/) | 七点结构、三幕、Save the Cat 等结构对照。 | 做结构参考索引；用于选择适合具体作品的宏观结构，而不是固定套用。 |

## 软件/平台方案

| 工具 | 关键能力 | 对 KVA 的启发 | 建议 |
| --- | --- | --- | --- |
| [Plottr](https://plottr.com/features/) | 可视时间线、故事圣经、starter templates、系列规划；官方强调拖拽时间线。 | 我们的 story-canvas 应增加“plotline/scene card”视图字段：主线、分线、角色弧、结构 beat。 | 借鉴结构，不急于迁移。 |
| [Scrivener Corkboard/Outliner](https://www.literatureandlatte.com/blog/organize-your-scrivener-project-with-the-corkboard) | 用 index cards 管场景、章节、对白、地点，并可重排。 | KVA 的章节节点可以保留“卡片摘要/场景 synopsis/可拖动顺序”字段。 | 如需人工写作 UI 可考虑；事实层仍保留 Markdown。 |
| [Campfire](https://www.campfirewriting.com/write) | 角色、时间线、地图、世界观 lore 等模块化写作/世界构建。 | 启发我们把角色、地点、关系、物件、时间线和体系拆成独立账本。 | 适合世界观复杂项目参考，不默认采用平台。 |
| [Dabble Plot Grid](https://www.dabblewriter.com/blog/new-feature-plotting) | plot grid 可独立规划，也可绑定书中场景；适合多线对齐。 | 可把 KVA 四账本扩展成“主线/分线/角色弧/风险线”网格。 | 借鉴网格理念。 |
| [World Anvil](https://www.worldanvil.com/) | wiki-like articles、互动地图、历史时间线、世界设定和小说写作工具。 | 适合借鉴“世界圣经”的索引和 wiki 化组织。 | 不迁移事实层；只借鉴 schema。 |
| [Novelcrafter](https://www.novelcrafter.com/) | AI 辅助 brainstorm/write/review，Codex/Story Bible 集成。 | 与 KVA 目标相近：故事记忆、计划、写作、审稿一体化。 | 重点研究其 Codex/Review 思路，但注意平台锁定和隐私。 |
| [yWriter](https://spacejock.com/yWriter7.html) | 免费；按 chapters/scenes 拆小说，不替作者创作。 | 强化“章节-场景”二级颗粒度，适合我们导出/互转。 | 可作为轻量外部工具候选。 |

## 候选 Agent Skills

通过 `npx skills find` 与联网搜索获得。未安装；需要先审计 `SKILL.md`、许可证、维护状态和与 KVA 事实层的兼容性。

| Skill | 发现信息 | 适合方向 | 初步判断 |
| --- | --- | --- | --- |
| [`jwynia/agent-skills@story-coach`](https://skills.sh/jwynia/agent-skills/story-coach) | CLI 显示约 781 installs；搜索结果显示 jwynia 仓库含大量 fiction/worldbuilding skills。 | 问答式写作教练，适合大纲诊断而非直接写正文。 | 值得优先审计。 |
| [`jwynia/agent-skills@story-zoom`](https://skills.sh/jwynia/agent-skills/story-zoom) | CLI 显示约 343 installs；说明强调 pitch、structure、scenes、entities、manuscript 多层同步。 | 多层级一致性检查，与 KVA “事实层/章节/人物卡”高度相关。 | 值得优先审计。 |
| [`jwynia/agent-skills@novel-revision`](https://explainx.ai/skills/jwynia/agent-skills/novel-revision) | 搜索结果称其做多层级 revision change management。 | 长篇修改后的级联影响检查。 | 可作为后续“修订治理 skill”参考。 |
| [`danjdewhurst/story-skills@story-init`](https://github.com/danjdewhurst/story-skills) | 搜索结果称其为 markdown fiction 项目格式，含 story bible、角色、世界观、plot arcs、scene state、continuity questions 等。 | 与 KVA 文件事实层很契合。 | 值得审计，尤其是目录/schema。 |
| [`danjdewhurst/story-skills@plot-structure`](https://skills.sh/danjdewhurst/story-skills/plot-structure) | CLI 显示约 161 installs；同仓库故事技能。 | 大纲结构/plot arcs。 | 与 story-init 一起审计。 |
| [`junaid18183/novel-architect-skills@novel-architect`](https://skills.sh/junaid18183/novel-architect-skills/novel-architect) | CLI 显示约 1.9K installs；但搜索到的 GitHub 资料较薄。 | 小说架构。 | 安装前必须严格审计，暂不建议直接装。 |
| [`bybren-llc/story-systems-template@story-structure`](https://lobehub.com/skills/bybren-llc-story-systems-template-story-structure) | 搜索结果称其包含 Story Architect、Dialogue Writer、Script Supervisor 等多 agent/skill。 | 大型 story system 模板。 | 可能过重；可借鉴分工，不直接套入。 |

## 建议吸收为 KVA 下一步

1. 新增“大纲金字塔工作流”：
   - 一句话核心命题。
   - 一页全局故事卡。
   - 主角/反派/关键关系弧线。
   - 三幕或 15 beat 宏观节奏。
   - 10 章篇章计划。
   - 三章单元计划。
   - 章节接力卡和场景卡。

2. 扩展 story-canvas 字段：
   - `plotline`：主线、分线、角色弧、风险线。
   - `beat`：宏观结构位置。
   - `scene_card`：场景目标、阻碍、验证物、状态变化。
   - `ledger_delta`：信息账、资源账、关系账、风险账。

3. 新建或扩展 skill：
   - 现有 `longform-reference-analysis` 负责范文学习。
   - 下一步可做 `novel-outline-architect`，负责从故事核心到卷/篇章/三章单元/章节接力卡的整体大纲生成。

4. 第三方 skill 审计顺序：
   - 先审 `jwynia/agent-skills` 的 `story-zoom`、`story-coach`、`outline-collaborator`、`reverse-outliner`。
   - 再审 `danjdewhurst/story-skills` 的 `story-init` 和 `plot-structure`。
   - 暂不安装低信息量或来源较薄的 skill。

## 初步采纳结论

- 立即采纳：Snowflake 的逐层展开、Story Grid 的一页全局卡、Plottr/Dabble 的多线网格、Scrivener 的场景卡思想。
- 谨慎参考：Save the Cat 15 beats，只做宏观节奏检查，不硬套。
- 作为软件候选：Plottr、Scrivener、Dabble、Campfire、World Anvil、Novelcrafter、yWriter。
- 作为 skill 候选：优先审计 jwynia 和 danjdewhurst 两组；不直接安装未知质量 skill。

