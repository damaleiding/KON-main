# Generation Request Contract

## 目标

定义 Story Canvas 向 Story Engine 交接生成请求时的最小字段。

## 最小字段

```text
source_project:
source_folder:
source_file:
target_anchor:
task_type:
route_mode:
user_directive:
agent:
model:
target_chars:
version_count:
split_count:
constraints:
sidecar_path:
ledger_path:
created_at:
```

## 可选扩展字段

这些字段不是当前最小契约的必填项，但后续接入画布连接、模板工作流、群组批量运行和媒体派生时应优先沿用：

```text
node_type:
source_node_id:
upstream_context_refs:
connection_policy:
group_id:
template_id:
media_brief_id:
reference_asset_refs:
candidate_version_id:
candidate_versions:
generated_draft_ids:
generation_batch:
draft_decision:
decision_note:
decided_at:
codex_bridge_task_id:
direct_generation:
provider:
history_restore_policy:
```

- `upstream_context_refs`：记录本次生成应读取哪些上游节点，例如上一章、连接的草稿、参考图、故事卡或媒体 brief。
- `connection_policy`：说明连接断开后是否继续保留引用内容，避免恢复历史时丢失上下文。
- `group_id`：用于一组章节、草稿或媒体 brief 的批量生成和批量检查。
- `template_id`：用于记录本次生成来自哪个可复用工作流模板。
- `candidate_versions`：记录一次直接生成得到的候选集合；剧情块/部分候选写入对应 `.story.json` 的 reroll slot，整章候选写入账本详情。草稿续写候选应优先物化成草稿版本节点。
- `generated_draft_ids`：草稿续写直接生成后创建或复用的草稿版本节点 ID 列表。
- `generation_batch`：写在草稿版本节点上的批次信息，包含 `source_draft_id`、`request_id`、`candidate_version_id`、`version_index`、`version_count` 和 `generated_at`。
- `draft_decision`：草稿版本筛选状态，建议使用 `draft`、`selected`、`rejected`。`selected` 只表示采纳为生产候选，不表示已经覆盖主线正文。
- `decision_note`：记录为什么采纳或放弃该版本，用于后续并稿、自检和复盘。
- `decided_at`：草稿版本决策时间。
- `codex_bridge_task_id`：当请求选择 Codex / GPT-5 时，写入 `.story-canvas-codex-bridge/` 的任务 ID，用于后续 Codex App/CLI 消费。
- `direct_generation`：标记该请求是否已由 Story Canvas server 直接调用本机模型 API 生成候选。
- `provider`：记录直接生成服务商，例如 `google-generative-language`。
- `history_restore_policy`：用于说明恢复候选或历史快照时是否恢复节点位置、连接关系和上下游锚点。

## 边界

- Story Canvas 负责记录这些字段。
- Story Canvas 可在本机环境变量存在时调用 Gemini API 生成候选；草稿续写候选会成为画布草稿版本节点，reroll 候选只保存候选和来源元数据。
- Story Engine 负责解释生成规则、组织 prompt、生成候选和记录筛选结论。
- 候选正文不自动写回主干。

## 意图解释优先级

Story Engine 读取本契约时，应按以下顺序解释生成意图：

1. 当前任务里用户最新明确指令。
2. 网页端当前节点、选区或重构框里的直接意见。
3. 节点锚点、前后章节、`route_mode`、目标字数、拆章数和候选版本数。
4. 项目的长篇生成规则、章节治理规则、故事卡结论和参考范文学习结果。
5. 跨项目方法论和通用写作建议。

网页端重构框里的具体意见优先于此前从故事卡、参考范文或通用方法中学到的经验；通用经验只用于补足判断和检查衔接，不得覆盖当前节点的明确要求。
