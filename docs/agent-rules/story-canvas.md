# 小说故事画布规则

## 目标

故事画布把线性章节管理扩展为可视化节点管理：每一章是一个剧情节点，节点之间用主线、分线、伏笔、角色关系和发布依赖连接。画布只保存索引、规划、状态和版本记录，不保存正文全文。

## 工具层与生成层边界

- 故事画布、网页 UI、sidecar、画布账本和历史快照属于工具层，负责记录选区、节点、候选、用户方向意见和同步状态。
- 章节生成规则、prompt 模板、写作质量门和生成后自检属于生成层，应维护在项目规则、prompt 目录或模板目录。
- 工具层只把 `prompt_goal`、`user_directive`、reroll 目标、锚点和候选状态作为桥接数据交给生成层，不拥有生成规则本身。
- 修改网页工具或 sidecar schema 时，不顺手修改长篇生成规则和 prompt；修改生成规则或 prompt 时，不顺手修改网页工具和 sidecar 结构。
- 具体项目可用 `docs/rules/layer-boundaries.md` 进一步约束两层边界。

## 层级结构

- 章节：最小正文生产节点，默认 3000 到 6000 字。
- 章节部分：当同一章拆成上/中/下或多个文件时，画布上仍以“整章”为大节点，节点展开后再显示各部分。
- 剧情块：文章内部按空行、标题或段落切分出的可独立选择单元，每个块必须有稳定编号。
- 篇章：每 10 个章节为一个大篇章，用于承载一个阶段性问题或冲突。
- 卷：每 5 个篇章为一卷，即 50 个章节。
- 卷核心方向：一卷内核心故事发展方向锁定，不得在未确认的情况下改变。

## 文件落点

- 项目级画布总索引和长期 schema 仍放在 `_ledger/story-canvas/`。
- 文章级剧情块、段落 reroll 候选、块编号、行号和文件 hash，应优先写入文章同目录 sidecar。
- Sidecar 默认命名为 `<原文件名去扩展名>.story.json`，例如 `第七章（上）.story.json`。
- 文件夹级节点位置可保存为当前读取文件夹下的 `.story-canvas.folder.json`。
- 文件夹级工作区状态也保存到 `.story-canvas.folder.json`，包括画布视角、缩放、选中节点、展开状态、侧栏状态和检查器宽度。
- 当前读取文件夹下应维护 `.story-canvas.ledger.jsonl`，记录扫描、快照、reroll、节点位置保存、正文恢复和 sidecar 恢复。
- 历史快照放在当前读取文件夹下的 `.story-history/`，正文快照和 sidecar 快照分开保存。
- Sidecar 不复制整篇正文，只保存块编号、锚点、行号、短元数据和候选记录；正文仍以 `.md` / `.txt` 为事实层。
- 网页实时刷新只能同步文件系统中的最新状态，不等于自动采纳候选或自动改写正文。
- 恢复旧版本前必须先保留当前版本快照，避免回滚后无法撤回。

## 画布节点

每个章节节点至少包含：

```text
node_id：
volume_id：
arc_id：
chapter_no：
title：
target_chars：
status：
mainline_step：
subplot_steps：
chapter_start_hook：
chapter_end_hook：
character_delta_table：
segment_reroll_table：
reroll_slots：
selected_version：
sync_status：
canvas_position：
```

## 续写草稿节点

- 续写入口应挂在章节节点本身，而不是只放在顶部工具栏：章节节点或展开后的章节框悬停时显示连接点，拖出后创建草稿节点。
- 草稿落在相邻两章之间时，记为插入草稿：`route_mode=interstitial`，必须记录 `after_group_key`、`after_title`、`before_group_key` 和 `before_title`。
- 草稿没有落入相邻章节之间时，记为独立分支：`route_mode=branch`，必须记录 `branch_from_group_key`；分支不自动进入主干，也不自动同步人物卡或稳定设定。
- 草稿节点的生成设置至少包含：`agent`、`model`、`version_count`、`target_chars`、`split_count`、`split_mode`、`prompt_goal`。
- `split_count` 限定 1 到 4；`split_mode=single_segment` 表示先生成一段文字，`split_mode=chapter_nodes` 表示按章节节点拆分。
- 点击或提交生成请求时，应追加 `generation_requests`，并写入账本；请求只表示待生成或候选生成意图，不等于采纳正文。
- 生成请求中的用户方向意见属于桥接数据；后续生成时由生成层按用户当轮直接意见、保存的 `prompt_goal`、锁定作品事实和项目生成规则处理冲突。
- 草稿拆章后，子草稿应继承原草稿的 route、agent、目标字数和用户方向，并记录 `split_origin_draft_id` 与 `split_order`。
- 画布级撤销/重做可以恢复节点位置、草稿节点和草稿正文状态；撤销不应物理删除已经生成的草稿文件，避免误删事实层文本。
- 选中草稿节点按 `Delete` 时，只能归档草稿节点并移出当前画布索引；不得删除正式章节节点，也不得默认物理删除草稿正文文件。

