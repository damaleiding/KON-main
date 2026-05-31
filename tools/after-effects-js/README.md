# After Effects JavaScript 脚本空间

这里用于整理 AE / After Effects 的 JavaScript 脚本。AE 里直接运行的脚本优先使用 `.jsx`，可复用函数使用 `.jsxinc`，只有面向 Node.js 或外部构建工具的辅助脚本才使用 `.js`。

## 目录

- `scripts/`: 当前工作脚本，以及可在 AE 里通过 `File > Scripts > Run Script File...` 直接运行的 `.jsx` 文件。
- `lib/`: 可复用 ExtendScript helper，建议使用 `.jsxinc`。
- `snippets/`: 可复制到正式脚本里的小片段。
- `templates/`: 新脚本起点模板。
- `docs/`: AE 脚本笔记、流程记录、API 限制和交接说明。

## 当前入口

从 `scripts/workbench.jsx` 开始。它已经包含 AE 脚本常用的 undo group、项目兜底、错误提示和日志输出结构。

已有正式脚本：

- `scripts/extract-frames.jsx`: 从当前激活合成按帧号范围和步长抽帧，默认输出 PNG 序列单帧任务。
- `scripts/dropped-frame-effect.jsx`: 给选中图层添加视频被抽帧/掉帧的低帧率播放效果。
- `scripts/motion-trail-effect.jsx`: 复制选中图层并生成 Echo 长曝光拖影/残影效果。

## 编写约定

- 面向 AE 的脚本默认按 ExtendScript 兼容写法处理，优先使用 `var` 和传统函数。
- 会修改合成、图层或项目结构的逻辑，放进 `app.beginUndoGroup(...)` / `app.endUndoGroup()`。
- 可复用函数放进 `lib/`，不要把长期复用的逻辑只留在一次性工作脚本里。
- 脚本、目录和稳定资产名使用英文；说明文档和流程记录默认使用中文。
- 不要在可复用脚本里写死某台机器的用户目录。
