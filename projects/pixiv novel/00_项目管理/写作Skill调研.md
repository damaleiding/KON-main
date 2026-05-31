# 写作 Skill 调研

## 已安装且可用

- `小说作者助手`：本项目已有的小说综合助手，适合大纲、角色、世界观、续写、逻辑检查和润色。
- `曲影润色助手`：面向 `曲影` 的定制润色助手，适合保持冷感现实风格与章节拆分输出。
- `各干各的`：可用于两阶段润色或多模型协作处理。
- `claude-gemini-cli`：可调 Claude/Gemini CLI 做第二意见、审稿、结构检查或风格对照。

## 外部检索结果

- FeelFish 的小说创作 skill 指南强调技能应包含 `SKILL.md`、`references/`、`assets/`、`scripts/`，并适合把人物设定、写作风格和叙事逻辑固化为可复用流程。
- GitHub `mave99a/novel-skill` 提供了 `novel-creator` 思路，重点是从故事概念到章节计划再到 EPUB 的完整流程，并支持中文小说优化。
- Trae 论坛的 `fanqie-novel-skill` 思路值得借鉴：用 `story_bible.md`、`current_state.md`、`pending_hooks.md`、`character_matrix.md`、`style_guide.md` 这类 Truth Files 追踪长篇状态。
- 小说工作台类实践普遍采用结构化目录：`设定/`、`正文/`、`大纲.md`、`.snapshots/`、`.agent/`，重点是让 AI 每次调用时读取精准上下文。
- 写作工具文章普遍建议建立 Story Bible，集中维护角色、世界观、剧情线、风格规则和连续性信息。

## 对本项目的建议

- 继续保留现有 `小说作者助手` 作为主控 skill。
- 新增一个偏“项目纪律层”的 skill，用来维护主干/分支、伏笔表、状态表、发布清单。
- 为每个作品补齐四个长期文件：`故事圣经.md`、`当前状态.md`、`伏笔表.md`、`风格指南.md`。
- 写新章前先读 `设定/` 和 `当前状态.md`，写完后更新状态与伏笔。
- 分支合并前执行一次一致性检查，再进入主干。

## 候选 Skill 方向

- `长篇状态管理员`：维护当前状态、角色状态、伏笔开关、时间线和分支合并记录。
- `章节审稿官`：检查 AI 味、人物 OOC、设定冲突、节奏拖沓和伏笔断裂。
- `发布整理助手`：把主干章节合并成上传稿，统一标题、顺序、字数统计和排版。
- `分支合并助手`：对比主干与分支，标出可合并段落、冲突点和保留建议。

## 参考链接

- FeelFish 小说创作技能构建指南：https://www.feelfish.com/zh/resources/docs/build-skills-for-novel
- Novel Creator Skill：https://github.com/mave99a/novel-skill
- Trae 番茄小说 Skill 案例：https://forum.trae.cn/t/topic/17215
- Trae 小说写作工作台案例：https://forum.trae.cn/t/topic/15623
- Sudowrite Story Bible 思路：https://sudowrite.com/blog/best-ai-for-fantasy-writers-worldbuilding-without-the-chaos/
