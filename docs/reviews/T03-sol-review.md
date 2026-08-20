# T03 Sol 独立审核报告

- 审核时间：2026-08-20 14:53 +08:00
- 审核区间：T01–T03
- 基线：`checkpoint-T00`（`3c518b247d47ddd613632e6a3ae60a464b288292`）
- 候选提交：`e360204499552029f86be0afbcd1096c7fa38b9d`
- 送审提交：`1f104f95c7927359bd2cc9276e9db314630a2be4`
- 结论：`CHANGES_REQUIRED`

## 范围与可复现性

- 候选提交存在，且 `checkpoint-T00` 是候选提交祖先；候选提交是当前送审提交的祖先。
- 送审提交只修改 `implementation-tasks/GOAL_PROGRESS.md` 与 `implementation-tasks/SOL_REVIEW_STATUS.md`，未混入产品实现。
- 审核开始时位于 `main`，工作区干净；未发现数据库、日志、秘密、构建产物或真实教学资料进入候选提交。

## 独立验证结果

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm test`：通过，7 个测试文件、16 项测试。
- `npm run build`：通过，Main、Preload、Renderer 均生成产物。
- `npm ls --depth=0`：通过，顶层依赖可解析。
- `npm audit --json --registry=https://registry.npmjs.org`：0 个已知漏洞。
- Electron 43.4.1 Node runtime：可加载 `better-sqlite3`，内存查询返回 1，ABI 可用。
- Windows 真实运行：未使用 `--no-sandbox`/`--disable-gpu-sandbox`；窗口正常显示 `Electron 0.1.0` 与“工作区已连接 · schema v1”，证明 Renderer → Preload → Main → SQLite 链路贯通；Alt+F4 后开发命令退出码 0。
- 验收产生的空 `C:\Users\why\AppData\Roaming\TeacherWorkspace` 与隔离临时目录已在核对创建时间和内容范围后删除，未保留教学资料或测试运行库。

## 必须修复的问题

### P1 · 显式工作区路径可以落入应用安装目录

`WorkspacePaths.fromRoot()` 只检查非空和绝对路径，`initializeWorkspace()` 对字符串路径直接使用该入口；安装目录隔离只在 `fromDefaultLocation()` 中调用 `assertPathOutside()`。因此未来“用户选择工作区”若选择安装目录本身或其子目录会被接受，升级或卸载时存在用户数据随程序目录被移除的风险，违反“程序安装目录与用户工作区彻底分离”的全局硬规则。

修复要求：让所有用户可选/默认工作区入口都必须携带并校验应用安装路径；安装目录本身及任意子目录均返回稳定、可理解的 `WORKSPACE_PATH_INSIDE_APP`。补充测试，至少覆盖显式选择 `<install>` 和 `<install>\workspace` 均被拒绝，并让“替换构建目录后数据仍存在”测试使用真正位于构建目录之外的工作区。

相关位置：`src/main/workspace/workspace-paths.ts:63`、`src/main/workspace/workspace-paths.ts:67`、`src/main/workspace/workspace-paths.ts:90`、`src/main/workspace/workspace-service.ts:32`、`tests/workspace-foundation.test.ts:84`。

### P1 · 日志脱敏仍会泄露凭据和文件正文

当前正文键规则未覆盖规格中会出现的 `body_md`；字符串脱敏只识别敏感词后紧跟 `:`/`=` 的形式。独立探针得到：

```text
redactLogValue({ body_md: "SOL_AUDIT_BODY" })
=> {"body_md":"SOL_AUDIT_BODY"}

redactSensitiveText("authorization Bearer SOL_AUDIT_SECRET")
=> authorization Bearer SOL_AUDIT_SECRET
```

错误对象的 message 与 stack 都走同一字符串规则，所以常见 Authorization/Bearer 文本或 JSON 化 header 也可能进入日志。这不满足“API Key 不得写日志”和“不记录文件正文”的硬规则。

修复要求：正文键至少覆盖 `body_md` 及项目契约中实际使用的正文别名；敏感文本需覆盖 header/JSON/空白分隔等常见表示，同时避免只靠单一正则的窄样例。增加 `StructuredLogger`、`serializeError` 和嵌套对象测试，断言所有模拟秘密与正文标记在最终序列化日志中均不存在。

