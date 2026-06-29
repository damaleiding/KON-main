# API Notes

本目录保存 Story Canvas server/API 说明。

当前 server 实现在 `projects/story-canvas/app/server.mjs`。旧工具 server 入口仅作为兼容包装器，新功能和接口说明以本项目 `app/` 为准。

## 生成相关接口

- `GET /api/agents/status`：返回网页端可用 Agent 链路状态，不打印密钥。加 `?probe=1` 时，只对已配置的 direct API 发最小连通性请求。
- `GET /api/codex-bridge/tasks?root=...`：列出当前作品文件夹下 `.story-canvas-codex-bridge/` 中的 Codex 桥接任务。
- `POST /api/codex-bridge/task`：写入一个 Codex 桥接任务 JSON，并在 `.story-canvas.ledger.jsonl` 记录 `codex-bridge-task`。
- `POST /api/draft-node/generate-request`：只记录草稿生成请求，不调用外部模型。
- `POST /api/draft-node/generate`：记录草稿生成请求；当 `generation_settings.agent` / `model` 对应的 provider 已配置时，server 会并发生成候选并把每个候选正文物化为 `.story-canvas-drafts/` 下的草稿版本节点。当前 direct provider 包括 Gemini API、OneAgent Claude 和 Ark DeepSeek；Codex 写入桥接任务队列。返回值包含 `generated_draft_ids`、`group_ids` 和 `source_reused_as_first_version`。
- `POST /api/draft-node/decision`：标记草稿版本决策，`decision` 支持 `draft`、`selected`、`rejected`。采纳 `selected` 时默认把同一 `generation_batch.request_id` 下的其他候选标为 `rejected`，但不删除草稿文件；接口会写入文件夹索引历史和 `.story-canvas.ledger.jsonl`。
- `POST /api/block-reroll`：记录剧情块重Roll。传入 `generate_now=true` 且模型为 Gemini 时，会生成候选并写入该块 `reroll_slots`。
- `POST /api/part-reroll`：记录文章部分重Roll。传入 `generate_now=true` 且模型为 Gemini 时，会生成候选并写入同名 `.story.json` 的 `part_reroll_slots`。
- `POST /api/chapter-reroll`：记录整章重Roll。传入 `generate_now=true` 且模型为 Gemini 时，会生成候选并写入 `.story-canvas.ledger.jsonl` 的记录详情。

## Provider 配置

- Gemini：`GOOGLE_API_KEY` 或 `GEMINI_API_KEY`，可选 `GOOGLE_GEMINI_MODEL` / `GEMINI_MODEL`。
- Claude：`ONEAGENT_BASE_URL`、`ONEAGENT_API_KEY`、`ONEAGENT_MODEL=claude-opus-4-7`。
- DeepSeek：`ARK_BASE_URL`、`ARK_API_KEY`、`ARK_MODEL_DEEPSEEK=deepseek-v4-pro-260425`。
- Codex：网页端写入 `.story-canvas-codex-bridge/` 任务队列；Codex App 内部线程工具或后续本机消费者负责真正开新线程/继续线程。

未配置的模型只保存为可追踪请求和所选底模，不由 Story Canvas server 直接调用。
