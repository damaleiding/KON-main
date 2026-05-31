import os
import json
from playwright.sync_api import sync_playwright

# 针对不同界面定义需要拆分的组件名称和其对应的 CSS 选择器
# 如果没有定义，默认尝试截取 .screen 或 body
PAGE_CONFIGS = {
    "1_入口界面": {
        "top_bar": ".entry-top",             # 顶栏
        "left_info": ".entry-left-info",     # 左侧信息卡片
        "furnace_card": ".furnace-card",     # 炼丹炉卡片
        "bottom_bar": ".entry-bottom",       # 底部操作栏
        "ui_root": ".ui-root"                # 整体 UI
    },
    "2_进入过渡界面": {
        "ui_root": ".screen"
    },
    "3_探索界面": {
        "left_panel": ".left-panel",         # 左侧信息与操作面板
        "right_panel": ".right-panel",       # 右侧药材背包面板
        "bottom_bar": ".bottom-bar",         # 底部提示与快捷键
        "map_viewport": ".map-viewport",     # 中央地图区
        "btn_back": ".btn-back-entry",       # 返回按钮
        "ui_root": "#exploreScreen"          # 整体探索 UI
    },
    "4_丹方手册界面": {
        "manual_panel": ".recipe-manual-panel",  # 丹方手册主体面板
        "ui_root": ".recipe-manual-overlay"      # 包含遮罩的整体层
    },
    "5_物品Tips界面": {
        "tips_panel": ".tips-panel",         # 假设有 .tips-panel
        "ui_root": ".screen"
    },
    "6_天赋界面": {
        "talent_panel": ".talent-panel",     # 假设有 .talent-panel
        "ui_root": ".screen"
    },
    "7_确认凝丹界面": {
        "confirm_panel": ".confirm-panel",   # 假设有 .confirm-panel
        "ui_root": ".screen"
    },
    "8_凝丹QTE界面": {
        "qte_panel": ".qte-panel",           # 假设有 .qte-panel
        "ui_root": ".screen"
    },
    "9_凝丹结果界面": {
        "result_panel": ".result-panel",     # 假设有 .result-panel
        "ui_root": ".screen"
    }
}

# 默认的回退组件配置
DEFAULT_COMPONENTS = {
    "ui_root": ".screen",
    "body": "body"
}