相关位置：`src/main/logging/structured-logger.ts:6`、`src/main/logging/structured-logger.ts:38`、`src/main/logging/structured-logger.ts:81`、`src/main/logging/structured-logger.ts:89`、`tests/logging-redaction.test.ts:9`。

### P2 · Renderer 架构边界守卫可以被常见导入形式绕过

当前测试依赖源码正则，只覆盖 `from "node:..."` 等少数形式；动态导入 `import("node:fs")`、副作用导入 `import "node:fs"`、其他 require/别名形式和 Node 全局变量未被可靠禁止。同时 ESLint 对所有 TypeScript 文件统一启用了 `globals.node`，Renderer 使用 `process`、`Buffer` 等也不会触发 lint。

修复要求：为 `src/renderer/**` 配置独立的 ESLint/架构规则（或 AST/依赖图测试），禁止 Electron、Node 内置模块、数据库驱动、Main 路径及 Node 全局变量；测试应覆盖静态、动态、副作用导入和 require 形式。不得通过关闭 build 错误或放宽 Renderer 安全配置解决。

相关位置：`tests/renderer-boundary.test.ts:8`、`eslint.config.mjs:12`。

## 复审条件

Luna 只能修复 T01–T03 审核区间内的上述问题，不得进入 T04。修复后需：

1. 增加能复现上述缺口的测试并完成最小实现；
2. 重新运行 typecheck、lint、全部测试、production build，以及保留 Electron/SQLite ABI 验证；
3. 创建 `fix(T03-review): <摘要>` 本地提交；
4. 用新的候选 SHA 把 T03 改回 `AWAITING_REVIEW`，创建新的 `review(T03): request Sol review` 送审提交后停止。

本次不得创建 `checkpoint-T03-pass` 标签。

## 2026-08-20 15:16 · 第一次复审

- 新候选提交：`a3ea75af88e06b14af20a4a643c68db7d9cf83dc`
- 新送审提交：`40cf891ec26c5be580a7046b0d52a16bb5e3d235`
- 结论：`CHANGES_REQUIRED`

### 已确认修复

- 显式工作区入口现在强制携带应用安装目录；安装目录本身及其子目录均被拒绝，测试中的工作区与替换构建目录也已分离。
- `body_md`、嵌套正文、Authorization/Bearer、JSON/header 与空白分隔凭据均有实现和回归测试；独立探针确认 `SOL_AUDIT_BODY` 与 `SOL_AUDIT_SECRET` 不再出现在输出中。
- `npm run typecheck`、`npm run lint`、`npm test`（7 files / 17 tests）、`npm run build`、Electron 43.4.1 + `better-sqlite3` ABI 内存查询均通过。

### 仍需修复 · P2 Renderer 裸 Node 内置模块仍可绕过

Renderer ESLint/AST 守卫只枚举了 `fs`、`path`、`os`、`crypto`、`child_process` 等少数裸模块名；虽然 `node:*` 全部被禁止，但 Node 同时支持不带 `node:` 的内置模块名。独立 ESLint API 探针结果：

```text
import http from 'http'
=> 只有 @typescript-eslint/no-unused-vars，未触发 no-restricted-imports

import { Worker } from 'worker_threads'
=> 只有 @typescript-eslint/no-unused-vars，未触发 no-restricted-imports

import http from 'node:http'
=> 正确触发 no-restricted-imports
```

这仍未满足上一轮“禁止 Node 内置模块”的复审条件。修复时应从 Node 的 `builtinModules`（或等价完整清单）统一生成带/不带 `node:` 的禁用集合，并在 ESLint 规则与 TypeScript AST 守卫中使用同一完整来源；测试至少加入裸 `http`、`worker_threads` 和一个其他未曾手写枚举的内置模块。不得继续逐个补少数名称，也不得放宽 Renderer 构建或安全配置。

相关位置：`eslint.config.mjs:20`、`tests/renderer-boundary.test.ts:25`。

Luna 仍不得进入 T04。完成此单项最小修复后，重新运行 typecheck、lint、全部测试和 production build，创建新的 `fix(T03-review): <摘要>` 提交，更新候选 SHA 并再次标记 `AWAITING_REVIEW` 后停止。本次仍不得创建 `checkpoint-T03-pass` 标签。
