# Pixiv Novel 规则索引

本目录保存 `projects/pixiv novel` 的项目级规则。这里承接工作区级规则，但不保存单轮生产事实、候选稿正文或 prompt 长文。

## 文件说明

- `chapter-continuity.md`：本项目的章节首尾串联、拆分、合并和检查规则。
- `chapter-planning.md`：三章剧情单元、章节长度、主线/分线和写作前规划规则。
- `layer-boundaries.md`：网页工具层、sidecar、脚本与生成规则、prompt、范文沉淀之间的分层边界和桥接契约。
- `longform-generation.md`：长篇生成规则，包括章节接力卡、旧钩子兑现、四账本/方案账、问题链、多线信息交接、配角信息动作、时间跳跃和生成后自检。
- `story-canvas.md`：章节节点、reroll、角色变化表、10章篇章和50章卷规则。
- `style-quality.md`：本项目的文风质量检查维度。
- `avoidance-lexicon.md`：规避词表字段、维护方式和作品级词表落点。
- `text-organization.md`：项目内原文、设定、主干、分支、发布、输出和临时文件边界。
- `path-and-naming.md`：项目和作品内路径结构、文件命名、各区域生成落点与同步清单。

## 规则落点

- 跨项目规则：根 `docs/agent-rules/`。
- 项目级规则：本目录。
- 作品级事实：各作品 `设定/`。
- 生产事实：`_ledger/` 或 `review/`。
- Prompt：`prompts/` 或输出旁 `_prompts/`。
- 工具实现与网页交互：工作区 `tools/` 或项目 `90_工具/`；与生成层交接时按 `layer-boundaries.md`。

## 路径与命名

- 目录整理、迁移规划、新增作品、新增主干版本、新增分支、新增发布稿、prompt 归档和审稿报告归档，先读 `path-and-naming.md`。
- 既有正文路径不因规则更新自动重命名；新增文件和后续迁移按 `path-and-naming.md` 执行。
