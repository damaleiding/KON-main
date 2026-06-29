# Story Canvas 桥接契约

## 目标

本文件定义 Story Canvas 向 Story Engine 交接生成请求、reroll 目标和选区锚点时的最小字段。Story Canvas 只记录请求，Story Engine 负责解释生成规则、组织 prompt、生成候选和记录筛选结论。

## 最小字段

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

## 处理规则

- 桥接字段只描述用户意图、选区位置和候选需求，不承载完整生成规则。
- Story Engine 读取桥接字段后，再读取目标作品事实、生成规则和 prompt 模板。
- 如果网页意见与生成规则冲突，优先执行用户具体意见，并在生成说明中标出冲突。
- 候选正文不自动进入主干；采纳必须经过用户确认和项目工作流。
