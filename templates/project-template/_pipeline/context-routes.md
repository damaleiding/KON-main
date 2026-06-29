# <project-name> 上下文路由

## 路由原则

- 不默认读取全部正文。
- 先判断任务对象，再读取最小必要文件。
- 规则修正、目录整理和工具维护不读取正文，除非任务明确需要。

## 通用入口

- 项目规则：`AGENTS.md`
- 项目记忆：`PROJECT.md`
- 工作流：`WORKFLOW.md`
- 规则路由：`_pipeline/rule-router.md`
- 项目级规则：`docs/rules/README.md`

## 任务路由

- 规则修正：读项目入口、`_pipeline/rule-router.md` 和 `docs/rules/README.md`。
- Prompt 生成/修改：读根 `docs/agent-rules/prompt-generation.md`、项目 `prompts/README.md`、源 prompt 或目标作品轻量入口；只在 prompt 需要正文证据时读取目标片段。
- 故事画布：读根 `docs/agent-rules/story-canvas.md` 和项目 `docs/rules/story-canvas.md`；画布节点不保存正文全文。
- 设定整理：读目标作品轻量入口和相关设定文件。
- 三章剧情规划：读目标作品当前状态、故事圣经、风格指南、伏笔表和必要人物卡；不直接改正文。
- 章节续写：读最近主干章节、故事圣经、当前状态、伏笔表和人物卡。
- 章节润色：读目标章节、相邻章节、风格指南和人物卡。
- 首尾衔接：读目标章节和必要相邻章节。
- 文风检查：读目标作品风格指南、目标正文和人物卡。
- 规避词表扫描：读词表和目标正文。
- 文本整理：读目录映射、迁移表和备份流程。
