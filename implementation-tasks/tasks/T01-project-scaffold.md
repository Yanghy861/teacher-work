# T01 · 初始化桌面项目骨架

**前置：** 无。  
**目标：** 得到可开发、可测试、可打包的 Electron + React + TypeScript 最小项目，不实现任何业务功能。

## 实现范围

- 使用 npm 初始化当前仓库；采用当前稳定、维护正常的 Electron 构建方案（优先验证 electron-vite），记录版本与选择理由；
- 建立 `src/main`、`src/preload`、`src/renderer`、`src/shared` 分层；
- 开启 `contextIsolation`，关闭 `nodeIntegration`，Renderer 不暴露通用 Node/IPC 能力；
- 提供最小窗口和占位导航（我的课程、素材库、学生、设置），不做业务交互；
- 配置统一的 `dev`、`build`、`typecheck`、`lint`、`test` 脚本和最小测试基线；
- 配置生产构建的基础元数据，但本任务不制作正式安装包。

## 不做

SQLite、树、文件导入、搜索、AI、备份、复杂样式或首页。

## 验收

- Windows 上开发模式能启动并正常退出；
- `npm run typecheck`、`npm run lint`、`npm test`、`npm run build` 全部通过；
- Renderer 中不存在 `fs`、`path`、数据库或 Electron Main API 的直接导入；
- 安全配置有自动测试或静态断言，防止后续误开 `nodeIntegration`。

