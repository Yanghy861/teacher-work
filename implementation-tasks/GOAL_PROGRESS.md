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

## 2026-08-20 17:04 +08:00 · T05 · DONE

- 关键改动：新增独立 `spikes/chinese-search/run-benchmark.mjs` 和匿名最小真值 `ground-truth.json`；以 T04 真实 Adapter 重建语料，比较 raw/规范化 FTS5 trigram、应用层 TokenExtractor、短词 fallback、标题/文件名精确匹配；临时 SQLite 与报告均不进入 Git。
- 验证结果：40 份样本生成 12,512 个非空 chunk，超过 10,000 门槛；索引 164.545 ms、临时数据库 5,197,824 bytes、Token 40,741；Normalizer 等价检查 6/6 通过；每个固定查询均有真值、top-k 排名和判定，另有 2 个额外人工负例；冷首查和热 P50/P95 已写入机器报告；`npm run typecheck`、`npm run lint`、`npm test`（7 files / 17 tests）、`npm run build` 均通过 ✅。
- 生产决策：Level 1 冻结为 SearchNormalizer + FTS5 trigram；规范化后不超过 2 个字符走短词 fallback；标题/文件名仅做精确字段匹配。当前 TokenExtractor 只允许作为候选层，必须经过规范化正文/数学 token 二次校验，不能直接采用其 30 个负例误召结果；不引入大型搜索系统。
- 已知限制：`AMC8`、`P16`、`|x|`、`∠ABC`、`△ABC` 在本批真实语料无正例，按负例记录；复杂公式、图片文字、题号和更丰富标题语义需后续真实资料继续验证。
- 修改文件：`.gitignore`、`spikes/chinese-search/run-benchmark.mjs`、`spikes/chinese-search/ground-truth.json`、`docs/spike-results.md`、`implementation-tasks/STATUS.md`、本文件。
- Git 任务提交：待 staged diff 审查后创建 `task(T05): chinese math search spike` 本地提交；不 push。
- 若为审核点，审核基线与候选提交：不适用；T05 已完成，下一任务为 T06，T08 仍是本次目标审核点。
- 下一任务可依赖的接口：SearchNormalizer 规则、FTS5 trigram 优先路径、短词 fallback 边界、TokenExtractor 二次校验条件和匿名 benchmark/真值格式。

## 2026-08-20 17:49 +08:00 · T06 · DONE

- 关键改动：建立 Chokidar `4.0.3` Office/WPS 保存事件实验器；实现 dirty 标记、可配置 debounce、多次 size+mtime+SHA-256 稳定采样、可读重试、Hash 去重、同文件任务合并、任务执行中保存后的单次重检，以及 watcher 收尾后的最终只读快照。
- 修改文件：`.gitignore`、`package.json`、`package-lock.json`、`spikes/office-watcher/run-experiment.mjs`、`spikes/office-watcher/README.md`、`docs/spike-results.md`、`implementation-tasks/STATUS.md`、本文件。
- 验证命令与结果：`node --check spikes/office-watcher/run-experiment.mjs` ✅；`npm run lint` ✅；WPS 修正版 XLSX 实验报告记录自定义参数、`mtimeMs`、最终快照和稳定采样；完整三格式报告记录 `add/change/unlink`、锁/临时文件、Hash 去重与任务合并；`git diff --check`、`npm run typecheck`、`npm test`、`npm run build` 将在提交前复核。
- 人工/真实环境验证：WPS Office `12.1.0.28043` 在 Windows 11 25H2/build `26200` 上实际打开并保存由 WPS 创建的 DOCX、PPTX、XLSX 临时文件；执行未改保存、连续 `Ctrl+S`、另存为、内容变化保存和关闭流程。未修改已有用户文档；本机未检测到 Microsoft Office，因此不作 Microsoft Office 结论。
- Git 任务提交：待 staged diff 审查后创建 `task(T06): office watcher spike` 本地提交；不 push。
- 若为审核点，审核基线与候选提交：不适用；T06 不是审核点，下一任务为 T07，T08 仍是本次目标审核点。
- 已知限制：WPS 自动恢复式保存、大文件容量和保存中退出时序本轮未稳定触发，已在 `docs/spike-results.md` 明确标为未宣称；后续不能从 T06 结果外推这些语义。Microsoft Office 未安装，未声称其行为。
- 下一任务可依赖的接口：`spikes/office-watcher/run-experiment.mjs` 的匿名事件/决策报告、Chokidar 候选、推荐 debounce/stability/readability/hash/task 参数范围。
- 若阻塞，缺少条件与最小解阻动作：无；核心真实 WPS 多格式验收已完成。若后续产品需要未覆盖的自动恢复、大文件或保存中退出承诺，应在对应真实环境补做专项实验。

## 2026-08-20 18:03 +08:00 · T07 · DONE

- 关键改动：建立只操作固定 `tmp/t07-crash-recovery` 的 crash harness；父进程在子进程 checkpoint 后实际强杀，并验证临时文件/原子 rename、SQLite 事务回滚、`processing → pending`、Hash、解析、派生索引和损坏输入队列恢复。
- 修改文件：`.gitignore`、`spikes/crash-recovery/common.mjs`、`spikes/crash-recovery/worker.mjs`、`spikes/crash-recovery/run-harness.mjs`、`spikes/crash-recovery/README.md`、`docs/spike-results.md`、`implementation-tasks/STATUS.md`、本文件。
- 验证命令与结果：`node --check` 三个 harness 模块 ✅；`node spikes/crash-recovery/run-harness.mjs --repeat 1` 8/8 通过 ✅；正式 `--repeat 2` 16/16 通过、16/16 `SIGKILL`、恢复失败 0 ✅；越界 root 负向测试拒绝 ✅；全量 `npm run lint`、`npm run typecheck`、`npm test`、`npm run build` 将在提交前复核。
- 人工/真实环境验证：在当前 Windows 11 25H2/build `26200` 上实际启动并强杀 Node 子进程；同卷临时文件 rename 与 SQLite 重启完整性均实测。未触碰真实用户目录、真实教学资料或 WPS 用户文档。
- Git 任务提交：待 staged diff 审查后创建 `task(T07): crash recovery spike` 本地提交；不 push。
- 若为审核点，审核基线与候选提交：不适用；T07 不是审核点，下一任务为 T08，T08 是本次目标审核点。
- 已知限制：未制造外部 Office 文件占用、跨卷/网络共享 rename、杀毒软件干预或真实生产队列；对 Windows `EPERM/EBUSY` 只记录有界重试建议，不宣称所有锁语义已通过。
- 下一任务可依赖的接口：`spikes/crash-recovery/run-harness.mjs` 的严格临时 root 策略、checkpoint/强杀协议、匿名断言报告，以及 Spike D 中的文件/事务/processing/索引恢复顺序。
- 若阻塞，缺少条件与最小解阻动作：无；当前强杀与恢复验收证据齐全。

## 2026-08-20 18:09 +08:00 · T08 · DONE

- 关键改动：基于四项真实 Spike 证据写入四份 ADR，冻结 `DocumentParser` 自有结果契约、SearchNormalizer/FTS5 trigram 与短词/TokenExtractor 边界、Chokidar dirty/debounce/stable/readable/Hash/单任务重检策略、临时文件/SQLite/processing/派生索引恢复状态机；将 `officeparser` 固定为 `7.3.0`、`chokidar` 固定为 `4.0.3`。
- 修改文件：`package.json`、`package-lock.json`、`docs/adr/ADR-001-document-parser.md`、`docs/adr/ADR-002-chinese-math-search.md`、`docs/adr/ADR-003-office-watcher.md`、`docs/adr/ADR-004-crash-recovery.md`、`spikes/decision-gate/verify-gate.mjs`、`implementation-tasks/STATUS.md`、本文件。
- 验证命令与结果：`node spikes/decision-gate/verify-gate.mjs` ✅（19/19 checks）；四项 Spike 均为 `DONE` 且无 `PENDING`；`node --check spikes/decision-gate/verify-gate.mjs` ✅；`npm run typecheck`、`npm run lint`、`npm test`（7 files/17 tests）、`npm run build` ✅；四份 ADR 均包含证据、决策、依赖检查和限制。
- 人工/真实环境验证：T08 复核 T04 的 40 份真实样本、T05 的 12,512 chunks/真值 benchmark、T06 的 WPS Windows 实测和 T07 的 16 次 SIGKILL/恢复报告；未新增真实资料或电脑界面操作。
- Git 任务提交：待 staged diff 审查后创建 `task(T08): freeze spike decisions` 本地提交；不 push。随后按协议生成候选 SHA 和送审提交。
- 若为审核点，审核基线与候选提交：T08 审核区间为 T04–T08，基线为 `checkpoint-T03-pass`；候选 SHA 在任务提交后填写到 `SOL_REVIEW_STATUS.md`，状态改为 `AWAITING_REVIEW`，并创建 `review(T08): request Sol review`。
- 已知限制：`officeparser` 的 DOCX heading、复杂表格/公式与打包资源仍需后续格式任务/Windows 交付复核；搜索语料对部分术语无正例；WPS 自动恢复/大文件/保存中退出和外部文件锁未宣称；跨卷/网络路径与最终打包恢复仍未证实。上述均已列为 ADR known limitations，不作为未解释的“通过”。
- 下一任务可依赖的接口：四份 ADR、`spikes/decision-gate/verify-gate.mjs`、精确锁定的候选版本，以及 `docs/spike-results.md` 的样本/方法/指标/失败边界。
- 若阻塞，缺少条件与最小解阻动作：无；T08 任务证据齐全，现按硬闸门协议送 Sol 审核并停止。

## 2026-08-20 18:11 +08:00 · T08 · REVIEW_HANDOFF

- 审核区间：T04–T08；审核基线：`checkpoint-T03-pass`。
- 候选提交 SHA：`43e368d1f423fdaf60a586dd6da94d219fced719`（`task(T08): freeze spike decisions`）。
- 审核状态：`SOL_REVIEW_STATUS.md` 已将 T08 改为 `AWAITING_REVIEW`；Luna 未修改为 `PASS`，未创建 `checkpoint-T08-pass` 标签。
- 送审证据：四项 Spike 均为 `DONE`；四份 ADR 已冻结方案与限制；`node spikes/decision-gate/verify-gate.mjs --require-done` 为 19/19；`npm run typecheck`、`npm run lint`、`npm test`（7 files/17 tests）、`npm run build` 通过。
- 建议 Sol 重点：审查 `T04–T07` 真实证据是否足以支撑 ADR 决策；确认 `officeparser@7.3.0` 与 `chokidar@4.0.3` 的许可证/维护/打包边界；确认 SearchNormalizer/短词 fallback/TokenExtractor 二次校验、watcher 单文件任务重检、临时文件与 `processing` 恢复顺序没有越过 V1 范围；复核所有已知限制未被写成通过。
- 下一步：创建 `review(T08): request Sol review` 本地送审提交后停止，等待 Sol 审核；不进入 T09，不 push。

