# Story Engine / Story Canvas 拆分迁移设计

## 设计目标

把当前 `projects/pixiv novel/` 承担的“生成层”和 `tools/story-canvas/` 承担的“网页工具层”拆成两个独立项目：

```text
projects/story-engine/
projects/story-canvas/
```

拆分后的目标是：

- `story-engine` 专注小说生成：作品正文、设定、范文学习、生成规则、prompt、审稿、账本和发布整理。
- `story-canvas` 专注网页工具：前后端、画布交互、sidecar、schema、server、历史快照、UI/UX 和工具测试。
- 两者通过稳定桥接契约交接，不互相拥有对方规则。
- 已写好的作品正文采用复制迁移：`曲影番外二/`、`人偶番外/`、`曲影/`、`柠檬/` 已复制到 Story Engine，旧路径暂时保留兼容，命名清理后续单独处理。

## 当前状态

| 当前路径 | 当前职责 | 迁移意向 | 当前动作 |
| --- | --- | --- | --- |
| `projects/pixiv novel/` | 旧统一小说创作项目 | 兼容/回滚入口 | 先保留，不删除 |
| `projects/story-engine/` | Story Engine 新项目 | 承接生成层和作品事实层 | 已迁入生成规则、prompt、refs 索引/analysis、review、ledger、outputs、生成辅助工具和四个作品目录副本 |
| `projects/story-canvas/` | Story Canvas 新项目 | 承接网页工具层 | 已迁入工具代码到 `app/`，并迁入 canvas 规则/工作流/ledger |
| `tools/story-canvas/` | 工作区级故事画布旧工具路径 | 作为兼容入口暂留 | 先保留，不删除 |
| `projects/pixiv novel/docs/rules/layer-boundaries.md` | 当前临时分层边界规则 | 迁入两个项目的桥接契约或保留为迁移依据 | 先保留 |
| `projects/pixiv novel/_ledger/story-canvas/` | 故事画布项目级 schema、索引和长期记录 | 评估后迁入 `story-canvas` 或分拆桥接记录 | 先保留 |
| 正文旁 `.story.json` / `.story-history/` | 工具 sidecar 和历史快照 | 已随作品目录复制到 Story Engine；当前 sidecar source_path 已改为新路径 | 旧路径快照暂留 |

## 目标项目职责

### Story Engine

定位：生成层和作品事实层。

负责：

- 作品正文、设定、人物卡、伏笔、当前状态和发布稿。
- 范文学习、参考分析、长篇结构方法和可迁移技法。
- 章节规划、长篇生成规则、首尾衔接、文风校验、规避词表。
- Prompt 模板、模型提交词、生成记录、审稿记录和筛选结论。
- 生产账本、版本流转、发布整理和 Google Docs 同步记录。

不负责：

- 网页 UI、画布交互、前后端实现、sidecar schema 的细节实现。
- 自动采纳网页工具候选。
- 修改 Story Canvas 的按钮、布局、server 或历史回滚机制。

### Story Canvas

定位：工具层和网页产品层。

负责：

- 前端页面、交互设计、画布布局、节点拖拽、缩放、面板、快捷键。
- 后端 server、文件扫描、sidecar 读写、历史快照、回滚和实时同步。
- `.story.json`、`.story-canvas.folder.json`、`.story-canvas.ledger.jsonl` 的 schema 与兼容。
- 生成请求、reroll 目标、剧情块锚点、候选状态和桥接数据记录。
- 工具测试、截图验证、数据迁移脚本和 UI/UX 文档。

不负责：

- 长篇生成规则、prompt 模板、范文学习结论和章节质量门。
- 判断候选正文是否进入主干。
- 修改作品人物卡、伏笔表、发布稿和生成账本。

## 桥接契约

Story Canvas 向 Story Engine 交接请求时，最小字段建议为：

```text
source_project:
source_folder:
source_file:
target_anchor:
task_type:
route_mode:
user_directive:
target_chars:
version_count:
split_count:
constraints:
sidecar_path:
ledger_path:
created_at:
```

字段含义：

| 字段 | 说明 |
| --- | --- |
| `source_project` | 来源项目或工作区标识，例如 `story-engine` |
| `source_folder` | 作品文件夹或章节目录 |
| `source_file` | 目标正文文件 |
| `target_anchor` | 剧情块、段落、章节节点或草稿节点锚点 |
| `task_type` | 续写、插入、分支、局部 reroll、润色、重写 |
| `route_mode` | `interstitial`、`branch`、`segment-reroll` 等 |
| `user_directive` | 用户在网页中保存的直接意见 |
| `target_chars` | 目标字数；正式统计仍用 word-count 工具 |
| `version_count` | 候选版本数 |
| `split_count` | 草稿拆分数量 |
| `constraints` | 不可改事实、角色状态、时间线或用户限制 |
| `sidecar_path` | 对应 `.story.json` 或 folder JSON |
| `ledger_path` | 对应画布账本路径 |
| `created_at` | 请求记录时间 |

