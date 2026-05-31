# OneAgent Claude Opus 4.7 与 DeepSeek V4 配置说明

## 目标

KVA 里的多模型子 Agent 默认使用：

- OneAgent Claude：`claude-opus-4-7`
- Ark DeepSeek：`deepseek-v4-pro-260425`

## KVA 已更新

已更新：

- `tools/ai-debate/debate.py`
- `tools/ai-debate/debate_experts.py`
- `tools/ai-debate/debate_rounds.py`

这些脚本仍然支持用环境变量覆盖：

```env
ONEAGENT_MODEL=claude-opus-4-7
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL_DEEPSEEK=deepseek-v4-pro-260425
```

真实 API Key 只应写入本地 `.env`，不要写入仓库文件。

## Trae 全局 Skill 需要更新的位置

全局 skill 文件：

```text
C:\Users\Admin\.trae\skills\multi-expert-validation\SKILL.md
```

需要把示例配置中的：

```env
ONEAGENT_MODEL=claude-sonnet-4-7
```

改成：

```env
ONEAGENT_MODEL=claude-opus-4-7
```

如果 OneAgent 平台侧实际模型 ID 不同，以平台返回的模型 ID 为准，只需要改 `ONEAGENT_MODEL`。

