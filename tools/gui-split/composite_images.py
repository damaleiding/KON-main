import os
import json
from PIL import Image

def process_folder(folder_path):
    json_path = os.path.join(folder_path, "layout_data.json")
    if not os.path.exists(json_path):
        return

    print(f"\n[*] 正在处理文件夹: {os.path.basename(folder_path)}")
    
    with open(json_path, "r", encoding="utf-8") as f:
        layout_data = json.load(f)

    # 画布的基础尺寸（从 layout_data.json 中得知游戏实际 UI 画布为 1920x1080）
    CANVAS_WIDTH = 1920
    CANVAS_HEIGHT = 1080

    # 如果有 ui_root，使用 ui_root 的实际宽度（不再强制使用2400）
    if "ui_root" in layout_data:
        root_bbox = layout_data["ui_root"]
        # 我们取最大的宽度，但不盲目扩展，直接信任 UI Root 的尺寸
        CANVAS_WIDTH = int(root_bbox["width"])
        CANVAS_HEIGHT = int(root_bbox["height"])

    # 创建输出子目录
    transparent_dir = os.path.join(folder_path, "1_透明背景")
    solid_dir = os.path.join(folder_path, "2_实色背景")
    os.makedirs(transparent_dir, exist_ok=True)
    os.makedirs(solid_dir, exist_ok=True)

    for comp_name, bbox in layout_data.items():
        if comp_name == "ui_root":
            continue  # 跳过整体图

        img_path = os.path.join(folder_path, f"{comp_name}.png")
        if not os.path.exists(img_path):
            print(f"  [!] 找不到组件图片: {comp_name}.png")
            continue

        try:
            # 打开原组件图片
            comp_img = Image.open(img_path).convert("RGBA")
            
            # 坐标转换
            x, y = int(bbox["x"]), int(bbox["y"])

            # ---------------------------------------------------------
            # 制作图1：除部件外都是透明通道 (Transparent Background)
            # ---------------------------------------------------------
            transparent_canvas = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
            transparent_canvas.paste(comp_img, (x, y), comp_img)
            
            out_trans = os.path.join(transparent_dir, f"{comp_name}_trans.png")
            transparent_canvas.save(out_trans, "PNG")

            # ---------------------------------------------------------
            # 制作图2：除部件外都是灰色底图 (Solid Gray Background)
            # ---------------------------------------------------------
            # 灰色底色设置 (R, G, B, A) - 这里的 A 设置为 255 表示不透明
            GRAY_COLOR = (128, 128, 128, 255) 
            solid_canvas = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), GRAY_COLOR)
            solid_canvas.paste(comp_img, (x, y), comp_img)
            
            # 保存为 RGB 以丢弃不需要的透明通道，减小文件体积
            out_solid = os.path.join(solid_dir, f"{comp_name}_solid.jpg")
            solid_canvas.convert("RGB").save(out_solid, "JPEG", quality=95)

            print(f"  [+] 成功合成: {comp_name} -> 透明图 & 实色底图")
        
        except Exception as e:
            print(f"  [!] 处理 {comp_name} 时发生错误: {str(e)}")

def main():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(current_dir, "output")

    if not os.path.exists(output_dir):
        print(f"[!] 找不到输出目录: {output_dir}")
        return

    print("[*] 开始生成 ComfyUI 定位底图...")
    
    # 遍历 output 目录下的所有生成的界面文件夹
    for folder_name in os.listdir(output_dir):
        folder_path = os.path.join(output_dir, folder_name)
        if os.path.isdir(folder_path):
            process_folder(folder_path)
            
    print("\n[*] 所有界面的底图合成任务完成！")

if __name__ == "__main__":
    main()
