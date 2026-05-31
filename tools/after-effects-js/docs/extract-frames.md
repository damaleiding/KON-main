# AE 抽帧脚本

脚本路径：

`tools/after-effects-js/scripts/extract-frames.jsx`

## 用法

1. 在 AE 里打开目标合成，并让它成为当前激活合成。
2. 运行 `File > Scripts > Run Script File...`。
3. 选择 `scripts/extract-frames.jsx`。
4. 选择抽帧输出的父目录。
5. 按弹窗输入：
   - `File prefix`: 输出文件名前缀，默认用合成名。
   - `Start frame`: 起始帧，按合成起点从 0 开始算。
   - `End frame`: 结束帧。
   - `Extract every N frames`: 每隔多少帧抽一帧，`1` 表示逐帧。
   - `Output module template`: 默认 `PNG Sequence`。
   - `Output extension`: 默认 `png`。

脚本会把每一帧作为一个单帧 Render Queue 任务加入队列，并询问是否立刻渲染。

## 注意

- 默认范围来自当前合成的 Work Area。
- 输出会自动放进带时间戳的子文件夹，避免覆盖旧结果。
- 如果你的 AE 没有名为 `PNG Sequence` 的 Output Module Template，脚本会列出当前可用模板；把对应模板名填回弹窗即可。
- 输出文件名里带有 `_f0000_` 这样的帧号标记。后面的 `[#####]` 由 AE 的序列输出模块处理，用来避免单帧序列互相覆盖。