## 2026-08-20 21:30 +08:00 · T08 · DONE

- 关键改动：按产品负责人决定，将 T06 从“穷举 WPS 保存内部时序”收缩为“刷新核对保证正确性、watcher 仅可选加速”；启动后台核对、焦点返回、重新打开和手动刷新均为权威触发，自动恢复、大文件保存、保存中退出不再阻塞 V1。同步修改主规格、T06/T18/T19/T20/T31/T32 与 ADR-003，删除未提交的 21 组合证据门禁，新增零 watcher 事件刷新探针。其余复审项升级到 `officeparser@7.5.1`，精确 override `pdfjs-dist@6.2.108`，增加三类损坏 OOXML、恶意 PDF 与 Electron runtime 探针，并让 T08 gate 校验真实机器结果而非文字状态。
- 修改文件：产品主规格；`implementation-tasks/GLOBAL_CONSTRAINTS.md`、任务/索引/追踪/状态文件；`package.json`、`package-lock.json`；`spikes/document-parser/**`、`spikes/office-watcher/**`、`spikes/decision-gate/verify-gate.mjs`；`tests/office-refresh-reconciliation.test.*`；`docs/spike-results.md` 与四份 ADR。
- 验证命令与结果：T04 用 40 份外部脱敏样本重跑为 35 indexed、5 no_text、0 parse_failed、12,797 chunks、222,881 chars；T05 重跑 12,797 chunks，Normalizer 6/6 且搜索方案结论保持；刷新核对探针 10/10 断言通过，watcherRequiredForCorrectness=false；损坏/恶意夹具探针通过；T07 16/16 SIGKILL 恢复通过；官方 npm registry audit 为 0 vulnerabilities；Electron 43.4.1 / Node 24.18.1 / PDF.js 6.2.108 smoke 对 PPTX/PDF/XLSX 均 indexed；T08 非最终 gate 23/23 通过。完整 typecheck、lint、18 项测试、production build 与 `--require-done` gate 在提交前最终复核。
- 人工/真实环境验证：复用已有 WPS Office `12.1.0.28043` 的 DOCX/PPTX/XLSX 普通保存与打开未改证据；本次不再操作 WPS、不触碰真实教学资料。刷新正确性由真实临时文件探针验证，不依赖 WPS 的具体保存事件。
- Git 任务提交：待最终 diff 与验证通过后创建 `fix(T08-review): close parser security and refresh findings`；不 push。
- 若为审核点，审核基线仍为 `checkpoint-T03-pass`；创建修复提交后填写新的候选 SHA，并将 T08 改回 `AWAITING_REVIEW` 后停止。
- 已知限制：工作台长期在后台、文件从资源管理器直接修改且可选 watcher 同时漏报时，搜索可能暂时陈旧；下一次启动、焦点返回、重新打开或手动刷新恢复。UI 必须展示索引更新时间/更新中状态。最终 packaged Electron 的 PDF worker 资源一致性留到 T42 再验。
- 下一任务可依赖的接口：权威 refresh reconciliation 触发契约、可选 watcher dirty 加速、`officeparser@7.5.1` 自有 Adapter、PDF.js 6.2.108 安全处置、损坏输入 `parse_failed` 契约与 23 项 T08 gate。T09 仍须等待 Sol PASS。

## 2026-08-20 21:32 +08:00 · T08 · REVIEW_HANDOFF

- 审核区间：T04–T08；审核基线：`checkpoint-T03-pass`。
- 新候选提交 SHA：`8099887b6f367fb63e6c07ce55a5fdf867252bda`（`fix(T08-review): close parser security and refresh findings`）。
- 需求调整：产品负责人明确取消 T06 的 WPS 自动恢复/大文件保存/保存中退出穷举门禁，改为启动、焦点返回、重新打开和手动刷新进行权威核对；watcher 只做加速。Sol 应按更新后的主规格、T06/T18/T31 任务契约和 ADR-003 审核，不再要求旧的 21 组合矩阵。
- 送审证据：`node spikes/decision-gate/verify-gate.mjs --require-done` 23/23；typecheck、lint、8 个测试文件/18 项测试、production build 通过；40 份样本 T04/T05 重跑、三个损坏 OOXML、恶意 PDF、npm audit 0 vulnerabilities、Electron 43.4.1/PDF.js 6.2.108 smoke、T07 16/16 与零 watcher 刷新核对探针均通过。
- 状态：`SOL_REVIEW_STATUS.md` 已改回 `AWAITING_REVIEW`；待创建 `review(T08): request Sol review` 送审提交后立即停止，不进入 T09，不创建通过标签，不 push。

## 2026-08-20 · T08 · SCOPE_UPDATE

- 产品负责人裁决：旧 T09–T42 的后续企业级实施链退役；T01–T08 已完成成果继续保留，T08 通过 Sol 后只执行 L01–L12。
- 核心目标保持为“管资料、找资料、AI 备课”；后续删去 external roots、生产 watcher、持久化索引调度/精确续传、Worker 池、四套独立 Parser 任务、AI Workflow 状态机、在线并发备份与完整升级矩阵。
- 简化后的替代：导入 managed 副本；启动/焦点返回/重新打开/手动刷新；一个顺序 Worker 与重启重扫；统一 Parser；三类草稿独立生成/保存；空闲态备份；一种可复现 Windows 交付方式。
- 仍保留硬门槛：原资料不被覆盖、Renderer/Main/秘密隔离、路径防逃逸、managed 临时写入加原子重命名、长任务不阻塞 Main、Key 不明文落盘/进日志/进备份、AI 只保存草稿。
- 控制文件已切换为 `LEAN_V1_DECISIONS.md`、`lean-tasks/L01–L12`、新 `TASK_INDEX.md`、`STATUS.md`、`TRACEABILITY.md`、`GLOBAL_CONSTRAINTS.md`、`VERSION_CONTROL.md` 与 `LUNA_MAX_GOAL.md`；主规格增加高优先级 Lean 裁决。旧任务文件只保留历史参考。
- 验证结果：Markdown 相对链接检查通过；`node spikes/decision-gate/verify-gate.mjs --require-done` 为 23/23；`npm run typecheck`、`npm run lint`、`npm test`（8 files / 18 tests）、`npm run build` 全部通过。
- 下一步：创建新的 T08 修复候选并重新送 Sol 审核；T08 未 `PASS` 前不进入 L01，不 push。

## 2026-08-20 · T08 · REVIEW_HANDOFF（Lean V1）

- 审核区间：T04–T08 的有效 Spike/安全成果，加本次后续范围裁决；审核基线仍为 `checkpoint-T03-pass`。
- 新候选提交 SHA：`fe44b795830bdbcf96f17cc53a86402c1f9f0cd3`（`fix(T08-review): adopt Lean V1 execution scope`）。
- 产品裁决：旧 T09–T42 及其后续审核点退役；T08 通过后活动实施链只有 L01–L12，审核点只有 L04/L07/L10/L12。Sol 不应再以旧 enterprise 级增强条件拒绝通过。
- 送审证据：Markdown 相对链接检查通过；T08 gate 23/23；typecheck、lint、8 files / 18 tests、production build 全部通过；26 个范围文件已在候选提交中可审计保存。
- 建议 Sol 重点：确认简化没有放松原资料保护、Renderer/Main/秘密边界、managed 原子写入、路径防逃逸、后台长任务和 AI 草稿隔离；确认 Goal 的高成本非核心替代规则与四个后续阶段闸门一致。
- 状态：T08 已重新设为 `AWAITING_REVIEW`；创建本次 `review(T08): request Sol review` 元数据提交后停止，不进入 L01、不创建通过标签、不 push。

## 2026-08-20 23:20 +08:00 · L01 · DONE

- 关键改动：在 T02 SQLite migration runner 上新增 schema v2；实现 `nodes` 三层课程树、课程模式、学生实体、课程—学生关系和普通 note。`NodeService` 提供创建/读取/重命名/移动/排序/软删除/恢复，校验父级类型和循环；所有正式写入使用 Main 侧 transaction。新增 `CoreDataService`、core IPC 白名单及 Preload runtime guards；Renderer 的“我的课程”页提供课程、阶段、课次、学生和记录的按钮/表单/列表流程。
- 修改文件：`src/main/db/migrations.ts`、`src/main/data/node-service.ts`、`src/main/data/core-data-service.ts`、`src/main/ipc/core-ipc.ts`、`src/shared/core-contracts.ts`、`src/shared/ipc-contracts.ts`、`src/shared/preload-api.ts`、`src/preload/index.ts`、`src/main/index.ts`、`src/renderer/App.tsx`、`src/renderer/course-dashboard.tsx`、`src/renderer/styles.css`、`tests/core-data.test.ts`、`tests/core-ipc.test.ts`、`tests/workspace-foundation.test.ts`、`docs/l01-core-data-tree.md`、`docs/t02-workspace-sqlite.md`、`docs/t03-secure-ipc-observability.md`、`implementation-tasks/STATUS.md`、本文件。
- 验证命令与结果：`npm test` ✅（10 files / 24 tests）；`npm run typecheck` ✅；`npm run lint` ✅；`npm run build` ✅（Main/Preload/Renderer）。额外核对迁移版本为 v2、额外 payload/SQL 字段被拒绝、循环移动和子树恢复负向路径通过。
- 人工/真实环境验证：在 Windows 11 25H2/build 26200 的真实 Electron 窗口完成课程 → 阶段 → 课次 → 学生 → 记录；页面即时显示完整树与 note，关闭后读取隔离临时 `workspace.db` 确认节点、link 和 note 均落盘。第一次把临时 root 放在仓库下被 `WORKSPACE_PATH_INSIDE_APP` 正确拒绝，改用系统临时目录后通过；未接触真实教学资料。
- Git 任务提交：待最终 staged diff 审查后创建 `lean(L01): core data and tree` 本地提交；不 push。
- 若为审核点，审核基线与候选提交：L01 不是审核点；下一里程碑为 L02，L04 前不得进入搜索阶段。
- 已知限制：基础树采用按钮/列表，没有拖拽、1000+ 节点优化或 UI 软删除菜单；managed 文件和素材副本留给 L02，属于 Lean 计划内范围，不构成阻塞。
- 下一任务可依赖的接口：schema v2、`NodeService`/`CoreDataService`、`window.teacherWorkbench.core` 类型化 API，以及课程/学生/课次/note 的 overview 数据。