桥接契约只传递“用户要什么、选中了哪里、希望生成什么候选”。Story Engine 读取后，再结合生成规则、作品设定和 prompt 模板组织模型提交词。

## 目标目录草案

### `projects/story-engine/`

```text
projects/story-engine/
  AGENTS.md
  PROJECT.md
  WORKFLOW.md
  story-engine_project-brief.html
  docs/
    current-layout.md
    rules/
      README.md
      longform-generation.md
      chapter-planning.md
      chapter-continuity.md
      style-quality.md
      avoidance-lexicon.md
      text-organization.md
      path-and-naming.md
      canvas-bridge-contract.md
  _pipeline/
    context-routes.md
    rule-router.md
    chapter-planning-workflow.md
    chapter-continuity-workflow.md
    style-quality-check-workflow.md
    avoidance-lexicon-workflow.md
    text-organization-workflow.md
    character-card-workflow.md
  _ledger/
    iteration-ledger.md
    iterations/
  refs/
    范文参考/
  prompts/
  outputs/
  review/
  trash/
  _tmp/
  曲影番外二/
  人偶番外/
  曲影/
  柠檬/
```

### `projects/story-canvas/`

```text
projects/story-canvas/
  AGENTS.md
  PROJECT.md
  WORKFLOW.md
  story-canvas_project-brief.html
  app/
    server.mjs
    story-canvas.html
    build-canvas-import.mjs
  docs/
    current-layout.md
    ui-design/
    data-contracts/
      sidecar-schema.md
      generation-request-contract.md
    api/
    testing/
  _pipeline/
    context-routes.md
    tool-index.json
    browser-test-workflow.md
  _ledger/
    release-notes.md
    migration-ledger.md
  outputs/
  review/
  trash/
  _tmp/
```

## 暂不归档/删除清单

以下内容在本阶段不删除、不归档、不重命名；新项目路径已作为默认工作入口：

| 内容 | 原因 | 后续处理条件 |
| --- | --- | --- |
| `projects/pixiv novel/曲影番外二/` | 已复制到 Story Engine；旧目录仍可能被人工习惯和历史记录引用 | 新路径稳定后再决定归档或删除 |
| `projects/pixiv novel/人偶番外/` | 已复制到 Story Engine；旧目录仍可作为回滚入口 | 新路径稳定后再决定归档或删除 |
| `projects/pixiv novel/曲影/` | 已复制到 Story Engine；旧目录仍保留兼容 | 新路径稳定后再决定归档或删除 |
| `projects/pixiv novel/柠檬/` | 已复制到 Story Engine；旧目录仍保留兼容 | 新路径稳定后再决定归档或删除 |
| 旧路径旁 `.story.json`、`.story-history/` | 作为迁移前工具快照和回滚材料 | 新路径运行稳定后再决定是否归档旧快照 |
| Google Docs 同步稿和清单 | 可能含固定路径、文档标题和同步状态 | 发布流程复核后迁移 |

## 迁移阶段

### 阶段 0：设计确认

状态：已完成。

目标：

- 确认两个项目的职责边界。
- 确认哪些内容先不动。
- 确认目标目录草案和桥接契约。
- 不移动文件，不改正文路径，不重命名作品目录。

输出：

- 本设计文档。
- 后续迁移表草案。

### 阶段 1：建立新项目空骨架

状态：已完成。

目标：

- 新建 `projects/story-engine/` 与 `projects/story-canvas/` 的入口文件和空目录。
- 不迁移正文。
- 不迁移工具实现。
- 在旧项目中保留迁移说明，避免路径断裂。

检查：

- 两个新项目都有 `AGENTS.md`、`PROJECT.md`、`WORKFLOW.md`、项目 brief、`docs/`、`_pipeline/` 和 `_ledger/`。
- 旧路径仍可被现有脚本和人工流程使用。
- 本阶段不迁移正文、不迁移工具代码、不处理命名清理。

### 阶段 2：迁移 Story Canvas 工具层

状态：已完成。

目标：

- 将 `tools/story-canvas/` 迁入 `projects/story-canvas/app/` 或建立镜像/兼容入口。
- 把工具 README、数据契约、测试说明和启动方式整理到 `projects/story-canvas/docs/`。
- 保留旧启动路径或跳转说明，避免立刻破坏习惯。

风险：

- server 默认读取路径已切到 `projects/story-engine/人偶番外/主干`。
- 当前 sidecar 已随正文副本迁入 Story Engine，并清理活跃 `source_path`。
- 浏览器测试和截图验证需重新跑。

### 阶段 3：迁移 Story Engine 生成层

状态：已完成。

目标：

- 将 `projects/pixiv novel/` 的生成层入口演进为 `projects/story-engine/`。
- 迁移规则、prompt、refs、review、ledger、outputs 等生成层内容。
- 作品目录已复制迁入 Story Engine，旧路径保留为兼容/回滚映射。

风险：

- 大量文档引用 `projects/pixiv novel/`。
- Google Docs 同步稿、脚本和账本可能含硬编码路径。
- 未跟踪文件较多，迁移前需确认 Git 状态和备份策略。

