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

## 2026-08-20 14:08 · T02 · DONE

- 关键改动：建立与应用安装目录分离的 `WorkspacePaths` 和默认工作区入口，集中解析 `data/workspace.db`、`files/objects`、`search/search.db`、`cache`、`backups`；加入目录创建、写入探针、非法路径和应用内路径拒绝，错误包含稳定错误码且不回退到程序目录。加入 `better-sqlite3` 连接封装、SQLite pragma、显式 close 生命周期与后续一致性 backup API seam；加入幂等迁移 runner、`schema_migrations`、`workspace_meta`、`workspaceId` 和 `schemaVersion` 持久化。未创建 nodes/files/search/ai_runs 业务表，未实现备份/恢复。
- 修改文件：`.gitignore`、`package.json`、`package-lock.json`、`tsconfig.json`、`src/main/workspace/workspace-paths.ts`、`src/main/workspace/workspace-service.ts`、`src/main/db/connection.ts`、`src/main/db/migrations.ts`、`tests/workspace-foundation.test.ts`、`docs/t02-workspace-sqlite.md`、本文件与 `STATUS.md`。
- 验证命令与结果：`npm run typecheck` ✅；`npm run lint` ✅；`npm test` ✅（4 files / 10 tests）；`npm run build` ✅（Electron Main、Preload、Renderer 均产出）；T02 专项测试覆盖首次/重复打开、失败迁移回滚、构建目录替换后工作区身份保留、默认路径隔离及非法/应用内/非目录/不可写路径拒绝。
- 人工/真实环境验证：本任务只涉及本地工作区目录和 SQLite 基础层，未写入开发者真实用户目录；测试工作区均位于系统临时目录，仓库中的 `out` 仍为构建产物并未纳入 Git。
- Git 任务提交：状态与进度记录、T02 实现和测试将由 `task(T02): establish workspace and sqlite foundation` 本地提交收束；不 push。
- 若为审核点，审核基线与候选提交：不适用；T02 不是审核点。下一个 Sol 审核点为 T03，T03 完成后必须停止等待审核。
- 已知限制：SQLite 原生模块的 Electron ABI/打包集成属于后续运行时交付验证；T02 当前提供 Main 侧连接封装和 Node/Vitest 可重复测试，未提前实现 T03 IPC 或 T42 打包流程。
- 下一任务可依赖的接口：`WorkspacePaths`、`initializeWorkspace`/`initializeDefaultWorkspace`、`WorkspaceDatabase`、`runMigrations`、`workspaceMigrations`、`readWorkspaceIdentity`。

## 2026-08-20 14:23 · T03 · DONE

- 关键改动：在 shared 层定义 `IpcChannel`、请求类型、`IpcResponse<T>`、稳定错误码、`WorkspaceInfo` 和运行时响应 schema；Preload 只暴露 `app.getVersion` 与 `workspace.getInfo` 两个白名单方法，内部 channel 采用联合类型，不暴露通用 invoke、路径或 SQL。Main 集中注册/注销 handler，拒绝未知 channel、非空/注入 payload，验证服务返回值，并将内部异常映射为不含 Main stack 的稳定错误。Renderer 启动时通过 `getWorkspaceInfo` 贯通到 T02 工作区服务；加入 Renderer Error Boundary。加入结构化 JSON logger、apiKey/token/authorization/password/secret 脱敏、文件正文字段省略，以及 Main 未捕获异常和未处理 Promise 拒绝记录。
- 修改文件：`src/shared/ipc-contracts.ts`、`src/shared/preload-api.ts`、`src/preload/index.ts`、`src/main/ipc/app-ipc.ts`、`src/main/logging/structured-logger.ts`、`src/main/logging/main-error-handlers.ts`、`src/main/index.ts`、`src/renderer/App.tsx`、`src/renderer/main.tsx`、`src/renderer/renderer-error-boundary.tsx`、`src/renderer/styles.css`、`tests/security-baseline.test.ts`、`tests/renderer-boundary.test.ts`、`tests/ipc-security.test.ts`、`tests/logging-redaction.test.ts`、`tests/renderer-error-boundary.test.ts`、`docs/t03-secure-ipc-observability.md`、本文件与 `STATUS.md`。
- 验证命令与结果：`npm run typecheck` ✅；`npm run lint` ✅；`npm test` ✅（7 files / 16 tests）；`npm run build` ✅（Electron Main、Preload、Renderer 均产出）；Electron 43.4.1 的 Node runtime 加载 `better-sqlite3` 并执行内存 SQLite 查询 ✅。测试覆盖合法/非法 payload、路径与 SQL 注入、未知 channel、稳定错误响应、白名单注册/注销、脱敏、正文省略、Renderer Error Boundary 和 Renderer 进程边界。
- 人工/真实环境验证：本任务未写入真实教学资料；IPC 业务验证使用依赖注入的 Main service 和临时/内存测试数据，Electron 原生模块 ABI 已在当前 Electron runtime 中单独验证。T01 的真实 Windows 窗口验收仍以已有 T01 DONE 记录为准。
- Git 任务提交：`e360204499552029f86be0afbcd1096c7fa38b9d`（`task(T03): secure ipc and observability baseline`）已创建；不 push。
- 若为审核点，审核基线与候选提交：T03 是 Sol 审核点，审核基线为 `checkpoint-T00`；候选提交 SHA 为 `e360204499552029f86be0afbcd1096c7fa38b9d`，`SOL_REVIEW_STATUS.md` 已标为 `AWAITING_REVIEW`；送审提交为 `review(T03): request Sol review`，提交后立即停止，不进入 T04。
- 已知限制：T03 只提供工作区信息示例和基础错误/日志边界，不实现业务 CRUD；未知 channel 在 Electron 原生层会被拒绝，内部可测试路由同时返回稳定 `UNKNOWN_CHANNEL` 错误。
- 下一任务可依赖的接口：`window.teacherWorkbench.app.getVersion()`、`window.teacherWorkbench.workspace.getInfo()`、`IpcResponse<T>`/错误码、`registerAppIpc`、`StructuredLogger`、`RendererErrorBoundary`。