## 2026-08-20 · L02 · DONE

- 关键改动：在 schema v3 中新增 `files`、`lesson_files`、`student_files`；实现 `ManagedFileService`，将导入和课次/学生副本写入 `files/objects/<uuid>/content`，使用同目录临时文件、可读性/大小校验和原子重命名，再以 SQLite transaction 登记。支持受控打开、显示位置、软删除/恢复和 `origin_file_id` 独立副本关系。
- 边界改动：新增显式 `files:*` IPC 白名单与 Preload runtime guards；导入只由 Main 内部 native picker 提供源路径，Renderer 只能传空请求或登记 file ID/目标 ID，任意 Renderer 路径字段、路径穿越和未登记对象均拒绝。
- 验证结果：`npm test` ✅（12 files / 32 tests）；`npm run typecheck` ✅；`npm run lint` ✅；`git diff --check` ✅。测试覆盖导入/打开、两个课次与学生副本隔离、软删除/恢复、路径越界/未登记 ID、复制失败清理、IPC 注册注销和稳定错误响应。
- 人工/真实环境验证：L02 使用系统临时目录和脱敏文本 fixture，不接触真实教学资料；Electron 原生窗口 UI 资料页面留给 L03，未把 L03 范围提前并入本里程碑。
- Git 任务提交：待 staged diff 审查后创建 `lean(L02): managed files and materials` 本地提交；不 push。
- 若为审核点，审核基线与候选提交：不适用；L02 不是 Sol 审核闸门，下一里程碑为 L03，L04 完成后才送 Sol 审核并停止。
- 已知限制 / Later：文件页面、素材/学生页面入口、外部编辑后 size/mtime/Hash 刷新核对属于 L03；不实现后台 watcher、external roots、去重、精细进度或断点续传。
- 下一任务可依赖的接口：schema v3、`ManagedFileService`、`window.teacherWorkbench.files` 类型化 API、`files/objects/<uuid>/content` 受控布局和 `MANAGED_FILE_ERROR` 错误码。

## 2026-08-21 · L03 · DONE

- 关键改动：schema v4 为 managed 文件保存 `mtime_ms` 与 `content_hash`；刷新服务在启动、焦点返回、资料 overview、重新打开和手动刷新路径核对受控对象，按需异步 SHA-256，并以 `files:content-changed` 通知 Renderer。素材库、课程页当前课次/学生资料区和学生页接入导入、刷新、打开、显示位置、关联、软删除/恢复入口。
- 修改文件：`src/main/db/migrations.ts`、`src/main/files/managed-file-service.ts`、`src/main/ipc/file-ipc.ts`、`src/main/index.ts`、`src/preload/index.ts`、`src/shared/file-contracts.ts`、`src/shared/ipc-contracts.ts`、`src/shared/preload-api.ts`、`src/renderer/App.tsx`、`src/renderer/course-dashboard.tsx`、`src/renderer/managed-files-panel.tsx`、`src/renderer/styles.css`、相关测试、`docs/l03-file-pages-refresh.md`、本文件与 `STATUS.md`。
- 验证结果：`npm test` ✅（12 files / 33 tests）；`npm run typecheck` ✅；`npm run lint` ✅；`npm run build` ✅；`git diff --check` ✅。自动化覆盖首次 Hash、无变化短路、外部编辑后的 Hash 变化和 open IPC 事件；既有 L02 文件边界回归继续通过。
- 人工/真实环境验证：在隔离临时 workspace 中通过真实 Windows Electron 窗口创建 L03 课程结构，用原生文件选择器导入测试资料，确认资料列表显示“已核对”，再验证加入当前课次和加入当前学生均生成独立副本。临时 fixture、workspace 与 Electron 进程均已清理，未接触真实教学资料；未启用 `--no-sandbox`，未关闭 `contextIsolation` 或 GPU sandbox。
- Git 任务提交：待 staged diff 审查后创建 `lean(L03): file pages and refresh` 本地提交；不 push。
- 若为审核点，审核基线与候选提交：不适用；L03 不是审核点。下一步为 L04，L04 完成后填写候选 SHA、标记 `AWAITING_REVIEW` 并创建送审提交，随后停止。
- 已知限制 / Later：watcher 只保留为后续加速选项；缩略图、Markdown 编辑器、全文预览、复杂进度和精确续传不在 L03 范围。当前权威一致性来自启动、焦点返回、重新打开和手动刷新核对。
- 下一任务可依赖的接口：schema v4、`ManagedFileService.refreshFile/refreshAll`、`ManagedFileRefreshResult`、`files:content-changed` 事件和 `ManagedFilesPanel`。

## 2026-08-21 · L04 · DONE

- 关键改动：补充阶段 1 端到端验收夹具，串起一对一课程、两个不连续阶段、两个课次、学生、资料导入、两个独立课次副本、外部编辑后的 Main 刷新核对以及软删除/恢复。L04 未新增非核心子系统，沿用 L01–L03 的 Main/Preload 边界、受控 UUID 对象目录和临时文件原子写入。
- 修改文件：`tests/phase1-acceptance.test.ts`、`docs/phase1-acceptance.md`、本文件与 `STATUS.md`。
- 验证结果：`npm test` ✅（13 files / 34 tests）；`npm run typecheck` ✅；`npm run lint` ✅；`npm run build` ✅；`git diff --check` ✅。L04 专项夹具确认两个课次副本 Hash/内容隔离、外部编辑只影响副本 A、刷新识别变化、删除后 active 列表隐藏且 overview 可见、恢复后可受控打开。
- 人工/真实环境验证：复用本次 L03 在 Windows 11 25H2/build 26200 的真实 Electron UI smoke 证据：sandbox/contextIsolation 保持开启，native picker 导入脱敏 fixture，资料列表核对并关联当前课次/学生，窗口正常关闭；临时 fixture/workspace 已删除，未触碰真实教学资料。L04 的完整数据流程由隔离 workspace 端到端测试覆盖。
- Git 任务提交：待 staged diff 审查后创建 `lean(L04): phase1 acceptance` 本地提交；不 push。
- 若为审核点，审核基线与候选提交：L04 审核基线为 `checkpoint-T08-pass`；任务提交后将填写完整候选 SHA、把 `SOL_REVIEW_STATUS.md` 的 L04 改为 `AWAITING_REVIEW`，创建送审提交并立即停止，不进入 L05。
- 已知限制 / Later：未增加 external roots、生产 watcher、拖拽、极端磁盘/强杀矩阵和大规模压力测试；这些不属于 L04 的 Lean V1 验收条件。
- 下一任务可依赖的接口：L01–L03 的课程树、`ManagedFileService`、`ManagedFilesPanel`、刷新/内容变化事件；L05 只能在 Sol 将 L04 标为 `PASS` 后开始。

## 2026-08-21 · L04 · REVIEW_HANDOFF

- 审核区间：L01–L04；审核基线：`checkpoint-T08-pass`。
- 候选提交 SHA：`b09467d110d9b6ea662e0eb111475e362f702548`（`lean(L04): phase1 acceptance`）。
- 送审证据：`docs/phase1-acceptance.md` 与 `tests/phase1-acceptance.test.ts`；一对一课程、两个不连续阶段、两个课次副本、外部编辑后刷新、源/副本隔离、软删除/恢复均已验证；`npm test`（13 files / 34 tests）、typecheck、lint、production build、diff check 和既有 Windows Electron UI smoke 通过。
- 安全边界：未提交真实教学资料、workspace、Key、日志或构建产物；继续保持 Renderer/Main/路径/原子写入边界；未启用 `--no-sandbox`，未关闭 `contextIsolation` 或 sandbox。
- 审核状态：`SOL_REVIEW_STATUS.md` 已将 L04 标为 `AWAITING_REVIEW`；Luna 未写 `PASS`，未创建 `checkpoint-L04-pass`。
- 下一步：创建 `review(L04): request Sol review` 元数据提交后立即停止，等待 Sol 审核；不得进入 L05。

## 2026-08-21 · L04 · SOL_REVIEW_PASS

