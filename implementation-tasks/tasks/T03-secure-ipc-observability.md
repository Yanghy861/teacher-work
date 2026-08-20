# T03 · 安全 IPC、错误边界与基础日志

**前置：** T01、T02。  
**目标：** 建立 Renderer 与 Main 之间唯一、类型化、可验证的通信边界，并让基础错误可定位但不泄密。

## 实现范围

- 在 shared 层定义请求、响应、错误码和运行时校验 schema；
- preload 只暴露白名单 API；禁止 Renderer 调用任意 channel、文件路径或 SQL；
- Main 端集中注册/注销 handler，校验所有外部输入，并把内部异常映射为稳定错误；
- 加入最小 `getWorkspaceInfo` 示例，贯通 Renderer → preload → Main → service；
- 增加 Renderer Error Boundary、Main 未捕获异常记录和结构化日志；
- 日志默认脱敏 `apiKey/token/authorization/password` 等字段，不记录文件正文；
- 加入架构边界 lint/test，防止 Renderer 导入 Main、Node 内置模块或数据库驱动。

## 不做

不实现具体业务 CRUD，不暴露“通用 invoke”或“执行任意 SQL/路径”后门。

## 验收

- 合法 IPC 示例可用，非法 payload、未知 channel、路径注入均被拒绝；
- Renderer 获得稳定错误码而非 Main 堆栈；开发日志仍能定位问题；
- 脱敏测试证明模拟 Key 不会出现在日志/错误序列化结果中；
- typecheck、lint、测试、production build 通过。

