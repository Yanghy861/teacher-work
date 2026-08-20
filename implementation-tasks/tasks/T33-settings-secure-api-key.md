# T33 · 设置与 OS-backed API Key 安全存储

**前置：** T32。  
**目标：** 配置模型而不让秘密进入业务库、日志、Renderer 或备份。

## 实现范围

- Migration/SettingsService 保存普通设置：provider、model、可选 endpoint、默认打开方式、备课 Prompt override 与恢复默认；
- 使用 Electron `safeStorage`（或 T08 已验证的等价 OS-backed 方案）加密秘密；密文也放在工作区备份范围之外，并按 workspaceId/provider 隔离；
- safeStorage 不可用时拒绝持久化 Key，显示明确错误；绝不能退化成明文；
- preload 只暴露 set/delete/status（已配置/未配置），Renderer 永远拿不到 Key 或密文；
- provider 调用只能在 Main/受控服务内临时解密；生命周期结束尽量释放引用；
- 日志、错误、测试快照、崩溃报告统一脱敏；
- 设置页支持替换、删除，测试连接按钮先占稳定 API，由 T34 接通。

## 不做

账号系统、云同步、把 Key 放 workspace.db/.env/localStorage、复杂温度参数面板。

## 验收

- 仓库、workspace.db、普通配置和日志中搜索不到测试 Key；
- Renderer/IPC 响应不能取回 Key；不同工作区/provider 不串用；
- 替换/删除/secure storage 不可用都有测试；
- 为 T39 提供明确的备份排除边界。

