# Story Engine 项目规则

## 项目定位

`projects/story-engine` 是 KVA 的小说生成层项目，用于管理作品正文、设定、范文学习、生成规则、prompt、审稿、账本和发布整理。

本项目从旧小说项目拆分而来。当前已完成生成层迁移，规则、prompt、refs 索引/analysis、review、生成账本入口、辅助工具，以及 `曲影番外二/`、`人偶番外/`、`曲影/`、`柠檬/` 四个已写作品目录均以 `projects/story-engine/` 为默认入口。旧项目目录仅作为历史归档/回滚入口。

## 最高原则

- 文件系统是事实层，聊天历史不是事实层。
- 新任务只读取目标作品、目标章节和必要索引，不默认读取全部作品。
- 新的生成、续写、润色、重写和分支试写优先落到 `projects/story-engine/`。
- 旧项目目录只作为历史归档/回滚入口，不作为新任务的默认写入位置。
- `原文/` 默认只读；需要改写时先写入 `分支/`、`outputs/` 或用户指定工作稿。
- 生成规则、prompt 和范文沉淀属于 Story Engine；网页 UI、sidecar schema、server 和历史回滚属于 Story Canvas。
- 本文件不承载具体生成词条、范文技法全文、规避词表或作品级写法偏好；这些内容分别落到 `docs/rules/`、`prompts/`、`refs/`、作品 `设定/` 或 `_ledger/`。
- 临时文件统一放 `_tmp/`，不要散放到项目根目录或作品目录。

## 读取顺序

1. 先读本文件、`PROJECT.md`、`WORKFLOW.md`、`_pipeline/context-routes.md` 和 `_pipeline/rule-router.md`。
2. 如果任务涉及迁移，先读工作区 `docs/migration/20260629_story-engine_story-canvas_split-design.md`。
3. 如果任务涉及 Story Canvas 交接，读 `docs/rules/canvas-bridge-contract.md`。
4. 如果任务只是规则、prompt、范文或账本整理，不读取正文。
5. 如果任务指向具体作品，优先读取 `projects/story-engine/<作品名>/` 下的轻量入口和目标文件。

## 落点

- 生成规则：`docs/rules/`。
- Prompt：`prompts/` 或输出旁 `_prompts/`。
- 范文学习：`refs/`。
- 生产事实：`_ledger/` 或 `review/`。
- 阶段性输出：`outputs/`。
- Story Canvas 桥接契约：`docs/rules/canvas-bridge-contract.md`。