- 审核区间：L01–L04；审核基线：`checkpoint-T08-pass` (`bb0d07a34a22c74b4e8b7600989466a73f33dc6b`)。
- 候选提交：`b09467d110d9b6ea662e0eb111475e362f702548`；送审提交：`f43528f1082291c39d8e15348d1925d58062ac2a`。
- 独立验证：`npm test`（13 files / 34 tests）、`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 均通过；代表性资料流程、路径/IPC/原子写入/副本隔离边界复核通过；既有 Windows Electron UI smoke 证据满足 L04 要求。
- Findings：P0–P3 无；未发现资料损坏、路径逃逸、Renderer/Main 边界绕过或副本串写风险。
- 审核结果：`SOL_REVIEW_STATUS.md` 的 L04 已改为 `PASS`，审核报告已写入；由于当前环境无法写入 `.git/index`，`review(L04): pass` 提交与 `checkpoint-L04-pass` 标签尚未创建。
- 下一任务：Luna 可开始 L05；不得跳过后续 L07 审核闸门。

## 2026-08-21 · L04 · GIT_HANDOFF_COMPLETE

- 独立审核后的本地交接已完成：`f231b49`（`review(L04): pass`）与 `checkpoint-L04-pass` 已创建；工作区在进入 L05 前干净。

## 2026-08-21 · L05 · DONE

- 关键改动：schema v5 为 managed files 增加 `indexed_hash` 与 `pending/indexed/no_text/parse_failed` 状态；新增可删除重建的 `search/search.db`、文档/范围/chunk 表和 SQLite FTS5 trigram；实现版本化 `SearchNormalizer`、两字及以下 `LIKE` fallback、文件名/节点标题独立匹配，以及文件、节点、note、正文 chunk 的统一 `SearchService`。
- 修改文件：`src/main/db/migrations.ts`、`src/main/search/search-database.ts`、`src/main/search/search-normalizer.ts`、`src/main/search/search-service.ts`、`src/shared/search-contracts.ts`、`tests/search-core.test.ts`、`tests/workspace-foundation.test.ts`、`docs/l05-search-core.md`、本文件与 `STATUS.md`。
- 验证命令与结果：`npm test` ✅（14 files / 37 tests）；`npm run typecheck` ✅；`npm run lint` ✅；`npm run build` ✅；`git diff --check` ✅。回归覆盖中文/英文/数字/数学查询、特殊字符、短词 fallback、文件名/标题、原文 snippet/position、课程范围、同 Hash 幂等、Hash 替换、parse_failed 和删除后 pending 状态。
- 人工/真实环境验证：使用隔离临时 workspace、SQLite 和脱敏文本 fixture；未读取或提交真实教学资料、运行工作区、日志、Key 或构建产物。L05 不接入解析器、Worker 或 Renderer 搜索 UI。
- Git 任务提交：待 staged diff 审查后创建 `lean(L05): search core` 本地提交；不 push。
- 已知限制 / Later：TXT/MD/PDF/DOCX/PPTX/XLSX 解析与顺序 Worker 留给 L06；`search.db` 与 `workspace.db` 不做跨库原子事务；OCR、向量搜索、复杂 tokenizer、持久化索引队列和搜索 UI 留给后续里程碑。
- 下一任务可依赖的接口：`openSearchDatabase`、`SearchService.indexFile/indexNode/indexNote/replaceFileChunks/search/getIndexState`、`SearchNormalizer`、schema v5 的文件索引状态字段；L06 可接入统一 Parser 与顺序 Worker，L07 再完成搜索 UI/重建阶段闸门。

## 2026-08-21 · L06 · DONE

- 关键改动：新增 `DocumentIndexWorker`，在一个 `worker_threads.Worker` 中顺序执行 managed 文件 Hash、TXT/MD 解析和 `officeparser@7.5.1` 的 PDF/DOCX/PPTX/XLSX 解析；Main 仅编排登记 ID、接收纯数据、短事务更新文件 Hash/状态并调用 L05 SearchService。启动扫描未索引/Hash 不一致文件，导入和刷新后自动排队；同 Hash 的 indexed/no_text/parse_failed 不重复自动重试，显式 enqueue 可整文件重做。
- 修改文件：`src/main/parser/document-parser.ts`、`src/main/index.ts`、`src/main/ipc/file-ipc.ts`、`tests/document-parser.test.ts`、`package.json`、`package-lock.json`、`docs/l06-unified-parser-worker.md`、本文件与 `STATUS.md`。
- 验证命令与结果：`npm test` ✅（15 files / 41 tests）；`npm run typecheck` ✅；`npm run lint` ✅；`npm run build` ✅；`git diff --check` ✅。覆盖 TXT/MD、no_text、损坏 DOCX 不阻塞后续文件、Hash/line position、启动重扫、状态写回、Main/Worker 退出顺序和同 Hash 失败不重复排队。
- 人工/真实环境验证：L06 使用隔离临时 workspace、脱敏文本和损坏 Office fixture；未复制或提交真实教学资料。T04/T08 已有 40 份真实样本与 Electron parser smoke 证据继续作为真实格式基线；当前 checkout 无可提交真实样本，因此未伪造新的 Office 真实 smoke。
- Git 任务提交：待 staged diff 审查后创建 `lean(L06): unified parser worker` 本地提交；不 push。
- 已知限制 / Later：未建立 Worker Pool、持久任务队列、精确取消/续传或 OCR；最终 packaged Electron PDF.js worker 资源一致性与 Windows 交付留给 L12。`officeparser` 已从 devDependencies 移入 runtime dependencies，版本仍精确锁定 7.5.1，PDF.js override 保持 6.2.108。
- 下一任务可依赖的接口：`DocumentIndexWorker.enqueue/enqueueIfNeeded/rebuildPending/close`、统一 `ParsedDocument`/`IndexedFileResult` 契约、Main 启动/焦点/导入后的索引触发；L07 可实现搜索 UI、删除 search.db 重建和阶段 2 验收闸门。

## 2026-08-21 · L07 · DONE

- 关键改动：新增全局搜索页 `SearchPanel`，显示文件/节点/记录、受控路径、片段、位置、来源类型和四类索引状态；新增 `search:query`、`search:get-status`、`search:rebuild` 白名单 IPC 与 Preload runtime guards。重建会清空派生 `search.db`、重建节点/note，并通过 L06 顺序 Worker 按当前 Hash 重做文件索引；结果打开仍只接受登记 `fileId`。
- 修改文件：`src/shared/search-contracts.ts`、`src/shared/ipc-contracts.ts`、`src/shared/preload-api.ts`、`src/preload/index.ts`、`src/main/search/search-service.ts`、`src/main/ipc/search-ipc.ts`、`src/main/index.ts`、`src/renderer/App.tsx`、`src/renderer/search-panel.tsx`、`src/renderer/styles.css`、`tests/search-ipc.test.ts`、`tests/phase2-acceptance.test.ts`、`docs/phase2-acceptance.md`、本文件与 `STATUS.md`。
- 验证命令与结果：`npm test` ✅（17 files / 43 tests）；`npm run typecheck` ✅；`npm run lint` ✅；`npm run build` ✅；`git diff --check` ✅。覆盖任意路径 payload 拒绝、搜索/状态/重建 IPC、中文/数学/短词/文件名、课程范围、索引状态、删除派生库后文件/节点/note 恢复。
- 人工/真实环境验证：L07 使用隔离 workspace 和脱敏 fixture；既有 T04/T08 外部真实样本与 Electron parser smoke 作为多格式真实基线。本次未复制或提交真实教学资料；当前 checkout 无可安全提交真实样本。
- Git 任务提交：待 staged diff 审查后创建 `lean(L07): search ui rebuild gate` 本地提交；不 push。
- 审核区间与候选：L05–L07；审核基线 `checkpoint-L04-pass`。任务提交后将写入候选 SHA、把 L07 设为 `AWAITING_REVIEW`，创建 `review(L07): request Sol review` 元数据提交并停止，不自行写 `PASS`。
- 已知限制 / Later：实时 watcher、OCR、复杂查询语言、精确 Office 跳转、向量搜索和大规模强杀矩阵不属于 Lean V1；搜索结果打开只支持登记文件 ID，节点/记录结果显示来源但不伪造外部跳转。
- 下一任务可依赖的接口：`window.teacherWorkbench.search.query/rebuild/getStatus`、`SearchPanel`、`SearchService.clearDerivedIndex/rebuildCoreSources/getIndexStatusSummary`、`SEARCH_IPC_CHANNELS`；L08 只能在 Sol 将 L07 标为 `PASS` 后开始。

## 2026-08-21 · L07 · REVIEW_HANDOFF

- 审核区间：L05–L07；审核基线：`checkpoint-L04-pass`。
- 候选提交 SHA：`4866971f96f74d21bd65348f48b1a8f63e8b4193`（`lean(L07): search ui rebuild gate`）。
- 送审证据：`docs/phase2-acceptance.md`；全局搜索页、中文/数学/短词/文件名结果、来源位置、索引状态、删除 search.db 后重建、搜索 IPC 白名单与任意路径 payload 拒绝均有自动化覆盖；`npm test`（17 files / 43 tests）、`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过。
- 安全边界：Renderer 只使用类型化 Preload search/files API；搜索结果打开只接受登记 `fileId`；重建只操作派生 search.db，不覆盖 workspace.db 或 managed 原资料；未提交真实教学资料、Key、日志、数据库或构建产物。
- 已知限制：本次未新增真实 Office 样本；T04/T08 外部真实样本与 Electron parser smoke 作为格式基线。实时 watcher、OCR、复杂查询语言、精确 Office 跳转和大规模强杀矩阵留在 Later。
- 审核状态：`SOL_REVIEW_STATUS.md` 的 L07 已设为 `AWAITING_REVIEW`；Luna 不修改为 `PASS`，不创建 `checkpoint-L07-pass`。
- 下一步：创建 `review(L07): request Sol review` 元数据提交后立即停止；只有独立 Sol 会话明确 `PASS` 后才可开始 L08。

## 2026-08-21 · L07 · SOL_REVIEW_CHANGES_REQUIRED

- 审核区间：L05–L07；审核基线：`checkpoint-L04-pass` (`6a9fc7c45cf75f054aef3b860e25d83e90a34e8f`)。
- 候选提交：`486697145855a5a66827f47d84323ff71ed6a2d5`；送审提交：`04918272dd83d772bd19f54e43e455a3f7f747ee`。
- 独立验证：`npm test`（17 files / 43 tests）、typecheck、lint、production build、diff check 中的常规门禁通过；搜索 UI/IPC/重建自动化通过。
- 阻塞 finding：真实隔离 workspace 中导入 `sample-001.pptx`、`sample-011.docx`、`sample-025.pdf`、`sample-040.xlsx` 后，真实 `DocumentIndexWorker` 四项均 `parse_failed`。managed 正式路径无扩展名，而 Worker 未向 `officeparser` 传 `fileType`。
- 审核结果：L07 状态改为 `CHANGES_REQUIRED`；未创建 `review(L07): pass`，未创建 `checkpoint-L07-pass`。
- 最小修复方向：从 `original_name` 提取扩展名传入 Parser，并补充无扩展名 managed 对象的多格式 smoke；修复后只重审 L05–L07 区间。
- 下一步：Luna 创建 `fix(L07-review): ...`，完成复验后重新送审；L08 保持未开始。

## 2026-08-21 · L07 · SOL_REVIEW_PASS

- 审核区间：L05–L07；审核基线：`checkpoint-L04-pass`（`6a9fc7c45cf75f054aef3b860e25d83e90a34e8f`）。
- 初始候选：`486697145855a5a66827f47d84323ff71ed6a2d5`；修复提交：`f110614d96e85095640b2eb8b2414a7a5a0ca92e`。
- 独立验证：44 tests、typecheck、lint、production build、diff check 全部通过；仓库外匿名 PPTX/DOCX/PDF/XLSX 真实 smoke 全部完成解析/索引，`有理数` 与 `函数` 查询均有命中。
- Findings：P0–P3 无；初审发现的无扩展名 managed Parser 类型问题已关闭。
- 审核结果：L07 状态为 `PASS`；将创建 `review(L07): pass` 与 `checkpoint-L07-pass`。
- 下一任务：Luna 可开始 L08；不得跳过 L10 审核闸门。

## 2026-08-21 · L08 · DONE