### 阶段 4：分批处理作品目录与命名

状态：已完成；作品目录迁入、低风险命名清理和兼容入口归档均已落盘。

目标：

- 在迁移方案确认后，再处理作品目录和文件命名。
- 先补作品 README 和索引，再决定是否移动。
- 正文迁移必须有旧路径、新路径、引用风险和回滚方式。

原则：

- 已写好的作品先不因为项目拆分而改名。
- 正文、设定和发布稿迁移前必须备份。
- 字数统计和发布清单不因路径设计阶段而改动。

## 迁移表草案

| 旧路径 | 目标路径 | 类型 | 状态 | 风险 | 兼容策略 |
| --- | --- | --- | --- | --- | --- |
| `projects/pixiv novel/docs/rules/longform-generation.md` | `projects/story-engine/docs/rules/longform-generation.md` | 生成规则 | 已复制迁入 | 被路由和 prompt 引用 | 旧路径暂留兼容 |
| `projects/pixiv novel/prompts/` | `projects/story-engine/prompts/` | Prompt | 已复制迁入 | prompt 索引路径变化 | 旧路径暂留兼容 |
| `projects/pixiv novel/refs/范文参考/` | `projects/story-engine/refs/范文参考/` | 范文学习 | 已迁入索引/analysis | `licensed-texts` 原文需保持忽略 | 未批量复制 licensed-texts |
| `projects/pixiv novel/_ledger/` | `projects/story-engine/_ledger/` | 生成账本 | 已复制迁入生成账本 | 账本路径引用旧作品目录 | 后续清理旧路径引用 |
| `projects/pixiv novel/90_工具/` | `projects/story-engine/tools/` | 生成辅助工具 | 已复制迁入 | 部分历史同步快照仍含旧事实 | 活跃脚本路径已初步清理 |
| `tools/story-canvas/` | `projects/story-canvas/app/` | 工具实现 | 已复制迁入 | 启动命令和默认读取路径变化 | 新 app 默认路径已切到 Story Engine，旧路径暂留兼容 |
| `projects/pixiv novel/_ledger/story-canvas/` | `projects/story-canvas/_ledger/story-canvas/` | 画布索引 | 已复制迁入 Story Canvas | 画布数据曾含旧作品路径 | 当前画布账本路径已清理 |
| `projects/pixiv novel/曲影番外二/` | `projects/story-engine/曲影番外二/` | 作品目录 | 已复制迁入 | 正文、设定、发布、Google Docs 引用多 | 旧路径暂留兼容，后续清理引用 |
| `projects/pixiv novel/人偶番外/` | `projects/story-engine/人偶番外/` | 作品目录 | 已复制迁入 | story sidecar 与正文绑定 | 新旧文件数已核对，旧路径暂留兼容 |
| `projects/pixiv novel/曲影/` | `projects/story-engine/曲影/` | 作品目录 | 已复制迁入 | 系列基础设定引用 | 旧路径暂留兼容，后续清理引用 |
| `projects/pixiv novel/柠檬/` | `projects/story-engine/柠檬/` | 作品目录 | 已复制迁入 | 主干和新作分支路径引用 | 旧路径暂留兼容，后续清理引用 |

## 已决策问题

1. `story-engine` 采用纯英文项目目录名，作品目录继续保留中文名。
2. `story-canvas` 的实际实现入口为 `projects/story-canvas/app/`；旧 `tools/story-canvas/` 只保留轻量兼容包装器。
3. `.story.json`、`.story-history/` 和 `.story-canvas-drafts/` 继续跟随正文目录，作为 Story Canvas 本地运行数据保留。
4. `projects/story-canvas/_ledger/story-canvas/` 承接工具层长期索引和 schema；Story Engine 只读取桥接契约和生成请求事实。
5. 旧小说项目目录作为历史归档/回滚入口保留，不作为新任务默认写入位置。

## 决策建议

- 先确认项目边界和目标目录，不立即处理命名。
- 作品目录先不动，避免破坏既有正文和发布链。
- Story Canvas 先迁工具和文档，保持能读取旧 Story Engine 路径。
- Story Engine 迁移时优先迁规则、prompt、refs 和账本，再迁作品。
- 后续更大范围路径改名和命名清理，继续按批次迁移表执行。

## 本轮结论

已完成 Story Engine / Story Canvas 拆分迁移：`projects/story-engine/` 是生成层默认入口，`projects/story-canvas/` 是网页工具层默认入口。Story Canvas 默认读取路径已切到 Story Engine，新项目内活跃旧路径引用已清理；`server.mjs` health/scan、`build-canvas-import.mjs` 和浏览器冒烟测试已验证通过。Google Docs 同步工具已完成迁移复核，未访问 Google Drive；命名清理、一次性脚本归档、人物卡/原文文件名映射和旧兼容入口归档均已落盘。旧小说项目目录保留为历史归档/回滚入口，旧 `tools/story-canvas/` 已降级为兼容包装器。完成状态见 `docs/migration/20260629_story-engine_story-canvas_completion-report.md`。
