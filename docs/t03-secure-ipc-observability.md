# T03 安全 IPC、错误边界与基础日志

## 单向窄边界

Renderer 只能通过 Preload 暴露的两个命名方法通信：

~~~text
window.teacherWorkbench.app.getVersion()
window.teacherWorkbench.workspace.getInfo()
~~~

Preload 内部只接受 IpcChannel 联合类型和两个固定 channel 常量，向 Main 发送空请求对象；没有暴露通用 invoke、任意路径、SQL 或原始 ipcRenderer。Main 通过 registerAppIpc 集中注册和注销同一白名单，dispatchAppIpc 对 channel、请求和服务返回值做运行时校验。getWorkspaceInfo 在 Renderer 启动时贯通到 initializeDefaultWorkspace，返回工作区身份和 schema 版本，不把路径输入交给 Renderer。

共享契约定义 IpcResponse<T>、请求类型、WorkspaceInfo、错误码和响应解析器。内部异常只映射为稳定的 WORKSPACE_UNAVAILABLE 或 INTERNAL_ERROR；返回值不包含 Main 堆栈。Renderer 将稳定错误转换为 TeacherWorkbenchError，根组件由 RendererErrorBoundary 兜底。

## 可观测性与脱敏

StructuredLogger 以 JSON 记录时间、级别、事件和脱敏 details。apiKey、token、authorization、password、secret 等键及带键值格式的错误文本替换为 [REDACTED]；fileContent、documentText、body 等正文键替换为 [OMITTED]。Main 安装 uncaughtException 和 unhandledRejection 监听器，开发日志保留事件、错误类型和脱敏 stack 以便定位。IPC 错误响应和 Renderer 错误序列化不携带 Main stack。

## 验证

~~~text
npm run typecheck
npm run lint
npm test
npm run build
~~~

测试覆盖白名单注册/注销、合法请求、路径/SQL 注入 payload、未知 channel、稳定错误映射、Electron 运行时下的 SQLite 加载、凭据和文件正文脱敏、Renderer Error Boundary，以及 Renderer 不导入 Main、Node 内置模块或数据库驱动。
