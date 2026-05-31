# AE 视频抽帧感脚本

脚本路径：

`tools/after-effects-js/scripts/dropped-frame-effect.jsx`

这个脚本做的是“视频被抽帧/掉帧/低帧率播放”的画面效果，不是把帧导出成图片。它会给选中的图层添加 AE 原生 `Posterize Time` 效果。

## 用法

1. 在 AE 里打开目标合成。
2. 选中一个或多个视频、预合成或需要抽帧感的图层。
3. 运行 `File > Scripts > Run Script File...`。
4. 选择 `scripts/dropped-frame-effect.jsx`。
5. 选择模式：
   - `1`: 每 N 帧保留一帧。比如 24fps 合成输入 `2`，效果约等于 12fps；输入 `3`，约等于 8fps。
   - `2`: 直接输入目标 FPS。比如 `8`、`12`、`15`。

## 建议数值

- 轻微抽帧感：`12fps` 或每 `2` 帧保留一帧。
- 明显卡顿感：`8fps` 或每 `3` 帧保留一帧。
- 更强的机械/监控/故障感：`6fps` 或更低。

## 和导出抽帧脚本的区别

- `extract-frames.jsx`: 把合成帧真正渲染成图片文件。
- `dropped-frame-effect.jsx`: 保持视频在 AE 里，但让画面按低帧率持帧播放。