- 关键改动：新增 schema v6 的普通 AI 设置表，仅持久化 provider/model/endpoint；API Key 由 Main 侧 Electron `safeStorage` 加密后写入应用数据目录的受控密文文件，安全存储不可用时仅保留当前会话，Renderer 只能查询 configured/unconfigured 与存储模式，不能读取 Key。
- Gateway：新增单一 OpenAI-compatible provider，支持连接测试、文本请求、超时、显式取消、401、429、5xx、网络失败和无效响应的稳定错误；日志只记录 requestId/code/status，不记录 Authorization、Key 或上游错误正文。
- IPC/UI：新增 `ai:get-settings`、`ai:update-settings`、`ai:test-connection`、`ai:request-text`、`ai:cancel` 白名单通道与 Preload runtime guards；设置页支持普通设置、Key 替换/删除和连接测试，不接入草稿生成或持久化 AI workflow。
- 修改文件：`src/main/ai/secure-storage.ts`、`src/main/ai/ai-settings-service.ts`、`src/main/ai/ai-gateway.ts`、`src/main/ipc/ai-ipc.ts`、`src/main/db/migrations.ts`、`src/main/index.ts`、`src/shared/ai-contracts.ts`、`src/shared/ipc-contracts.ts`、`src/shared/preload-api.ts`、`src/preload/index.ts`、`src/renderer/settings-panel.tsx`、`src/renderer/App.tsx`、`src/renderer/styles.css`、`tests/ai-gateway.test.ts`、`tests/ai-ipc.test.ts`、`tests/workspace-foundation.test.ts`、本文件与 `STATUS.md`。
- 验证命令与结果：`npm test` ✅（19 files / 51 tests）；`npm run typecheck` ✅；`npm run lint` ✅；`git diff --check` ✅。fake provider 覆盖成功、401、429、503、超时、取消、无 Key、无效 Endpoint；安全存储测试确认 Key 不进入 SQLite 或 IPC 响应。
- 人工/真实环境验证：未接入真实 API Key，未执行付费 API 调用；所有 Gateway 请求均使用本地 fake fetch。未修改 L09 草稿生成、L10 阶段闸门或任何审核状态。
- Git 任务提交：待用户在外部 PowerShell 按路径清单创建 `lean(L08): secure key and ai gateway` 本地提交；本窗口未执行 `git add/commit/tag/push`。
- 安全边界：Renderer 仅通过类型化 Preload 使用 AI IPC；Key 不明文落盘、不进入 workspace.db、日志、错误响应、备份或仓库；AI Gateway 只发送用户明确调用的请求；无 Key 时课程与搜索能力不受影响。
- 已知限制 / Later：当前仅支持一个 OpenAI-compatible provider；未实现 L09 草稿生成、真实付费 smoke、持久化 AI workflow、流式输出和多 provider 管理。
- 下一任务可依赖的接口：`window.teacherWorkbench.ai.getSettings/updateSettings/testConnection/requestText/cancel`、`AiSettingsService`、`AiGateway`、`AI_IPC_CHANNELS`；L10 仍需等待独立审核流程，不由本次自动改为 PASS。

## 2026-08-21 · L09 · DONE

- 关键改动：新增 `DraftService` 与 `draft:generate` 白名单 IPC；老师可勾选明确的 managed file，或为单个选中文件提交明确文本片段。Main 侧验证 file ID 仍为活动托管文件，只读取/发送选中的上下文，并按字符上限截断、按 token 上限传给 L08 Gateway。
- 三类草稿：讲义、例题、作业是三个独立操作，使用版本化 prompt；每次 Gateway 完整返回后立即写入普通 `notes`，保存 `file_id + position + charsSent`、provider、model、prompt version、预算和输入字符数。
- 可编辑与安全：notes schema v7 增加 `note_kind`、`ai_metadata_json`；新增普通 note 更新 IPC/UI，生成结果可直接编辑保存。生成只插入新 note，不覆盖 managed 原资料；失败/取消/空响应不写 note，重试沿用同一流程，已有 note 保留。
- 修改文件：`src/shared/draft-contracts.ts`、`src/shared/core-contracts.ts`、`src/shared/ipc-contracts.ts`、`src/shared/preload-api.ts`、`src/main/db/migrations.ts`、`src/main/data/core-data-service.ts`、`src/main/search/search-service.ts`、`src/main/draft/draft-service.ts`、`src/main/ipc/draft-ipc.ts`、`src/main/ipc/core-ipc.ts`、`src/main/index.ts`、`src/preload/index.ts`、`src/renderer/draft-panel.tsx`、`src/renderer/App.tsx`、`src/renderer/styles.css`、`tests/draft-service.test.ts`、`tests/draft-ipc.test.ts`、`tests/workspace-foundation.test.ts`、本文件与 `STATUS.md`。
- 验证命令与结果：`npm test` ✅（21 files / 57 tests）；`npm run typecheck` ✅；`npm run lint` ✅；`git diff --check` ✅。测试覆盖文件上下文与片段上下文、未选资料不发送、字符截断、token 预算校验、来源位置元数据、生成失败/空响应重试、已有 note 保留、note 编辑保存、原托管文件不变和 IPC 路径字段拒绝。
- 人工/真实环境验证：未接入真实 API Key 或付费 API；仍使用 L08 fake provider/测试 doubles。未开始 L10，不修改任何审核状态或通过标签。
- Git 任务提交：待用户在外部 PowerShell 按路径清单创建 `lean(L09): context and draft generation` 本地提交；本窗口未执行 `git add/commit/tag/push`。
- 已知限制 / Later：上下文去重、相关度排序、content_hash manifest、流式输出、持久化 AI workflow 和搜索页跨页面拖拽选取不在 L09 Lean 范围；当前提供素材列表勾选与明确片段输入。
- 下一任务可依赖的接口：`window.teacherWorkbench.drafts.generate`、`DraftService`、`DRAFT_IPC_CHANNELS`、notes 的 `noteKind/aiMetadata`；L10 仍由独立阶段闸门处理。

## 2026-08-21 · L10 · DONE

- 关键改动：新增 `tests/phase3-acceptance.test.ts`，用本地 fake provider 串起选择 managed 资料、独立生成讲义/例题/作业、通过 note IPC 人工修改保存的完整 happy path；补齐未选择资料不发送、字符/token 上限、未选上下文隔离、网络失败/空响应/取消后已有 note 保留与重试、原 managed 文件不覆盖，以及 Key 不进入日志、数据库、IPC 返回/错误和 workspace 备份目录的阶段证据。
- 修改文件：`tests/phase3-acceptance.test.ts`、`docs/phase3-acceptance.md`、`implementation-tasks/STATUS.md`、`implementation-tasks/SOL_REVIEW_STATUS.md`、本文件。
- 验证命令与结果：`npm test`（22 files / 61 tests）、`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 均通过；阶段验收文档已形成。
- 人工/真实环境验证：未接入真实 API Key 或付费 provider；使用隔离临时 workspace、脱敏文本和 fake fetch，未触碰真实教学资料。验收测试调用现有 SQLite backup API 生成临时备份并扫描 `workspace/backups`，完整 backup/restore 留给 L11。
- 审核区间与交接：L08–L10；审核基线为 `checkpoint-L07-pass`。`SOL_REVIEW_STATUS.md` 已设为 `AWAITING_REVIEW`；当前窗口不执行 Git 写操作，候选 SHA 与 `review(L10): request Sol review` 元数据提交由外部 PowerShell 命令完成；Luna 未写 `PASS`，未创建 `checkpoint-L10-pass`。
- 已知限制 / Later：真实 provider smoke、持久化 AI workflow、流式输出、精确续跑、content hash manifest 和跨页面拖拽选取不在 L10 Lean 验收范围。

## 2026-08-21 · L10 · REVIEW_HANDOFF

- 审核区间：L08–L10；审核基线：`checkpoint-L07-pass`。
- L10 候选提交：`341212802ab9916da92e7a3b1b40b0b1aa130207`（`lean(L10): AI lesson-prep phase gate`）；送审提交：`851119f0ad84a422bd0e33b257cefe32fe30ec50`（`review(L10): request Sol review`）。
- 验证：22 files / 61 tests、typecheck、lint、production build、diff check 全部通过。
- 使用 fake provider 验证选资料、三类草稿、人工修改保存、失败重试、Key 隔离和原资料保护。
- 状态：L10 `AWAITING_REVIEW`；未写 `PASS`，未创建 `checkpoint-L10-pass`。

## 2026-08-21 · L10 · SOL_REVIEW_PASS

- 审核区间：L08–L10；审核基线：`checkpoint-L07-pass`。
- 候选提交：`341212802ab9916da92e7a3b1b40b0b1aa130207`；送审元数据提交：`851119f0ad84a422bd0e33b257cefe32fe30ec50`；交接修正：`79cfdfac5d2f091b0e1f709dbcb06d7473c9c554`。
- 独立审核报告：`docs/reviews/L10-sol-review.md`。
- 结论：无 P0–P3 阻塞 finding；Key 隔离、明确选材、字符/token 上限、三类草稿、人工修改保存、失败重试、原资料保护和白名单 IPC 均通过复核。
- 验证：`npm test`（22 files / 61 tests）、`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 全部通过。
- 审核状态：L10 `PASS`；待在审核提交上创建 `checkpoint-L10-pass`，之后才可开始 L11。

## 2026-08-21 · L11 · DONE

- 关键改动：新增 Main 侧外部编辑器确认、`WorkspaceActivityGate` 与 `BackupRestoreService`。确认后备份期间暂停新业务写入、文件刷新和顺序索引任务，等待已有刷新完成；`workspace.db` 使用 SQLite backup API，复制登记的 managed 对象并生成版本化 `backup_manifest.json`，包含 workspaceId、schemaVersion、文件数量、总大小及每个 fileId/originalName/相对路径/大小/mtime/mode。
- 原子性与排除：备份和恢复均先写 staging；备份完成数据库完整性、身份、managed 元数据和文件大小校验后原子发布，并清理 `workspace.db` 的 `-wal`/`-shm`/`-journal` 派生侧文件；恢复完成数据库打开、integrity/schema/身份、路径和限制校验并重建 `search.db` 后才发布。备份包不包含 `search.db`、cache、日志、API Key、safeStorage 密文、外部原始资料、依赖、构建产物或临时文件。
- 恢复边界：只接受当前工作区之外的新空目录；在迁移前后均校验 manifest 与 workspace.db 的身份、schema、文件数量、originalName、大小和路径，拒绝版本/格式错误、路径穿越、无效 fileId、文件数量/总大小超限、文件缺失/大小不一致、workspace.db 无法打开或 schema/身份不一致。失败清理 staging，不修改原工作区，不留下正式半成品；暂停窗口产生的刷新和索引触发会在恢复后补入队列。
- IPC/UI：新增 `backup:create`、`backup:restore` 白名单通道、外部编辑器确认与 Settings 页按钮；确认取消、额外路径字段和备份失败均有自动化覆盖；恢复完成后提示重新配置 Key。
- 修改文件：`src/main/backup/backup-service.ts`、`src/main/workspace/activity-gate.ts`、`src/main/ipc/backup-ipc.ts`、`src/main/index.ts`、`src/main/parser/document-parser.ts`、五类 IPC 注册、`src/shared/ipc-contracts.ts`、`src/shared/preload-api.ts`、`src/preload/index.ts`、`src/renderer/settings-panel.tsx`、`tests/backup-restore.test.ts`、`tests/backup-ipc.test.ts`、`docs/l11-backup-restore.md`、本文件与 `STATUS.md`。
- 验证命令与结果：`npm test` ✅（24 files / 70 tests）、`npm run typecheck` ✅、`npm run lint` ✅、`git diff --check` ✅。专项测试覆盖备份→新目录恢复往返、课程/学生/课次/managed 文件/note 一致、备份失败原工作区不变、排除项、路径穿越、非空目标、文件数量/总大小限制、暂停闸门、外部编辑器确认、manifest/数据库元数据一致性、恢复后搜索索引重建和失败不发布半成品。
- 取舍 / Later：不实现增量、云端、加密、并发变化重试、复杂孤儿修复或恶意压缩包防护矩阵；备份采用目录格式，设置页选择父目录后发布固定 `teacher-workbench-backup` 子目录。
- Git：当前只准备 L11 相关源码、测试、文档和状态文件；不修改 L10 PASS，不创建 `checkpoint-L12-pass`，不 push、不添加远程。

