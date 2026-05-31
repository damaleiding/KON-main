import os
import shutil
from PIL import Image

def calculate_coverage(img_path, is_transparent):
    """
    计算图片中有用像素（非完全透明 / 非纯灰底色）所占画布的比例
    """
    try:
        img = Image.open(img_path)
        width, height = img.size
        total_pixels = width * height
        
        # 转换为方便处理的模式
        if is_transparent:
            # 对于透明底图，我们检查 alpha 通道
            img = img.convert("RGBA")
            # 提取 Alpha 通道
            alpha = img.split()[3]
            # 计算 alpha > 0 的像素点数量 (这里设定一个较小的阈值过滤极淡的阴影，比如 > 10)
            valid_pixels = sum(1 for p in alpha.getdata() if p > 10)
        else:
            # 对于实色底图 (灰色 128,128,128)
            img = img.convert("RGB")
            # 设定灰色容差范围（有时 JPG 压缩会导致灰色不纯）
            GRAY_COLOR = (128, 128, 128)
            TOLERANCE = 5
            
            valid_pixels = 0
            for r, g, b in img.getdata():
                if abs(r - GRAY_COLOR[0]) > TOLERANCE or \
                   abs(g - GRAY_COLOR[1]) > TOLERANCE or \
                   abs(b - GRAY_COLOR[2]) > TOLERANCE:
                    valid_pixels += 1
                    
        return valid_pixels / total_pixels if total_pixels > 0 else 0
        
    except Exception as e:
        print(f"  [!] 无法分析图片 {img_path}: {e}")
        return 0

def main():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    source_dir = os.path.join(current_dir, "output")
    target_dir = os.path.join(current_dir, "filtered_output")
    
    # 面积占比阈值：如果实际非底色像素面积小于画布总面积的 0.1% (千分之一)，则认为是“过小”
    # 比如 1920x1080 = 2073600 像素，0.1% 是 2073 个像素（大约 45x45 大小的方块）
    COVERAGE_THRESHOLD = 0.001  

    if not os.path.exists(source_dir):
        print(f"[!] 源目录不存在: {source_dir}")
        return

    # 创建目标目录
    if os.path.exists(target_dir):
        shutil.rmtree(target_dir)
    os.makedirs(target_dir)

    print(f"[*] 开始筛选素材，当前设定最小占比阈值为 {COVERAGE_THRESHOLD*100}% ...")

    total_files = 0
    kept_files = 0

    for root, dirs, files in os.walk(source_dir):
        for file in files:
            if not (file.endswith('.png') or file.endswith('.jpg')):
                continue
                
            # 我们只处理由 composite_images.py 生成在子文件夹里的底图
            if "1_透明背景" not in root and "2_实色背景" not in root:
                continue
                
            total_files += 1
            file_path = os.path.join(root, file)
            is_transparent = "1_透明背景" in root
            
            # 计算占比
            coverage = calculate_coverage(file_path, is_transparent)
            
            if coverage >= COVERAGE_THRESHOLD:
                kept_files += 1
                # 构建对应的目标目录结构
                rel_path = os.path.relpath(root, source_dir)
                dest_folder = os.path.join(target_dir, rel_path)
                os.makedirs(dest_folder, exist_ok=True)
                
                # 复制文件
                dest_path = os.path.join(dest_folder, file)
                shutil.copy2(file_path, dest_path)
                print(f"  [+] 保留 (占比 {coverage*100:.2f}%): {os.path.basename(root)}/{file}")
            else:
                print(f"  [-] 剔除 (占比 {coverage*100:.2f}% 太小): {os.path.basename(root)}/{file}")

    print("\n========================================")
    print(f"[*] 筛选完成！")
    print(f"[*] 总文件数: {total_files}")
    print(f"[*] 成功保留: {kept_files} ({kept_files/total_files*100:.1f}%)")
    print(f"[*] 剔除过小: {total_files - kept_files}")
    print(f"[*] 筛选后的文件已保存在: {target_dir}")

if __name__ == "__main__":
    main()