## 2026-08-20 15:08 · T03 · DONE

- 复审修复：针对 T03 Sol 报告的 P1/P2 问题，所有显式工作区入口现在都必须携带并校验应用安装目录；安装目录本身及其子目录稳定返回 `WORKSPACE_PATH_INSIDE_APP`。日志脱敏覆盖 `body_md`、嵌套正文、JSON/header/Bearer/Basic 和空白分隔的敏感文本；Renderer 边界改为专属 ESLint 规则与 TypeScript AST 检查，覆盖静态/副作用/动态导入、require 别名、Main 路径、数据库驱动和 Node 全局。
- 修改文件：`src/main/workspace/workspace-paths.ts`、`src/main/workspace/workspace-service.ts`、`tests/workspace-foundation.test.ts`、`src/main/logging/structured-logger.ts`、`tests/logging-redaction.test.ts`、`eslint.config.mjs`、`tests/renderer-boundary.test.ts`、`docs/t02-workspace-sqlite.md`、`docs/t03-secure-ipc-observability.md`、`implementation-tasks/STATUS.md`、本文件。
- 验证命令与结果：`npm run typecheck` ✅；`npm run lint` ✅；`npm test` ✅（7 files / 17 tests）；`npm run build` ✅；Electron 43.4.1 Node runtime 加载 `better-sqlite3` 并执行内存 SQLite 查询（返回 1）✅。
- Git 任务提交：`a3ea75af88e06b14af20a4a643c68db7d9cf83dc`（`fix(T03-review): close Sol findings`）已创建；不 push。
- 审核交接：T03 审核区间仍为 T01–T03；新候选 SHA 为 `a3ea75af88e06b14af20a4a643c68db7d9cf83dc`，`SOL_REVIEW_STATUS.md` 已改回 `AWAITING_REVIEW`；将创建新的 `review(T03): request Sol review`，随后停止，不进入 T04，不创建通过标签。

## 2026-08-20 15:31 +08:00 · T03 · REVIEW_HANDOFF

- 关键改动：修复第一次复审剩余的 Renderer 裸 Node 内置模块绕过问题；ESLint 与 TypeScript AST 守卫均使用 Node `builtinModules` 生成完整的裸模块名和 `node:` 模块名集合，不再手写少数 Node 内置模块；回归夹具新增裸 `http`、`worker_threads` 和未手写枚举的 `inspector`。
- 修改文件：`eslint.config.mjs`、`tests/renderer-boundary.test.ts`、本文件与 `SOL_REVIEW_STATUS.md`。
- 验证命令与结果：`npm run typecheck` ✅；`npm run lint` ✅；`npm test` ✅（7 files / 17 tests）；`npm run build` ✅（Main、Preload、Renderer 均生成 production 产物）；Electron 43.4.1 主进程 ABI 探针加载 `better-sqlite3` 并执行内存 SQLite 查询，Node 24.18.1、modules ABI 148、查询返回 1 ✅。一次性探针已移除，未进入提交。
- Git 任务提交：`bfad00596e2b8ce5e0958829169d0141f99528e9`（`fix(T03-review): cover all Node builtin modules`），不 push。
- 若为审核点，审核基线与候选提交：T03 审核区间为 T01–T03，基线为 `checkpoint-T00`；候选 SHA 已更新为 `bfad00596e2b8ce5e0958829169d0141f99528e9`，`SOL_REVIEW_STATUS.md` 已改为 `AWAITING_REVIEW`；待创建新的 `review(T03): request Sol review` 送审提交后立即停止，不进入 T04。
- 已知限制：等待 Sol 复审；Luna 未标记 `PASS`，未创建 `checkpoint-T03-pass` 标签。
- 下一任务可依赖的接口：本次仅收紧既有 Renderer 架构边界守卫，T04 仍须等待 T03 Sol 审核通过后才能开始。

## 2026-08-20 16:02 +08:00 · T04 · BLOCKED

