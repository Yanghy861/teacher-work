# Luna Max Goal 进度日志

Luna Max 每完成或阻塞一个任务，在文件末尾追加一节。不要删除历史记录；详细证据可链接到 `docs/` 下的报告。

## 记录模板

```markdown
## YYYY-MM-DD HH:mm · TXX · DONE | BLOCKED

- 关键改动：
- 修改文件：
- 验证命令与结果：
- 人工/真实环境验证：
- Git 任务提交：
- 若为审核点，审核基线与候选提交：
- 已知限制：
- 下一任务可依赖的接口：
- 若阻塞，缺少条件与最小解阻动作：
```

## 2026-08-20 13:27 · T01 · BLOCKED

- 关键改动：保留并补齐被中断的 Electron + React + TypeScript scaffold WIP；Main/Preload 使用 CommonJS 输出以保证 Windows Electron/Preload 路径一致；Renderer 使用类型化窄 API；保持 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。未实现 SQLite 或后续业务。
- 修改文件：`package.json`、`package-lock.json`、`electron.vite.config.ts`、`eslint.config.mjs`、`tsconfig.json`、`vitest.config.ts`、`src/main/**`、`src/preload/**`、`src/renderer/**`、`src/shared/**`、`tests/**`、`docs/t01-scaffold.md`、本文件与 `STATUS.md`。
- 验证命令与结果：`npm run typecheck` ✅；`npm run lint` ✅；`npm test` ✅（2 files / 3 tests）；`npm run build` ✅（Electron Main、Preload、Renderer 均产出）。`npm run dev` 能完成 Main/Preload 构建与 Vite 启动，但 Electron 应用退出码为 1，未形成可用窗口。
- 人工/真实环境验证：Windows 真实启动诊断显示，最小 Electron 页面在默认安全沙箱下出现 `render-process-gone: launch-failed:49` 与 `child-process-gone: GPU:crashed:-1073741515`；使用 `--no-sandbox` 才能加载页面。系统 Application Popup 记录为 `electron.exe - 应用程序错误`（`0x00007FF70613631B` 读取地址 `0x8` 失败）。`--no-sandbox` 会降低 Renderer 隔离，未计为通过，也未写入产品配置。诊断夹具已删除，工作区无残留 Electron 进程。
- Git 任务提交：待本次状态记录审查后创建 `blocked(T01): Electron sandbox startup blocked` 本地提交；当前恢复自 `wip(T01)` HEAD，未执行 reset/clean/push。
- 若为审核点，审核基线与候选提交：不适用；T01 未完成，不能进入 T02/T03 或 T03 审核。
- 已知限制：当前受限 Windows 环境无法启动 Electron 的默认 Renderer/GPU 沙箱；不能用关闭沙箱的参数伪造 T01 的 Windows 开发模式验收。
- 下一任务可依赖的接口：无。解阻后从 T01 继续，重新执行 `npm run dev`（不带 `--no-sandbox`）并确认正常启动/退出，随后才可把 T01 标为 `DONE` 并进入 T02。
- 若阻塞，缺少条件与最小解阻动作：缺少可启动 Electron 沙箱/GPU 子进程的 Windows 运行条件。请在具有正常交互式桌面、允许 `D:\teacher_work\node_modules\electron\dist\electron.exe` 及其沙箱子进程执行、并具备所需 Electron Windows 运行时的环境中运行 `npm install`（如需）和 `npm run dev`；确认窗口可见后正常关闭，再恢复同一 checkout 继续 T01。

## 2026-08-20 13:47 · T01 · DONE

- 关键改动：复核并解除先前的环境阻塞判定；持有主窗口引用，在 `did-finish-load` 后显示窗口；为 Windows 25H2 build 26200 添加仅禁用 GPU shader 磁盘缓存的兼容处理。未关闭 Renderer/GPU 沙箱，未加入后续业务。
- 修改文件：`src/main/index.ts`、`src/main/windows-compat.ts`、`tests/windows-compat.test.ts`、`docs/t01-scaffold.md`、`implementation-tasks/STATUS.md`、本文件。
- 验证命令与结果：`npm run typecheck` ✅；`npm run lint` ✅；`npm test` ✅（3 files / 5 tests）；`npm run build` ✅；`git diff --check` ✅（仅有 Git 的 LF→CRLF 工作区提示）。
- 人工/真实环境验证：在 Codex 进程沙箱之外运行 `npm run dev`，保持 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；未传入 `--no-sandbox` 或 `--disable-gpu-sandbox`。Windows 真实窗口显示“教师工作台”、四个占位导航、版本 `0.1.0` 与 Renderer 正文；使用 Alt+F4 正常关闭，Electron 窗口清零，开发命令退出码 0。
- Git 任务提交：本记录与 T01 解阻修复将由 `task(T01): initialize desktop project scaffold` 本地提交收束；不 push。
- 若为审核点，审核基线与候选提交：不适用；下一个 Sol 审核点为 T03。
- 已知限制：从 Codex 的受限命令沙箱内直接启动 GUI 会因 Chromium 默认用户目录的 DPAPI/磁盘缓存访问被拒绝而失败；真实 Windows 验收必须在该进程沙箱之外执行。这不改变应用自身 Electron 沙箱配置。
- 下一任务可依赖的接口：Electron Main/Preload/Renderer/Shared 分层；`window.teacherWorkbench.app.getVersion()` 窄 API；安全窗口配置；Windows build 26200 启动兼容入口。
- 若阻塞，缺少条件与最小解阻动作：无，T01 已解阻，可从 T02 继续。