## 2026-08-21 · L12 · DONE

- 交付选择：采用最简单可复现的 unpacked Windows portable 目录，不引入安装器或卸载器；`package:portable` 使用 electron-builder `dir` target，输出目录为 `release-l12/win-unpacked`，最终可执行文件为 `教师工作台.exe`。
- 交付配置：`package.json`/`package-lock.json` 增加 electron-builder、固定本地 Electron distribution、asar 与 production files 白名单；`release-l12/` 加入 `.gitignore`，不提交 out/release、运行数据库、日志或临时资料。
- Windows 证据：在当前 Windows build 26200 上从最终目录启动成功；空隔离 app-data 首次启动创建 `TeacherWorkspace`、`workspace.db` 与 `search.db`，UI 显示 schema v7；正常退出后再次打开并恢复同一工作区。便携目录无卸载器，工作区位于包外。
- 四条 smoke：`tests/phase1-acceptance.test.ts`、`tests/phase2-acceptance.test.ts`、`tests/phase3-acceptance.test.ts`、`tests/backup-restore.test.ts` 合计 4 files / 13 tests 通过，分别覆盖资料管理打开、搜索、fake-provider 三类草稿编辑保存、备份到新目录恢复并重建搜索索引。
- 安全审计：Renderer 仅使用类型化 Preload API；`contextIsolation`、`nodeIntegration`、`sandbox` 分别保持 `true`、`false`、`true`；production 依赖含 better-sqlite3 native resource 与 officeparser；最终包未发现 API Key、真实教学资料、数据库、search.db、cache、备份、密文或日志；未使用 `--no-sandbox`，未启动开发服务器。
- 命令结果：`npm test`（24 files / 70 tests）、`npm run typecheck`、`npm run lint`、`npm run build`、`npm run package:portable`、`git diff --check` 全部通过。完整记录见 `docs/v1-acceptance.md`。
- 已知限制 / Later：无签名 portable 目录、安装器/卸载器、自动更新、真实 provider、OCR、实时 watcher、向量搜索、流式 AI、持久化 workflow、增量/云端/加密备份和大规模压力矩阵仍留在 Later。
- Git：先创建 `lean(L12): windows final gate` 候选提交；随后按协议写入候选 SHA、把 L12 设为 `AWAITING_REVIEW` 并创建 `review(L12): request Sol review`；不写 PASS、不创建 `checkpoint-L12-pass`、不 push。

## 2026-08-21 · L12 · REVIEW_HANDOFF

- 审核区间：L11–L12；审核基线：`checkpoint-L10-pass`。
- L12 候选提交 SHA：`1f09eb556cfb4242b61980b7ed2709976d454421`（`lean(L12): windows final gate`）。
- 送审证据：`docs/v1-acceptance.md`；unpacked Windows portable 目录、首次启动/工作区创建/正常退出/再次打开、四条 smoke、Renderer 边界和包内容审计均有记录。
- 门禁结果：`npm test`（24 files / 70 tests）、`npm run typecheck`、`npm run lint`、`npm run build`、`npm run package:portable`、`git diff --check` 全部通过；四条专项 smoke 合计 4 files / 13 tests 通过。
- 审核状态：`SOL_REVIEW_STATUS.md` 的 L12 已设为 `AWAITING_REVIEW`；Luna 不写 `PASS`，不创建 `checkpoint-L12-pass`。
- 下一步：创建 `review(L12): request Sol review` 元数据提交后停止，等待独立 Sol 复审。

## 2026-08-21 · L12 · SOL_REVIEW_PASS

- 审核区间：L11–L12；审核基线：`checkpoint-L10-pass`。
- 候选提交：`1f09eb556cfb4242b61980b7ed2709976d454421`；送审提交：`075694f49dac787129bc0696cd454a91388b1940`。
- 独立审核报告：`docs/reviews/L12-sol-review.md`。
- 结论：无 P0–P3 阻塞 finding；portable Windows 交付、首次启动/工作区创建/退出/重开、资料管理、搜索、fake-provider 备课、备份恢复、Renderer 安全边界与包内容审计均通过。
- 验证：`npm test`（24 files / 70 tests）、`npm run typecheck`、`npm run lint`、`npm run build`、`npm run package:portable`、`git diff --check` 全部通过。
- 审核状态：L12 `PASS`；待在审核提交上创建 `checkpoint-L12-pass`。Lean V1 总验收完成。

## 2026-08-22 · V1.1 · PLAN_CONFIRMED

- 基线：Lean V1 已完成并固定在 `checkpoint-L12-pass`；L01–L12 保持 `DONE`，V1.1 不回改历史里程碑。
- 产品方向：文字规格优先于三张参考图；外部资料采用一个只读 root 的 lazy 资料树，从课次直接进入备课，加入的外部/素材均复制为本课 managed 独立副本。
- AI 取舍：草稿必须绑定 lesson、不再强制 student；Skill 只是可复用 Prompt；本次要求可空；继续使用讲义/例题/作业三个固定动作和现有 Gateway/ContextBuilder。
- 草稿规则：生成成功自动保存为 `draft`；全局备课入口提供草稿箱；重新生成创建新草稿并保留旧稿；同一内容区切换 Preview/Editor；“保存到当前课次”把同一正文改为 `saved`，不复制双份内容。
- 实施链：新增 `v1.1-tasks/V11-01`–`V11-05` 五个轻量里程碑。V11-01–V11-04 只做相关测试、typecheck、lint；V11-05 做完整回归、build、portable packaging 和代表性 Windows smoke。
- 明确 Later：多 root、外部目录扫描/监听/全文索引、Office/PDF 高保真预览、草稿版本树、审批审计、Workflow/Agent 和企业级验证矩阵。
- Git：方案作为独立本地 `plan(V1.1)` 提交保存；后续使用 `v1.1(V11-XX)` 里程碑提交，最终通过标签为 `checkpoint-V1.1-pass`；不自动 push。

## 2026-08-22 · V11-01 · DONE

- 关键改动：新增一个外部资料 root 的 SQLite 持久化、设置/更换入口和 Main 侧只读目录服务；Renderer 只接收 root 摘要、root ID 与相对路径，绝对路径不进入 Preload 响应。
- 浏览交互：新增“外部资料”导航，提供“全局导航｜可折叠资料树｜内容区”；目录逐层 lazy 读取，支持手动刷新、中文多层目录、文件信息、系统应用打开和资源管理器定位，折叠资料树后内容区自动扩展。
- 安全边界：每次访问都重新解析真实路径并确认仍位于登记 root 内；拒绝绝对路径、`..` 穿越、过期 root ID、未登记路径和根外链接/目录联接；不写入、删除、移动或重命名外部原文件。
- 取舍：V11-01 不加入 watcher、递归扫描、搜索、多 root、Office/PDF 高保真预览，也不提前实现 V11-02 的“用于本次备课”。
- 验证：相关测试 5 files / 18 tests 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 通过。开发 Electron 窗口确认 V1.1 导航、schema v8、外部资料空状态和目录选择入口；检测到用户正在使用前台窗口后停止自动操作，其余展开/刷新/越界行为由自动测试覆盖。
- Git：准备创建本地 `v1.1(V11-01): external library browsing` 里程碑提交；不 push、不添加远程、不创建 V1.1 最终通过标签。

## 2026-08-22 · V11-02 · DONE

- 课次入口：从“我的课程”选择课次后直接进入备课，自动带入课程与课次；一对一可带关联学生，班课没有学生也能备课和保存 AI 草稿。schema v9 将 note 的 student 关系改为可空并保留旧记录。
- 本次资料：备课左栏只显示当前课次持久化关联的 managed 独立副本；支持从外部资料和素材库直接添加，新加入资料默认勾选，重新进入课次后仍能读取。外部资料在无课次上下文时继续显示“复制到素材库”。
- 复制与安全：两条加入路径都先复制到 managed 临时文件，经正式登记与原子重命名后关联课次，并触发顺序索引；失败清理临时对象和数据库记录。课次副本不修改外部原文件或素材库原件。
- 验证：相关测试 12 files / 49 tests 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 通过。隔离 Electron UI 使用用户提供目录中的两份只读样本完成“开始备课 → 外部资料加入 → 素材库加入”，最终 2 份资料均持久化并默认勾选；临时工作区已删除，真实资料未修改、未进入仓库。
- 范围：未提前实现 V11-03 的 Skill/本次要求，未改造 V11-04 的草稿箱与同区预览编辑，也未引入工作流、会话状态机或企业级验收矩阵。
- Git：准备创建本地 `v1.1(V11-02): lesson prep materials` 里程碑提交；不 push、不添加远程、不创建 V1.1 最终通过标签。

## 2026-08-22 · V11-03 · DONE

