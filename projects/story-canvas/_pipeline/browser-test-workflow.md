# Story Canvas Browser Test Workflow

## 触发场景

- 修改 Story Canvas 页面、server、sidecar 读写、历史回滚或交互逻辑。
- 迁移旧工具实现到 `app/` 后做验证。

## 检查项

1. 服务能启动。
2. 页面能加载。
3. 默认作品文件夹可读取。
4. 画布节点非空。
5. 节点拖拽、缩放、展开和选择可用。
6. sidecar 读写不破坏正文。
7. 历史快照和回滚操作有当前版本保护。
8. 截图检查无明显遮挡、重叠和空白画布。

## 备注

当前工具启动入口为：

```powershell
node projects/story-canvas/app/server.mjs
```

旧兼容入口 `node tools/story-canvas/server.mjs` 仅作转发验证。