def main():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    sample_dir = os.path.join(current_dir, "sample")
    base_output_dir = os.path.join(current_dir, "output")
    
    # 确保输出总目录存在
    os.makedirs(base_output_dir, exist_ok=True)
    
    # 扫描 sample 目录下所有的 HTML 文件 (递归查找)
    if not os.path.exists(sample_dir):
        print(f"[!] 找不到 sample 目录: {sample_dir}")
        return
        
    html_files = []
    for root, dirs, files in os.walk(sample_dir):
        for f in files:
            if f.endswith('.html'):
                # 保存文件的绝对路径和相对于 sample_dir 的路径，用于构建输出目录
                html_files.append({
                    "abs_path": os.path.join(root, f),
                    "rel_dir": os.path.relpath(root, sample_dir),
                    "filename": f
                })
                
    if not html_files:
        print(f"[!] 在目录 {sample_dir} 中未找到任何 HTML 文件。")
        return

    print(f"[*] 找到 {len(html_files)} 个 HTML 界面原型，准备批量拆分...")

    with sync_playwright() as p:
        # 启动 Chromium 浏览器，开启 headless 模式
        browser = p.chromium.launch(headless=True)
        # 根据设计稿默认分辨率 2400x1080
        page = browser.new_page(
            viewport={"width": 2400, "height": 1080},
            device_scale_factor=1
        )

        for file_info in html_files:
            html_path = file_info["abs_path"]
            filename = file_info["filename"]
            rel_dir = file_info["rel_dir"]
            
            # 提取界面名称，例如从 "炼丹系统_1_入口界面原型.html" 提取 "1_入口界面"
            # 为了更通用的处理，移除常见的后缀
            base_name = filename.replace("炼丹系统_", "").replace("原型.html", "").replace(".html", "")
            
            # 为当前界面创建独立的输出目录，保持相对于 sample 的目录结构
            if rel_dir == ".":
                output_dir = os.path.join(base_output_dir, base_name)
            else:
                output_dir = os.path.join(base_output_dir, rel_dir, base_name)
                
            os.makedirs(output_dir, exist_ok=True)
            
            print(f"\n----------------------------------------")
            print(f"[*] 开始处理: {filename} -> {base_name}")
            
            # 确定该界面的组件配置
            components = DEFAULT_COMPONENTS
            for key in PAGE_CONFIGS:
                if key in base_name:
                    components = PAGE_CONFIGS[key]
                    break
            
            # 加载页面
            file_url = f"file:///{html_path.replace(os.sep, '/')}"
            page.goto(file_url, wait_until="networkidle")
            
            # 隐藏右侧逻辑说明面板，避免截图干扰
            page.evaluate("() => { const el = document.querySelector('.logic-panel'); if(el) el.style.display = 'none'; }")
            
            # 保存坐标数据
            layout_data = {}
            
            # 1. 遍历并截图提取预设组件
            for comp_name, selector in components.items():
                element = page.locator(selector).first
                
                if element.is_visible():
                    bbox = element.bounding_box()
                    layout_data[comp_name] = bbox
                    
                    img_path = os.path.join(output_dir, f"{comp_name}.png")
                    try:
                        element.screenshot(path=img_path, omit_background=True)
                        print(f"  [+] 成功提取预设组件: {comp_name} ({int(bbox['width'])}x{int(bbox['height'])})")
                    except Exception as e:
                        print(f"  [!] 提取预设组件失败 {comp_name}: {str(e)}")
                else:
                    if components is not DEFAULT_COMPONENTS or comp_name == "ui_root":
                        print(f"  [-] 未找到组件或不可见: {comp_name} (Selector: {selector})")
            
            # 2. 智能识别并提取所有的 button 类元素
            # 寻找所有的 <button> 标签以及类名中包含 btn, button 的元素
            btn_locators = page.locator("button, [class*='btn'], [class*='button']")
            btn_count = btn_locators.count()
            
            extracted_btns = set() # 用来去重，防止重复截图同一个按钮
            
            for i in range(btn_count):
                btn_el = btn_locators.nth(i)
                if btn_el.is_visible():
                    bbox = btn_el.bounding_box()
                    
                    # 过滤掉太小的元素（可能不是真正的按钮）
                    if bbox and bbox['width'] > 10 and bbox['height'] > 10:
                        # 尝试获取按钮的文本内容作为名称的一部分，如果没有则用索引
                        btn_text = btn_el.inner_text().strip()
                        # 清理文本，只保留字母数字汉字
                        clean_text = "".join(c for c in btn_text if c.isalnum() or '\u4e00' <= c <= '\u9fff')
                        clean_text = clean_text[:8] # 截取前8个字符
                        
                        btn_name = f"btn_{i}_{clean_text}" if clean_text else f"btn_{i}"
                        
                        # 检查坐标去重（有些选择器可能选中了同一个元素或包裹元素）
                        coord_key = f"{int(bbox['x'])}_{int(bbox['y'])}_{int(bbox['width'])}_{int(bbox['height'])}"
                        if coord_key not in extracted_btns:
                            extracted_btns.add(coord_key)
                            layout_data[btn_name] = bbox
                            
                            img_path = os.path.join(output_dir, f"{btn_name}.png")
                            try:
                                btn_el.screenshot(path=img_path, omit_background=True)
                                print(f"  [+] 成功提取按钮: {btn_name} ({int(bbox['width'])}x{int(bbox['height'])})")
                            except Exception as e:
                                pass
            
            # 保存该界面的布局数据 JSON
            json_path = os.path.join(output_dir, "layout_data.json")
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(layout_data, f, indent=4, ensure_ascii=False)
            print(f"  [*] {base_name} 布局数据已保存: layout_data.json")

        browser.close()
        print(f"\n========================================")
        print("[*] 批量拆分任务全部完成！")

if __name__ == "__main__":
    main()