- Skill：schema v10 新增名称、Prompt、时间戳和软删除；设置页提供简单新建、编辑、删除。迁移预置 `AMC8 一对一常规备课` 与 `初中数学常规备课` 两套普通模板，均可继续修改或删除，不引入节点、参数或 Workflow。
- 备课输入：当前课次可选一个 Skill、可选填写本次要求；讲义、例题、作业仍是三个固定动作，字符/token 上限继续使用受控默认值，不在普通页面暴露。
- Prompt 与快照：Main 在付费请求前校验课次和 Skill，按固定任务、课次信息、教师 Skill、本次要求、明确选择资料、输出约束分区组合；资料正文不能覆盖指令。草稿元数据保存课次、Skill 名称与 Prompt 快照、本次要求、来源、provider/model、prompt version 和预算，之后修改或删除 Skill 不改变历史草稿。
- 安全与范围：只有勾选资料进入 ContextBuilder；班课无学生仍可生成；Key 不进入 Skill 数据、IPC 返回或错误日志。未实现工作流、节点、分支、Agent、复杂 Skill 参数，也未提前实现 V11-04 草稿箱和预览编辑状态。
- 验证：相关测试 `10 files / 38 tests` 通过，覆盖 Skill CRUD/软删除、严格 IPC、四种可选输入组合、历史快照、未选资料隔离、预算、无学生课次、删除后阻断 Gateway 与日志脱敏；`npm run typecheck`、`npm run lint`、`git diff --check` 通过。隔离 Electron 界面确认两套模板、设置页编辑入口、可选输入、固定三动作、无学生必选项、无技术预算和无工作流编辑器；临时工作区已删除。
- Git：准备创建本地 `v1.1(V11-03): skill prompt composition` 里程碑提交；不 push、不添加远程、不创建 V1.1 最终通过标签。

## 2026-08-22 · V11-04 · DONE

- 生命周期：schema v11 在原 `notes` 记录上增加 `draft/saved` 状态；历史普通记录保持不变，历史 AI 结果无损迁移为草稿。生成成功写入 `draft`，“保存到当前课次”只更新同一行状态，可同时原子保存编辑正文，不复制第二份内容。
- 草稿箱与课次结果：全局“备课”入口只列未保存草稿的课程、课次、类型和修改时间；进入草稿后，左侧只列当前课次的 draft/saved 结果，已保存成果可从课次重新打开，保存后自动从全局草稿箱消失。
- 同区预览编辑：右侧唯一内容容器在安全文本预览和单个 textarea 间原地切换；保存修改回到最新预览，取消编辑丢弃 UI 改动。保存成果仍可继续编辑，不跳页、不在底部生成第二个正文副本。
- 重新生成与删除：重新生成从历史元数据复用课次、明确来源、Skill 快照、本次要求和预算，创建新草稿并保留旧草稿与已保存成果；即使 Skill 后续修改或删除也使用历史快照。未保存编辑会先做简单确认；只允许软删除 `draft`，不允许从草稿箱删除 `saved`。
- 安全与范围：新增 4 个严格白名单 Draft IPC 动作，拒绝额外路径字段和无效正文；Renderer 仍不接触 SQLite、Node、文件系统或 Key。重新生成只读取历史明确来源且仍受原字符/token 预算控制，原 managed 文件保持不变；未加入版本树、恢复 UI、审批、审计或复杂状态机。
- 验证：相关测试 `11 files / 41 tests`、`npm run typecheck`、`npm run lint`、`git diff --check` 通过，覆盖无损迁移、退出重开、同行保存、草稿箱过滤、课次范围、同一结果 ID、重新生成保留旧稿/已保存成果、Skill 历史快照、软删除边界、严格 IPC、原资料保护和 Renderer 边界。
- 隔离 Electron UI：确认 schema v11、2 份草稿进入全局草稿箱而已保存成果不进入；当前课次显示 3 份结果；Preview/Editor 始终只有 1 个正文区域；保存修改恢复最新预览；保存到课次后状态变为“已保存”且草稿箱数量从 2 降为 1。临时数据仅含脱敏假内容；因本轮工具权限配额无法自动清理 `%LOCALAPPDATA%\\Temp\\teacher-workbench-v11-04-ui-appdata`，不在仓库或正式工作区内。
- Git：准备创建本地 `v1.1(V11-04): draft inbox and inline editing` 里程碑提交；不 push、不添加远程、不创建 V1.1 最终通过标签。

## 2026-08-22 · V11-04 滚动布局修复 · DONE

- 修复：窗口根节点固定为单屏，最左侧全局导航保持满高且不再跟随页面内容滚动；右侧内容区改为独立纵向滚动，小窗口下导航仅在自身确实溢出时内部滚动。
- 验证：`tests/renderer-boundary.test.ts` 2 项测试、`npm run typecheck`、`npm run lint` 和 `git diff --check` 通过；在用户当前 Electron 开发窗口中向下滚动右侧长资料树，右侧内容正常移动，品牌、全部导航项和底部版本号位置保持不变，随后恢复到顶部。
- Git：准备创建本地 `fix(V11-04): keep sidebar fixed while scrolling` 修复提交；不 push。

## 2026-08-22 · V11-05 · DONE

- 自动主流程：新增 `tests/v1.1-acceptance.test.ts`，以 schema v11、班课无学生、最小有效 DOCX/PPTX/PDF、素材库 Markdown 和 fake provider 串起外部/素材选材、解析索引、Skill、本次要求、讲义生成/编辑/同行保存、保留旧稿的重新生成、例题/作业保存、退出重开与草稿/成果持久化；外部原件和素材原件保持不变。
- V1 回归与质量门：`npm test`（31 files / 96 tests）、`npm run typecheck`、`npm run lint`、`npm run build`、`npm run package:portable` 和 `git diff --check` 全部通过；课程/学生/课次、managed 文件、素材复制、搜索、Parser、AI Gateway、备份恢复和 portable 均纳入代表性证据。
- Windows packaged smoke：最终 `release-l12/win-unpacked/教师工作台.exe` 在隔离 app-data 与 `user-data-dir` 启动成功；UI 显示 schema v11、假课程/课次/素材与两套预置 Skill；localhost fake AI 连接成功（31 ms）；固定全局导航在长内容滚动后仍存在。未使用真实 Key、真实资料、正式工作区或付费 provider。
- 安全审计：`app.asar` 共 996 个文件，未发现 `.env`、运行数据库/索引、日志、证书、Key、秘密、备份或工作区数据；隔离 fake Key 明文在工作区、portable 和 build 中零命中；Renderer/Preload/Main 边界及 Electron sandbox 配置未退化。
- 验收记录：完整结果与产品负责人最终操作清单见 `docs/v1.1-acceptance.md`。Windows 前台其他全屏应用会持续最小化验收窗口，因此没有用桌面自动化重复整条已由端到端测试覆盖的点击链；临时假资料、临时工作区、隔离用户数据和 fake server 已删除且不可恢复，未删除任何用户资料。
- 当前状态：V11-05 实现与交付验证已完成，准备创建独立里程碑提交。产品负责人正在对候选包做体验测试；最终 `checkpoint-V1.1-pass` 仍须等待体验确认，V11-05 之后发现的小问题不回填到本任务中。

## 2026-08-23 · V1.1 测试后小修复 · DONE

- 范围：单独收集产品负责人在 V11-05 候选包体验中发现的小问题，不再归入已经完成的 V11-05；全部收齐后统一运行必要回归并创建独立修复提交。个人开发测试阶段不重复打包，直接使用开发版验证；只有产品负责人明确准备正式版本时才重新构建 portable。
- Bug 1：Windows 窗口出现英文 `File / Edit / View / Window` Electron 默认菜单，普通老师不需要且容易困惑。已在 Main 中移除默认应用菜单，并为主窗口启用菜单栏自动隐藏。
- Bug 2：主内容之前被 `960px/1120px` 最大宽度限制并居中，最大化窗口后两侧留下大面积空白，形成固定分辨率 UI。已让标题和课程、搜索、设置、备课、草稿、外部资料等主要工作区占满导航右侧剩余空间；外部资料保持固定合理树宽，右侧内容自适应填充，长资料树和内容区各自可滚动；小窗口断点继续生效。
- Bug 3：整体比例与参考图相比过于松散。已把全局导航从 248px 收窄为 156px，缩小页面边距、标题、卡片内边距和资料区间距；普通界面不再展示 `教师工作台 V1.1`、`Electron 0.1.0` 和 `schema v11` 等技术信息，只有工作区异常时显示紧凑错误提示。布局与交互参考示意图，功能名称和信息层级继续以文字规格为准。
- Bug 4：内容区的“外部资料”等页面大标题与左侧当前导航重复，且文本导航与参考图的桌面工具结构不一致。已移除全局重复页面标题，把导航进一步收窄为 104px 白色栏，并为课程、搜索、外部资料、素材、学生、备课、设置提供统一线性小图标；保留本项目自己的栏目名称，选中项使用浅蓝底和蓝色图标文字。
- Bug 5：原“移除”是可恢复的软删除，工作台管理的副本和记录仍保留。已在“已移除资料”中增加“彻底删除”，仅允许删除已经移除的资料，并要求二次确认；确认后删除 managed 副本、数据库记录、课次/学生关联及派生搜索索引，外部原文件始终不受影响。已有 AI 草稿正文继续保留，但无法再从已彻底删除的来源重新生成。
- 开发启动：首版中文文件名 BAT 仍可能启动后不显示 Electron 窗口，已改为 ASCII 文件名 `start-dev.bat`，并将主窗口由等待 Renderer 完成改为创建后立即显示。实测启动日志到达 `app ready → IPC ready → main window visible`；脚本退出时保留诊断信息，不进行 portable 打包。
- 重启说明：Renderer 可以热更新，但 Electron Main/Preload 新增能力必须完整重启开发进程。产品负责人遇到的 `permanentlyDeleteFile is not a function` 是旧 Preload 与新 Renderer 混用，调用在 IPC 发出前失败，没有删除资料。使用新按钮前需关闭旧窗口和开发终端，再运行 `start-dev.bat`。
- 文档：修复内容、彻底删除边界、开发版重启步骤和验证范围汇总于 `docs/v1.1-post-test-fixes.md`。
- 验证：相关测试 `4 files / 18 tests`、`npm run typecheck`、`npm run lint` 与 `git diff --check` 通过；按个人开发阶段约定不运行 production build 或 portable packaging。

## 2026-08-23 · V1.1 最终门禁重验 · AWAITING_PRODUCT_CONFIRMATION

