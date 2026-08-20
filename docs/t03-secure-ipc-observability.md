# T03 安全 IPC、错误边界与基础日志

## 单向窄边界

T03 的基础 App/Workspace IPC 仍通过两个命名方法通信；L01 在同一边界上追加独立的 `core` 类型化方法，未暴露通用 invoke：

~~~text
window.teacherWorkbench.app.getVersion()
window.teacherWorkbench.workspace.getInfo()
window.teacherWorkbench.core.getOverview()
window.teacherWorkbench.core.createCourse({ title, mode })
~~~

Preload 内部只接受 `IpcChannel` 联合类型和固定 channel 常量，向 Main 发送结构化且运行时校验的请求；没有暴露通用 invoke、任意路径、SQL 或原始 ipcRenderer。Main 通过 `registerAppIpc`/`registerCoreIpc` 分别注册和注销白名单，dispatch 层校验 channel、请求和服务返回值。`getWorkspaceInfo` 在 Renderer 启动时贯通到 `initializeDefaultWorkspace`，返回工作区身份和 schema 版本，不把路径输入交给 Renderer。

共享契约定义 IpcResponse<T>、请求类型、WorkspaceInfo、错误码和响应解析器。内部异常只映射为稳定的 WORKSPACE_UNAVAILABLE 或 INTERNAL_ERROR；返回值不包含 Main 堆栈。Renderer 将稳定错误转换为 TeacherWorkbenchError，根组件由 RendererErrorBoundary 兜底。

## 可观测性与脱敏

StructuredLogger 以 JSON 记录时间、级别、事件和脱敏 details。apiKey、token、authorization、password、secret 等键，以及 Authorization/Bearer、JSON header 和空白分隔形式的敏感文本，替换为 [REDACTED]；body_md、fileContent、documentText、body 等正文键及错误文本正文标记替换为 [OMITTED]。Main 安装 uncaughtException 和 unhandledRejection 监听器，开发日志保留事件、错误类型和脱敏 stack 以便定位。IPC 错误响应和 Renderer 错误序列化不携带 Main stack。

## 验证

~~~text
npm run typecheck
npm run lint
npm test
npm run build
~~~

测试覆盖白名单注册/注销、合法请求、路径/SQL 注入 payload、未知 channel、稳定错误映射、Electron 运行时下的 SQLite 加载、凭据和文件正文脱敏、Renderer Error Boundary，以及由 ESLint 专属规则和 TypeScript AST 守卫覆盖的静态/副作用/动态导入、require 别名、Main 路径、数据库驱动和 Node 全局边界。