## 节点 reroll

- Reroll 是候选版本生成，不直接覆盖已选版本。
- 用户在网页重构框中写入的意见是当前选区、部分或整章的直接意见；工具层负责稳定记录，生成层负责解释优先级和冲突。
- 用户后续在聊天或任务中给出的新意见优先于已保存的网页重构框意见。
- 每次 reroll 必须记录版本号、时间、prompt 或生成目标、输入参考、变化点和筛选结论。
- 只有用户确认 selected 后，候选版本才能进入主干或发布整理。
- 被否决版本保留结论，不默认删除；可进入 `trash/` 或 `_ledger/story-canvas/` 的 reroll 记录。

## 剧情段 reroll

章节节点下可以继续拆出“剧情段”或“段落选区”，用于只重录一小段文本，而不是重写整章。

剧情段记录至少包含：

| 字段 | 说明 |
| --- | --- |
| `segment_id` | 稳定 ID，例如 `v01-a01-ch001-s001` |
| `anchor` | 选区锚点，可用章节内段落号、起止字符位置、前后文短引或原文短引 |
| `source_excerpt` | 原选区短引，不保存过长正文 |
| `reroll_goal` | 这段要重录的目标 |
| `constraints` | 不可改动的事实、语气、角色状态、设定限制 |
| `candidate_versions` | 段落候选版本列表 |
| `selected_version` | 已采纳候选 |
| `replace_status` | pending / selected / applied / rejected |

- 剧情段 reroll 只能替换被选中的段落范围，不得顺手重写整章。
- 如果选区锚点不稳定，必须先让用户确认选区。
- 段落候选产生的人物、环境、剧情节点或设定变化，先写入该段落或章节的增量表；确认应用后再同步到稳定事实层。
- 段落 reroll 适合修语气、改动作、替换对白、强化某个钩子、调整一小段设定呈现。
- 在网页工具中，剧情段优先对应右侧正文视图里的 `B001`、`B002` 等剧情块编号；候选应写回对应文章的 `.story.json`。
- 如果网页重构框意见与故事卡或长篇生成规则冲突，由生成层按用户具体意见执行，并在生成说明中标出冲突；不得通过工具 UI 或 sidecar schema 静默覆盖生成规则。

## 设定增量表

每个章节节点必须维护设定增量表，用来替代“每次都去全部设定文件里翻”的低效流程。人物卡只是设定层的一部分，节点还应记录环境、剧情节点、道具、组织、世界规则和伏笔状态的变化。

| 角色 | 本章新行为 | 状态变化 | 关系变化 | 新秘密/信息 | 人物卡同步 | 来源版本 |
| --- | --- | --- | --- | --- | --- | --- |

- 角色表记录本章人物发生了什么，不替代人物卡。
- 人物卡仍是角色稳定事实层；节点表格是章节增量层。
- 本章被选为主干后，表格中 `人物卡同步=pending` 的条目必须同步或列入待确认。
- 分支或 reroll 候选中的角色变化不得自动写入主干人物卡。

环境设定表：

| 环境/场景 | 本章新增细节 | 状态变化 | 可复用限制 | 设定同步 | 来源版本 |
| --- | --- | --- | --- | --- | --- |

剧情节点表：

| 剧情节点 | 本章进展 | 主线影响 | 分线影响 | 后续依赖 | 同步状态 |
| --- | --- | --- | --- | --- | --- |

通用设定表：

| 类型 | 名称 | 本章变化 | 影响范围 | 同步目标 | 同步状态 |
| --- | --- | --- | --- | --- | --- |

类型建议包括：`world-rule`、`prop`、`faction`、`location`、`relationship-rule`、`foreshadowing`、`timeline`。

## 篇章与卷锁定

- 每 10 章形成一个篇章，篇章应有阶段目标、阶段冲突、阶段结尾和下一篇章钩子。
- 每 50 章形成一卷，一卷内核心故事方向必须锁定。
- 如需改变卷核心方向，必须创建“卷方向变更提案”，写明原因、影响章节、需要重写的节点和用户确认状态。
- 未确认前，Agent 只能提出分支方案，不得把核心方向改变写入主干规划。

## 推荐落点

- 工作区通用规则：`docs/agent-rules/story-canvas.md`。
- 项目执行流程：`projects/<project>/_pipeline/story-canvas-workflow.md`。
- 项目级规则：`projects/<project>/docs/rules/story-canvas.md`。
- 画布索引和 schema：项目 `_ledger/story-canvas/`。
- 文章级 sidecar：正文文件同目录 `<name>.story.json`。
- 可视化网页程序：`tools/story-canvas/server.mjs`。
