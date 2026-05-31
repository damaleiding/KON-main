# KVA 工作区核心规则

## 工作区定位

`KVA` 是面向小说创作的 AI 协作工程。它不是单一应用仓库，而是把作品规则、设定、正文、分支稿、提示词、账本、索引、参考资料和可复用写作方法论放在一起，方便在本机和 GitHub 之间同步可协作的事实层。

核心服务对象：小说设定整理、长篇正文写作、章节润色、分支改写、伏笔管理、发布稿整理和多窗口协作。

## 最高优先级原则

- 文件系统是事实层，聊天历史不是事实层。
- 新任务优先读取最小上下文，不默认全仓扫描。
- 项目规则、作品设定、正文版本、提示词、账本和索引必须可追踪、可复现、可交接。
- 大型外部资料、缓存和临时输出不默认进入 Git；Git 优先保存文本、索引、决策记录和可复现配置。
- 目录和文件命名优先稳定、可检索、可脚本处理。
- 修改规则、目录结构或同步边界时，必须同步更新对应 README、索引或规则文档。

## 顶层目录

```text
KVA/
  AGENTS.md
  README.md
  docs/
  methods/
  projects/
  tools/
  references/
  templates/
```

- `docs/`：工作区级长期文档、规则细则、协作说明、架构说明和迁移记录。
- `methods/`：跨项目方法论。
- `projects/`：具体小说创作项目或作品集。
- `tools/`：工作区级可复用工具。
- `references/`：跨项目参考资料入口。
- `templates/`：新项目模板、prompt 模板、账本 schema 和交接模板。

## 项目必备入口

每个项目必须至少维护：

```text
projects/<project-name>/
  AGENTS.md
  PROJECT.md
  WORKFLOW.md
  <project-name>_project-brief.html
  _pipeline/
  _ledger/
  docs/
  refs/
  prompts/
  outputs/
  review/
  trash/
```

- `PROJECT.md`：给 Agent 读的项目记忆。
- `WORKFLOW.md`：给 Agent 读的项目工作流。
- `<project-name>_project-brief.html`：给人类读的静态项目纲要，必须和 `PROJECT.md` 同级。
- `_pipeline/`：项目级上下文路由、工具索引和技能索引。
- `_ledger/`：生产账本、prompt 索引、审稿决策和文本版本清单。

## 安全底线

- 不提交密钥、token、cookie、账号凭据、私钥和未脱敏内部链接。
- 不把真实 API Key 写入 `AGENTS.md`、`README.md`、`.env.example`、项目文档或任何可同步文件。
- 真实本地配置只放 `.env`；`.env` 必须被 Git 忽略。
- 不默认提交大型外部资料、压缩包、缓存、下载目录和临时输出。


## 生成与记录底线

- 生成或改写前必须明确用途：设定整理、章节续写、润色、重写、分支试写、发布整理或临时参考。
- 正式写作或改写必须记录 prompt、模型、时间、输入参考、输出路径、版本、用途和筛选结论。
- Prompt 是生产记录，不是临时聊天文本；重要 prompt 应保存到项目 `prompts/` 或输出旁 `_prompts/`。
- 参考资料必须标注作品、角色、用途、状态和注意事项；废弃参考不得默认进入 prompt。

## 工具使用底线

- 用户提出字数统计、章节长度、全文长度、稿件长度对比等需求时，必须调用 `tools/word-count/word-count.ps1` 或 `tools/word-count/word-count.mjs`，不得用模型估算或手数。
- 回复字数统计结果时必须说明统计口径；默认口径是非空白 Unicode 字符数。

## 多模型协作底线

- Trae 当前主模型是统筹者，负责拆分任务、分配子任务、合并、复查和最终交付。
- Claude 子 Agent 默认模型：`claude-opus-4-7`，适合主方案、长上下文归纳、prompt 精修、代码审查和高质量改写。
- DeepSeek 子 Agent 默认模型：`deepseek-v4-pro-260425`，适合反方审查、边界条件、测试缺口、鲁棒性和风险检查。
- 子 Agent 输出不能直接作为最终事实层；必须由 Trae 主模型复查、筛选、改写和落盘。
- 不把密钥、token、cookie、未脱敏客户资料或大体积外部资料发送给子 Agent。

## 高优先级扩展规则

根 `AGENTS.md` 只保留核心规则。执行具体任务时，按需读取以下高优先级规则：

- `docs/agent-rules/project-structure.md`：目录结构、项目入口、人类 HTML 纲要、索引职责。
- `docs/agent-rules/ai-production.md`：AI 写作、prompt、参考资料和审稿记录规则。
- `docs/agent-rules/subagent-collaboration.md`：Claude / DeepSeek 子 Agent 触发、分工、复查和跳过条件。
- `docs/agent-rules/git-security.md`：Git 同步边界、安全隐私、外部资料与密钥处理。
- `docs/agent-rules/writing-and-modification.md`：语言命名、修改联动、新项目/新工具要求。

## 修改规则

- 修改顶层核心规则时，同时检查 `README.md` 和 `docs/agent-rules/` 是否需要更新。
- 修改项目级规则时，同时检查该项目的 `PROJECT.md`、`WORKFLOW.md`、`<project-name>_project-brief.html` 和 `_pipeline/`。
- 新增项目时，应从 `templates/` 复制项目骨架，而不是临时散放文件。
