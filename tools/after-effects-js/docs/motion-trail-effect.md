# AE 拖影 / 长曝光残影脚本

脚本路径：

`tools/after-effects-js/scripts/motion-trail-effect.jsx`

这个脚本用于做“视频里有拖影、残影、长曝光感”的效果。它会复制选中的视频层，生成一层专门的拖影层，然后给拖影层叠加：

- `Echo`: 叠加过去的多帧，形成残影。
- `Fast Box Blur`: 让残影边缘更软。
- `Screen` 叠加模式: 让亮部残影叠出来，不把原视频完全盖住。
- 可选 `Posterize Time`: 做卡帧式拖影。

原图层会保留，脚本只新增一层 `- motion trail`，方便随时关掉或删除。

## 用法

1. 在 AE 里打开目标合成。
2. 选中一个或多个视频层或预合成层。
3. 运行 `File > Scripts > Run Script File...`。
4. 选择 `scripts/motion-trail-effect.jsx`。
5. 选择预设：
   - `1`: 轻微残影。
   - `2`: 长曝光拖影，最接近参考图。
   - `3`: 卡顿式拖影，同时带一点抽帧感。

## 调整方向

- 拖影太重：降低拖影层的 `Opacity`，或减少 Echo 的 `Number Of Echoes`。
- 拖影不够长：增加 Echo 的 `Number Of Echoes`。
- 残影太硬：提高 `Trail Softness` 的 blur radius。
- 想更像故障/卡帧：用预设 `3`，或额外叠加 `dropped-frame-effect.jsx`。

## 注意

`Echo` 主要对视频内部的运动有效，比如人手移动、灯光移动、镜头里物体移动。如果只是图层本身用 Position 在合成里移动，建议先把它预合成，再对预合成层运行这个脚本。
