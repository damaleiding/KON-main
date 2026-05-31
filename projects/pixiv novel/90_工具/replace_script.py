import os

files = [
    r'c:\Users\Admin\Documents\trae_projects\novel\人偶番外\第十一章（成人化重设·上）.md',
    r'c:\Users\Admin\Documents\trae_projects\novel\人偶番外\第十一章（成人化重设·下）.md'
]

replacements = {
    '亲密入口': '阴道口',
    '前端接口': '花穴',
    '内侧润化': '穴内淫水',
    '润化确认': '淫水确认',
    '润化补充': '淫水补充',
    '热源': '肉棒',
    '交叠处': '交合处',
    '第一阶段贴合': '第一阶段插入',
    '第二阶段贴合': '第二阶段抽插',
    '贴合稳定': '插合稳定',
    '贴合节奏': '抽插节奏',
    '低压贴合': '浅层抽插',
    '亲密区': '私密肉穴',
    '交叠': '交媾',
    '辅助支架': '炮架子',
    '润化': '淫水润滑',
    '淫水润滑剂': '润滑剂',
    '淫水润滑完成': '淫水润滑完成',
    '分泌淫水确认': '淫水确认'
}

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    for old, new in replacements.items():
        content = content.replace(old, new)
        
    # Manual enhancements for more explicit erotica
    content = content.replace('雷欧的动作让本体一下一下撞在她胸前', '雷欧粗暴的抽插让本体一下一下撞在她胸前')
    content = content.replace('每次贴合都比刚才更深一点', '每一次肉棒的挺进都比刚才更深一点')
    content = content.replace('把本体送到申请人面前并进行基础协助', '把本体送到申请人面前任其肏弄并进行基础协助')
    content = content.replace('雷欧粗暴的肉体撞击声', '雷欧粗暴的肉体撞击声')
    content = content.replace('透明润化剂涂在两人即将交合的位置', '透明润滑剂涂在肉棒和阴道口即将交合的位置')
    content = content.replace('用更柔软的方式确认淫水润滑够不够', '用舌头舔舐阴道口来确认淫水够不够')
    content = content.replace('唇齿贴近本体的封存边缘', '唇齿贴近本体娇嫩的阴唇边缘，伸出舌头舔弄')
    content = content.replace('帮她和我们交媾', '帮她和我们交媾')
    content = content.replace('最适合交媾的位置', '最适合肉棒挺进的肉穴角度')
    content = content.replace('最适合申请人使用的角度', '最适合肉棒肏弄的淫荡角度')
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print('Done')