- 关键改动：建立独立的 `spikes/document-parser/run-spike.mjs` 样本驱动实验工具和 Adapter 契约说明；工具只输出匿名样本元数据、解析状态、位置计数、耗时与 RSS 峰值，不保存文件名、路径或正文；补充 Spike A 结果文档和样本/结果目录的 Git 忽略规则；为 Spike `.mjs` 增加 Node lint 环境配置。未接入生产解析器、OCR 或业务 SearchService。
- 修改文件：`spikes/document-parser/run-spike.mjs`、`spikes/document-parser/README.md`、`docs/spike-results.md`、`.gitignore`、`eslint.config.mjs`、`implementation-tasks/STATUS.md`、本文件。
- 验证命令与结果：`node --check spikes/document-parser/run-spike.mjs` ✅；工具 `--help` ✅；对当前 `docs` 目录运行样本门槛检查，机器报告为 `blocked`、样本数 0、`.pptx/.docx/.pdf/.xlsx` 均为 0，拒绝加载 Adapter ✅；`npm run typecheck` ✅；`npm run lint` ✅；`npm test` ✅（7 files / 17 tests）；`npm run build` ✅。
- 人工/真实环境验证：当前 checkout 没有脱敏真实 `.pptx`、`.docx`、`.pdf` 或 `.xlsx` 样本，未运行任何候选解析库；因此没有伪造中文保真、slide/page/sheet 位置、公式/表格降级、耗时、峰值内存或 Electron/Windows 兼容结论。
- Git 任务提交：待 staged diff 审查后创建 `blocked(T04): missing real document samples` 本地提交；不 push。
- 若为审核点，审核基线与候选提交：不适用；T04 尚未完成，不能进入 T05，也不能推进 T08。
- 已知限制：T04 的真实前置条件不足；T05 还要求 T04 的真实提取结果和至少 10,000 个 chunk，T06 还要求 Windows 真机及实际 Office/WPS 保存流程，均不能用合成样本、mock 或静态结论替代。
- 下一任务可依赖的接口：提供仓库外的 30～100 份脱敏真实样本（至少 PPTX、DOCX、文本 PDF、扫描 PDF、XLSX，覆盖中文/数学/表格/图片/大文件），并提供或允许安装候选 Adapter 后，从 `spikes/document-parser/README.md` 的命令恢复 T04；解阻前不得开始 T05–T08。
- 若阻塞，缺少条件与最小解阻动作：缺少可访问的真实脱敏样本目录。用户只需提供仓库外样本目录并允许按 Adapter 契约运行候选解析器；恢复后先运行样本门槛检查和 Spike A，补齐 `docs/spike-results.md` 真实指标与结论，再从 T04 继续。

## 2026-08-20 16:51 +08:00 · T04 · DONE

- 关键改动：解除 T04 真实样本阻塞；选用并安装 `officeparser@7.3.0`，实现独立 `officeparser-adapter.mjs`，统一返回 `text/chunks/position/status`，显式关闭 OCR；扩展 Spike runner 输出安全诊断信号和候选标签；补齐 Spike A 真实结果、候选库许可/维护/打包风险与生产约束。
- 修改文件：`package.json`、`package-lock.json`、`spikes/document-parser/run-spike.mjs`、`spikes/document-parser/officeparser-adapter.mjs`、`spikes/document-parser/README.md`、`docs/spike-results.md`、`eslint.config.mjs`、`implementation-tasks/STATUS.md`、本文件。
- 验证命令与结果：sample manifest 40/40 SHA-256 一致 ✅；真实 Spike 命令运行 40 份：35 `indexed`、5 `no_text`、0 `parse_failed`，12,512 chunks，219,662 chars，峰值 RSS 487,915,520 bytes ✅；扫描 PDF 5/5 正确为 `no_text`；Electron 43.4.1 / Node 24.18.1 smoke 解析 PPTX、文本 PDF、XLSX 均成功并退出码 0 ✅；`npm run typecheck` ✅；`npm run lint` ✅；`npm test` ✅（7 files / 17 tests）；`npm run build` ✅。
- 人工/真实环境验证：样本来自仓库外只读目录，未复制或提交真实文件；报告不含正文、文件名或路径。确认 PPTX/PDF/XLSX 位置元数据可用；记录 DOCX heading path 不稳定、数学表达式和复杂表格降级仍需后续 Spike/任务验证。
- Git 任务提交：待 staged diff 审查后创建 `task(T04): document parser spike` 本地提交；不 push。
- 若为审核点，审核基线与候选提交：不适用；T04 已完成，下一任务为 T05，T08 仍是本次目标审核点。
- 已知限制：`officeparser` 直接依赖包含 PDF.js/Tesseract 资源，虽然本次 OCR 关闭且 smoke 通过，正式打包仍需复核资源加载与体积；DOCX heading 位置需在生产 Adapter 层补齐或明确降级。
- 下一任务可依赖的接口：`spikes/document-parser/officeparser-adapter.mjs` 的自有解析结果契约、`indexed/no_text/parse_failed` 状态、PPTX slide/PDF page/XLSX sheet 位置，以及 `docs/spike-results.md` 中的候选决策与风险。
