# 2026-05-30 项目内部清理清单

## 本次目标

- 建立项目专用临时目录，避免临时文件散落在项目根目录、作品目录或正文目录。
- 检查 `projects/pixiv novel` 内部的临时文件、测试文件、空目录和冗余结构。
- 只处理低风险项，不删除正文、设定、账本、审稿报告和备份。

## 新增规则

- 临时文件统一放入 `_tmp/`。
- `_tmp/` 默认不纳入 Git，只保留 `_tmp/README.md` 说明规则。
- 一次性脚本、临时提示词、临时 HTML/JSON、临时合并稿不得散放在项目根目录、作品根目录、`主干/`、`设定/` 或 `发布/`。

## 已清理的临时文件

- `曲影番外二/主干/第一版润色/temp_edit4.py`
- `曲影番外二/主干/第一版润色/temp_edit5.py`
- `曲影番外二/主干/第一版润色/temp_edit6.py`
- `曲影番外二/主干/第一版润色/temp_edit7.py`
- `曲影番外二/主干/第一版润色/temp_edit8.py`
- `曲影番外二/主干/第一版润色/temp_edit9.py`
- `曲影番外二/主干/第一版润色/temp_edit10.py`
- `人偶番外/发布/test.txt`。
- 以上文件曾临时集中到 `_tmp/cleanup-2026-05-30/`，后续已确认无保留价值并删除该临时目录。

## 已整理冗余结构

- 将 `references/范文参考/` 迁移到标准目录 `refs/范文参考/`。
- 删除迁移后为空的 `references/`。
- `.gitignore` 已补充 `projects/**/refs/**/fetch*.py` 和 `projects/**/refs/**/fetch_*cookie*.py`，外部范文抓取脚本和文本默认不进入 Git。

## 保留项

- `_ledger/iterations/...废稿合并重构版.md`：命中“废稿”关键词，但它是迭代账本，不是临时文件。
- `曲影/设定/人物卡/老周 _ Debug.md`：命中 `debug`，但这是角色名/人物卡，不是调试文件。
- `90_工具/google-docs-sync/.clasp.json`：本地 clasp 配置，已被 `.gitignore` 排除。
- `90_工具/google-docs-sync/Content.js`：Google Docs 同步生成的中间文件，已被 `.gitignore` 排除；可由同步流程重新生成。
- `_backups/`：正文修改前备份，不清理。
- `review/`：审稿报告，不清理。

## 后续建议

- 若希望进一步干净，可把 `90_工具/google-docs-sync/Content.js` 改为每次同步前生成、同步后删除，但需同步调整 Google Docs 同步流程。
