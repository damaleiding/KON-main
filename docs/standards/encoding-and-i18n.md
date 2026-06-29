# 编码与中文文本规范

## 默认编码

- 中文 Markdown、HTML、JSON、CSV 和脚本源码默认使用 UTF-8。
- 读取中文文件时应显式指定 UTF-8，避免 Windows 终端代码页导致乱码。
- 写回中文文件前，应确认不是把乱码内容重新落盘。

## PowerShell 读取建议

```powershell
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
Get-Content -Raw -Encoding UTF8 -LiteralPath <path>
```

## 风险场景

- 批量替换、章节拆分、合并发布稿、Google Docs 同步稿生成。
- 含 BOM 文件与无 BOM 文件混用。
- 终端显示乱码但文件实际正常。
- 用临时脚本读写中文路径、中文标题和正文。

## 处理原则

- 先判断是显示层乱码还是文件内容已损坏。
- 不把乱码输出复制回源文件。
- 编码修复属于正文风险操作，执行前按项目备份流程只备份本次会改动的文件。
- 修复后抽查文件开头、章节标题、中文标点和结尾字数统计。
