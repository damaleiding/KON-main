# 规则落点与范文学习沉淀审计

日期：2026-06-29

## 结论

- Story Engine / Story Canvas 拆分迁移已完成，完成报告见 `docs/migration/20260629_story-engine_story-canvas_completion-report.md`。
- 既有范文学习资料已在 `refs/范文参考/all-reference-learning-index.md` 建立总索引；中长篇与 Pixiv 单篇均已有对应 analysis 成果。
- 本轮新增 `docs/rules/reference-learning-application.md`，作为范文学习成果进入生成规则、prompt 和自检问题的项目级入口。
- `projects/story-engine/AGENTS.md` 只保留项目定位、读取顺序、边界和落点，不承载具体生成词条、范文技法全文、规避词表或作品级写法偏好。

## 已确认的沉淀位置

| 内容 | 正确落点 |
| --- | --- |
| 项目入口、读取顺序、写入边界 | `AGENTS.md`、`PROJECT.md`、`WORKFLOW.md` |
| 可复用生成规则 | `docs/rules/` |
| 范文结构学习、地图、技法分析 | `refs/范文参考/<条目>/analysis/` |
| 正式 prompt 模板 | `prompts/` |
| 单轮生产记录和审稿结论 | `_ledger/`、`review/` |
| 原文参考资料 | `refs/范文参考/<条目>/licensed-texts/`，并由 `.gitignore` 排除 |

## 已完成任务核对

- 已迁移生成层规则、prompt、refs 索引/analysis、review、ledger、outputs 和辅助工具到 `projects/story-engine/`。
- 已迁移 `曲影番外二/`、`人偶番外/`、`曲影/`、`柠檬/` 四个已写作品目录；旧路径保留为历史归档/回滚入口。
- 已完成 Story Canvas 工具层独立化；网页端和生成层规则空间分离。
- 已补充范文学习应用规则，要求只迁移结构、节奏、状态变化、章节钩子、信息互证、资源账和自检机制。

## 本轮更新

- 更新 `projects/story-engine/AGENTS.md`：明确不把具体生成词条、范文技法全文、规避词表或作品级偏好写入项目入口。
- 更新 `projects/story-engine/docs/rules/README.md`：登记 `reference-learning-application.md`。
- 更新 `projects/story-engine/_pipeline/rule-router.md`：增加“范文学习应用”路由和落点。
- 更新 `projects/story-engine/WORKFLOW.md`：启动流程和常见任务都指向范文应用规则。
- 更新 `projects/story-engine/prompts/longform-chapter-generation-template.md`：新增范文机制字段和硬性边界。
- 更新 `projects/story-engine/refs/范文参考/README.md`：明确生成前读取范文应用规则。

## 后续边界

- 不把范文原文、长摘录或具体桥段复制进规则、prompt 或 AGENTS。
- 不把单一范文的题材外壳硬编码为全项目默认写法。
- 敏感或成人向参考只保留机制层摘要：结构、节奏、视角、状态变化和上下文衔接。
- 若未来从范文学习中提炼出新规则，优先补 `docs/rules/` 或对应 prompt 模板；AGENTS 只同步入口和落点变化。
