# T01 项目骨架记录

## 技术选择

T01 采用 `electron-vite` 作为 Electron + Vite 构建方案，并使用 React 19、TypeScript、Vitest 和 ESLint flat config。选择理由是：它为 Main、Preload、Renderer 提供明确的构建入口，配置量小，适合 V1 的进程边界；测试与类型检查可以在同一 npm 工作流中运行。Main/Preload 使用 CommonJS 输出以兼容 Windows Electron 启动和 Preload 文件加载；Renderer 仍由 Vite 生成浏览器 ESM。`electron-vite@5` 的 peer 约束要求 Vite 5–7，因此使用当前可兼容的 Vite 7 与 `@vitejs/plugin-react@5`，不使用 Vite 8/React 插件 6 的不兼容组合。`typescript-eslint` 当前稳定版要求 TypeScript `<6.1.0`，因此使用 TypeScript 6.0.x，避免用 `--legacy-peer-deps` 掩盖不兼容。

依赖版本以 2026-08-20 初始化时 npm registry 返回的稳定版本为基线，具体版本和范围记录在 `package.json`，解析后的精确版本由 `package-lock.json` 固化。

## 安全基线

- `contextIsolation: true`；
- `nodeIntegration: false`；
- `sandbox: true`；
- Preload 只通过 `contextBridge` 暴露 `teacherWorkbench.app.getVersion()`；
- Renderer 不导入 Node、Electron、SQLite 或任意文件系统 API；
- `tests/security-baseline.test.ts` 与 `tests/renderer-boundary.test.ts` 对上述边界做自动断言。

## Windows 启动兼容性

- Main 持有唯一主窗口引用，窗口关闭后再清空，避免 `BrowserWindow` 被提前回收；
- 窗口在 Renderer 的 `did-finish-load` 后显示，不依赖 Windows 25H2 build 26200 上可能缺失的 `ready-to-show` 事件；
- Windows 25H2 build 26200 仅关闭 Chromium GPU shader **磁盘缓存**，规避该版本的缓存目录兼容问题；Renderer 的进程沙箱、上下文隔离和 Node 隔离均保持开启；
- 禁止把 `--no-sandbox` 或 `--disable-gpu-sandbox` 写入项目启动配置。

在 Codex 的受限命令沙箱内直接启动 GUI 时，Chromium 默认用户目录会出现 DPAPI 与磁盘缓存 `Access denied`，继而导致嵌套 GPU 沙箱进程失败。这是验收命令环境限制，不是产品运行配置。T01 的真实 Windows 验收在 Codex 进程沙箱之外执行，并保持 Electron 自身安全沙箱开启。

T01 只提供占位导航，不包含 SQLite、树、文件导入、搜索、AI 或备份业务。
