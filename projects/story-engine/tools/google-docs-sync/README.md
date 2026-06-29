# Google Docs Sync Tool

通过 `clasp` 和 Google Apps Script，把本地 Markdown 同步到 Google Docs。

本目录已迁入 Story Engine。旧同步工具目录只作为兼容/回滚入口；后续维护优先修改本目录。

## 前置条件

- 已安装 Node.js 和 npm。
- 已安装 `clasp`：`npm install -g @google/clasp`。
- 已执行 `clasp login`。
- 已在 Google 账号中开启 Apps Script API。
- OAuth token、cookie、API Key 等凭据不得写入本目录。

## 生成 Apps Script 内容

在本目录运行：

```powershell
.\build-content.ps1 `
  -SourceMarkdown "..\..\曲影番外二\发布\GoogleDocs\曲影番外二_主干第一版润色_GoogleDocs同步稿.md" `
  -Title "曲影番外二：主干第一版润色"
```

这会生成 `Content.js`。`Content.js` 是同步中间文件，不应手动编辑。

## clasp 同步方式

```powershell
clasp push
clasp run createDocFromContent
```

如果要覆盖已绑定文档，先设置目标文档 ID：

```powershell
clasp run setTargetDocumentId -p '["你的Google文档ID"]'
clasp run overwriteConfiguredDoc
```

## Drive 上传备用方式

如果 `clasp run` 提示需要 API executable，可直接用 `clasp login` 生成的 OAuth 凭据，通过 Drive API 上传并转换为 Google Docs。

创建新文档：

```powershell
node .\upload-markdown-to-drive-doc.js `
  --mode create `
  --source "..\..\曲影番外二\发布\GoogleDocs\曲影番外二_主干第一版润色_GoogleDocs同步稿.md" `
  --title "曲影番外二：主干第一版润色" `
  --paragraph-mode loose `
  --claspHome "<repo-root>\tokens\clasp-home" `
  --state "<repo-root>\tokens\google-docs-sync\曲影番外二_主干第一版润色.json"
```

覆盖已绑定文档：

```powershell
node .\upload-markdown-to-drive-doc.js `
  --mode update `
  --source "..\..\曲影番外二\发布\GoogleDocs\曲影番外二_主干第一版润色_GoogleDocs同步稿.md" `
  --title "曲影番外二：主干第一版润色" `
  --paragraph-mode loose `
  --claspHome "<repo-root>\tokens\clasp-home" `
  --state "<repo-root>\tokens\google-docs-sync\曲影番外二_主干第一版润色.json"
```

只标记待同步，不访问 Google Drive：

```powershell
node .\upload-markdown-to-drive-doc.js `
  --mode pending `
  --source "..\..\曲影番外二\发布\GoogleDocs\曲影番外二_主干第一版润色_GoogleDocs同步稿.md" `
  --title "曲影番外二：主干第一版润色" `
  --paragraph-mode loose `
  --claspHome "<repo-root>\tokens\clasp-home" `
  --state "<repo-root>\tokens\google-docs-sync\曲影番外二_主干第一版润色.json"
```

## 上传触发条件

- 只有用户明确要求“上传”“同步”或“发布一下”时才访问 Google Drive。
- 上传前再从当前来源章节生成最新 `GoogleDocs同步稿.md`。
- 连续修改中或用户未要求同步时，只写入 `pending` 状态和待同步范围，不访问 Google Drive，不更新线上文档。

## 最小范围同步规则

- 已绑定 Google Docs 的版本，上传时优先只同步本轮实际修改的章节、小节或稳定锚点范围。
- 当前 `clasp run overwriteConfiguredDoc` 和 Drive `--mode update` 都是整篇覆盖工具；执行前应先确认是否接受整篇覆盖，或改用后续实现的局部替换工具。
- 如果章节标题变更、锚点缺失、Google Docs 结构被人工改动，或工具无法稳定定位范围，则退回整篇覆盖，并在同步清单中记录原因。

## 排版参数

- `--paragraph-mode loose`：默认；保留标题、分隔线和本地段落，并把过长自然段按中文标点温和拆段，方便审阅。
- `--paragraph-mode preserve`：尽量严格保留 Markdown 段落，不额外拆分长段。

## 记录规则

- 每次上传/覆盖都会在 `--state` 指定的本地状态文件中写入 `syncedAtLocal` 和 `syncedAtIso`。
- 每次待同步标记都会写入 `pendingSinceLocal` 和 `pendingSinceIso`。
- 同步清单应记录待同步范围、实际同步范围、是否使用整篇覆盖，以及未采用最小范围同步的原因。

## 注意事项

- `Content.js` 是由本地稿件生成的同步中间文件，不应手动编辑。
- 不要把 OAuth token、cookie、API Key 或其他凭据写入本目录。
- Google Docs 是发布或协作副本；本地 `主干/` 或 `发布/` 文件仍是事实层。
