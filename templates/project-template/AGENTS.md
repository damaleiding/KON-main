# <project-name> 项目规则

## 项目定位

`projects/<project-name>` 用于管理 <project-purpose>，包括作品设定、正文版本、分支稿、prompt、账本、审稿记录和发布整理。

## 最高原则

- 文件系统是事实层，聊天历史不是事实层。
- 新任务只读取目标作品、目标章节和必要索引，不默认读取整个项目。
- `原文/` 默认只读；需要改写时先复制到 `分支/`、`outputs/` 或用户指定工作稿。
- 临时文件统一放入 `_tmp/` 或项目约定临时目录，不散放到项目根目录、作品根目录、`主干/`、`设定/` 或 `发布/`。

## 读取顺序

1. 先读本文件、`PROJECT.md`、`WORKFLOW.md`、`_pipeline/context-routes.md` 和 `_pipeline/rule-router.md`。
2. 如果任务只涉及目录整理、工具登记或规则修正，不读取作品正文。
3. 如果任务指向具体作品，先读作品轻量入口和状态文件。
4. 如果任务指向具体章节，优先读取目标章节，再按需要读取相邻章节、风格指南、故事圣经、伏笔表和人物卡。
5. 如果任务指向 prompt 生成或修改，先读取根 `docs/agent-rules/prompt-generation.md` 和项目 `prompts/README.md`。

## 规则路由

- Prompt 生成/修改、章节衔接、文风校验、规避词表和文本整理按 `_pipeline/rule-router.md` 读取专项规则。
- 项目级细分规则写入 `docs/rules/`。
- 作品级事实写入作品 `设定/`。
- 单轮生产事实写入 `_ledger/` 或 `review/`。