- 候选基线：重验前代码 HEAD 为 `16aff174298b49a14acfd60d3954931bd9019b53`（`fix(V1.1): repair local dev startup`）；V11-01–V11-05、测试后小修复和开发启动修复均已提交。冻结的 V1.2 方案仍是未跟踪文件，本轮未把它纳入提交，也未进入 V12-01。
- 自动质量门：`npm test` ✅（32 files / 101 tests）；`npm run typecheck` ✅；`npm run lint` ✅；`npm run build` ✅；`npm run package:portable` ✅；`git diff --check` ✅。
- 当前 package：重新生成修复后的 `release-l12/win-unpacked/教师工作台.exe`；exe `235,534,336` bytes，`resources/app.asar` `107,328,552` bytes。asar 共 996 个文件，文件名审计未发现 `.env`、数据库/索引、日志、证书、Key、备份或工作区数据。
- Windows packaged smoke：使用仓库 `tmp/` 下被忽略的隔离 app-data 与 `user-data-dir` 启动当前候选；唯一窗口标题正确，默认菜单隐藏，主工作区自适应撑满，内容滚动后 104px 全局导航仍固定；随后正常关闭，目标窗口数归零。隔离 SQLite 为 schema v11，`integrity_check=ok`。
- 安全边界：未读取正式工作区、真实教学资料或真实 API Key；`out/`、`release-l12/` 与 `tmp/` 均继续被 `.gitignore` 排除。
- 当前门禁：自动质量门、当前 package 和代表性 Windows 启动体验证据已齐全；根据 V1.1 产品规格与版本控制协议，仍须产品负责人明确确认一次真实但不敏感的完整备课体验后，才创建 `checkpoint-V1.1-pass` 并开始 V1.2。

## 2026-08-23 · V1.1 最终体验确认 · PASS

- 产品负责人明确回复“V1.1 最终体验通过”。
- 自动质量门、当前 package、代表性 Windows packaged smoke、安全审计和最终人工体验现已全部齐全。
- 本确认与验收状态写入最终 V1.1 审计提交；`checkpoint-V1.1-pass` 创建在该提交上，不 push、不移动既有标签。
- V1.1 在此冻结。下一步按冻结方案建立 V1.2 decisions、V12-01–V12-05、状态记录与活动索引，然后从 V12-01 顺序实施。

## 2026-08-23 · V1.2 · PLAN_FROZEN

- 基线：`checkpoint-V1.1-pass` 已创建；Lean V1 与 V1.1 全部历史里程碑保持 `DONE` 并冻结。
- 产品真相：纳入根目录冻结的 `教师工作台_V1_2_课程与学生信息架构重构_产品与实施方案.md`；课程树表达计划，点名和 taught confirmation 表达事实，Current Lesson 只给默认下一步。
- 实施链：建立 `v1.2-tasks/V12-01`–`V12-05`，严格顺序执行且同一时刻最多一个 `IN_PROGRESS`。
- 复用与 Later：复用 Node/Core/ManagedFile/Draft/LessonPrep/Search/Parser/AI/Backup，不重做 V1.1 备课内核；日历、提醒、成绩分析、学生文件 UI、复杂 enrollment、多 session、共享和新 AI 工作流继续 Later。
- 验收：V12-01–V12-04 各跑相关测试、typecheck、lint并按风险补 smoke/build；V12-05 跑全量测试、typecheck、lint、build、diff check 和代表性本地 Windows 流程。V1.2 不运行 portable/installer packaging。
- Git：方案与活动链使用独立 `plan(V1.2)` 本地提交；里程碑使用 `v1.2(V12-XX)`；最终体验确认前不创建 `checkpoint-V1.2-pass`，不 push。

## 2026-08-23 · V12-01 · IN_PROGRESS

- 基线：`checkpoint-V1.1-pass` 与 `plan(V1.2)` 提交已就绪；工作区无未解释改动。
- 当前唯一实现范围：schema v12、CoreOverview、课程进度/学生关系/点名 Service 与严格白名单 IPC；不提前实现 V12-02 Renderer 重构。
- 验收计划：专项测试覆盖迁移、跨课程/过期状态、幂等确认、点名快照、学生退出/重加和原子性；随后运行 typecheck、lint，并按数据层风险补 production build。

## 2026-08-23 · V12-01 · DONE

- 数据与迁移：schema 升至 v12；旧 `course_students` 无损增加 `ended_at`，新增 `course_progress`、`lesson_sessions`、`lesson_attendance` 和索引。`CoreOverview` 批量返回进度与 session 摘要。
- 课程与学生：新增独立学生、课程与可选学生事务创建、退出/重新加入和一对一在读限制；结束/重开只修改 `ended_at` 并保留有效指针，节点移动或软删除会清理失效指针。
- 进度与点名：复用 Node/Core 并新增薄 CourseProgressService、AttendanceService；`keep/clear/set` 与 taught confirmation 同事务，expected pointer 防过期覆盖，重复确认幂等；点名首次重查当前名单、历史严格使用快照，保存不推进 Current Lesson。
- IPC 与隔离：Core/Preload 增量使用严格 contract；考勤只注册 `attendance:update-schedule`、`attendance:get-lesson`、`attendance:save-lesson` 三个通道，Renderer 仍不接触 SQLite/Node/文件系统/秘密。
- 验收：V12 专项 11 项通过；`npm test` 34 files / 112 tests ✅；`npm run typecheck` ✅；`npm run lint` ✅；`npm run build` ✅（Main/Preload/Renderer）；`git diff --check` ✅。按 V1.2 冻结规则未运行 portable/installer packaging。
- 范围：未实现任何 V12-02 Renderer；日历、提醒、分析、复杂 enrollment、多 session、文件共享和新 AI 工作流均未扩展。

## 2026-08-23 · V12-02 · IN_PROGRESS

- 前置：V12-01 已 `DONE`，全量自动门与风险 build 通过，本地里程碑提交为 `5ec6c89`。
- 当前唯一实现范围：我的课程三栏架构、活动/已结束筛选、Current Lesson 与 Viewed Lesson 分离、课程/阶段/课次最小创建、软推进确认、课次时间与点名 Modal。
- 复用：继续使用 CoreOverview、LessonPrepContext、V1.1 草稿入口与 V12-01 CourseProgressService/AttendanceService；不新增日历、提醒、分析、多 session 或新备课内核。

## 2026-08-23 · V12-02 · DONE

- 信息架构：我的课程重构为全局导航、课程列表、课程详情三栏；顶部仅保留全部课程/待处理草稿入口，增加搜索、活动/已结束筛选和本地今日待点名。课程详情只保留课次、学生、资料三个分区。
- 课程与课次：课程、阶段、课次使用局部 Modal；阶段内按 sort_order/ID 稳定显示第 N 课。新课程第一课显式初始化 Current Lesson，后续创建和点击只改变 Viewed Lesson，不自动推进。
- 软推进：确认 Modal 展示并提交明确 keep/clear/set；非 Current 课次默认保持，Current 课次只建议同阶段靠后的未确认课次，阶段边界不跨阶段。调整到其他阶段显式调用 startPeriod；结束/撤销收在低频菜单，重开保留有效指针。
- 排课与点名：datetime-local 按 Windows 本地时间输入并转 UTC ISO；今日区域按本地日界派生。点名 Modal 提供完整名单、全部到课和三态保存；保存/修改点名不改变 Current Lesson。
- V1.1 复用：课程卡继续/开始备课和 Viewed Lesson 开始备课均复用 LessonPrepContext、草稿入口和现有 DraftPanel；没有改写 DraftService、AI、Parser、Search、外部资料或素材库核心。
- 自动验收：25 项 V12-02 相关测试通过；`npm test` 36 files / 119 tests ✅；`npm run typecheck` ✅；`npm run lint` ✅；`npm run build` ✅；`git diff --check` ✅。未运行 portable/installer packaging。
- Windows smoke：当前 production build 使用 Windows 临时目录中的隔离 schema v12 工作区启动；验证 1264px 窗口中课程列表 320px/详情 804px、课程/阶段/三课创建、第一课初始化、Viewed/Current 分离、关联隔离学生、今日 18:30 排课、1/1 点名、非 Current 保持、Current 推进到同阶段第 3 课、结束筛选与重开恢复。数据库 `integrity_check=ok`、foreign_key_check 0；隔离目录随后已删除。
- 范围：资料分区只保留 Viewed Lesson 边界提示，实际课次资料留给 V12-04；学生全局页留给 V12-03。未扩展日历、提醒、统计分析、学生文件 UI、复杂 enrollment、多 session 或新 AI 工作流。

## 2026-08-23 · V12-03 · IN_PROGRESS

- 前置：V12-02 已 `DONE`，自动门、production build 与隔离 Electron smoke 通过，本地里程碑提交为 `9ff4be7`。
- 当前唯一实现范围：学生列表/搜索/新建、学生详情的在读/历史课程、manual 学习记录和可选关联课次、课程与学生详情之间的 ID 导航目标。
- 安全与 Later：Main/Service 验证人工记录关联课次和学生课程关系；前端不显示 student_files、附件、成绩、画像、文件统计，也不提前实现 V12-04 课次资料。

## 2026-08-23 · V12-03 · DONE

- 学生信息架构：全局“学生”替换旧学生文件面板，采用学生列表/学生详情；支持姓名搜索和独立新建。列表只显示姓名、在读课程、最近一条 manual 记录。
- 学生详情：纵向展示在读课程、已退出/课程已结束的历史关系和最近 manual 学习记录；明确过滤 lecture/example/homework，不显示文件、附件、成绩、画像或统计。
- 学习记录：新增记录只填写正文和可选课次；Renderer 只列当前或历史关联课程中的有效课次，CoreDataService/Main 再次验证学生与课次所属课程存在关系，无关课次返回 CORE_DATA_ERROR 且不写入。
- 双向导航：App 仅提升 selectedCourseId/selectedStudentId；课程学生姓名进入唯一 StudentsPage 详情，学生课程行返回唯一 CourseDashboard 详情，没有复制页面或数据。
- 自动验收：22 项 V12-03 相关测试通过；`npm test` 38 files / 127 tests ✅；`npm run typecheck` ✅；`npm run lint` ✅；`npm run build` ✅（Main/Preload/Renderer）；`git diff --check` ✅。未运行 portable/installer packaging。
- Windows smoke：当前 production build 使用新的 Windows 临时隔离工作区启动；验证学生页新建/搜索、课程创建时事务关联、课程→学生与学生→课程跳转、关联课次 manual 记录、退出后归入历史且仍可为历史课次补录。隔离库 schema v12、`integrity_check=ok`、foreign_key_check 0，1 位学生/1 条 ended 关系/2 条 manual 记录；目录随后已删除。
- 范围：保留既有 student_files/copyToStudent 数据与后端兼容能力，但 V1.2 UI 不暴露入口；未实现学生文件、成绩、画像、附件、复杂 enrollment 或 V12-04 资料视图。
