# word-count

`word-count` 是 KVA 工作区级字数统计工具。遇到用户要求统计字数、章节长度、文本长度或目录内稿件规模时，Agent 必须调用本工具，不得用模型自行估算。

## 用途

- 统计单个文件、多个文件或目录中的文本字数。
- 为中文小说正文提供稳定、可复现的默认字数口径。
- 输出机器可读 JSON，方便后续写入账本、审稿记录或项目索引。

## 入口

Windows PowerShell（当前工作区优先入口，无需 Node.js）：

```powershell
.\tools\word-count\word-count.ps1 ".\projects\story-engine\outputs\chapter01.md"
```

跨平台 Node.js：

```bash
node tools/word-count/word-count.mjs "projects/story-engine/outputs/chapter01.md"
```

macOS / Linux：

```bash
./tools/word-count/word-count.sh "projects/story-engine/outputs/chapter01.md"
```

## 统计口径

- 默认 `--mode nonspace`：统计所有非空白 Unicode 字符，推荐用于中文正文“字数”。
- `--mode cjk`：只统计汉字/CJK 表意字符。
- `--mode visible`：排除换行和制表符，但保留空格。
- 附带输出 `CJK`、英文词数、数字段数、标点数、行数、段落数。

默认目录扫描只读取常见文本扩展名：`md`、`markdown`、`txt`、`text`、`html`、`htm`、`xml`、`json`、`jsonl`、`csv`。

## 输入输出

输入可以是：

- 文件路径。
- 目录路径。
- PowerShell 入口使用 `-Text <text>` 或 `-Stdin`。
- Node.js 入口使用 `--text <text>` 或 `--stdin`。

默认输出为人类可读摘要：

```text
Word Count: 12 (nonspace)
Definition: Primary count is Unicode characters excluding whitespace.
Breakdown: nonspace 12 | CJK 8 | Latin words 1 | numbers 0 | punctuation 2
Structure: files 1 | lines 1 | paragraphs 1
```

需要机器读取时使用：

```powershell
.\tools\word-count\word-count.ps1 -Json ".\projects\story-engine\outputs"
```

## 最小示例

统计一段文本：

```powershell
"第一章开始。Hello world!" | .\tools\word-count\word-count.ps1 -Stdin
```

统计目录并显示每个文件：

```powershell
.\tools\word-count\word-count.ps1 -Details ".\projects\story-engine\outputs"
```

只统计汉字：

```powershell
.\tools\word-count\word-count.ps1 -Mode cjk ".\projects\story-engine\outputs\chapter01.md"
```

## Agent 使用规则

- 用户提出“字数统计”“统计这一章多少字”“算一下全文长度”“比较两个稿件字数”等需求时，必须优先运行本工具。
- 不得用模型直接数数字符、估算字数或根据肉眼阅读给出字数。
- 回复用户时说明采用的统计口径，例如“按非空白 Unicode 字符统计”。
- 如用户指定平台口径，以用户口径为准；若本工具暂不支持该口径，先说明差异，再给出本工具结果。

## 同步边界

- 可同步：`README.md`、`word-count.mjs`、`word-count.ps1`、`word-count.sh`。
- 不同步：临时统计输出、日志、缓存、大型文本导出副本。
