# V155-C · 解析超时与窗口导航守卫

**状态：** `TODO`

## 前置

- V155-B 为 `DONE`；
- 设计基准：`docs/v1.5.5-hardening-plan.md` §2.3。

## 范围

- `src/main/parser/document-parser.ts`：构造增加 `parseTimeoutMs?: number`（默认 `120_000`，常量 `DEFAULT_PARSE_TIMEOUT_MS`）；`runWorker` 在 `postMessage` 后启动 `unref` 定时器——触发时核对 `activeRequest.requestId`，先清 `activeRequest`、摘 message/error/exit 监听、置空 `this.worker`，再 `void worker.terminate()`，以 `PARSE_TIMEOUT` 为 `parserErrorCode` reject；正常 message/error 路径 `clearTimeout`。
- 超时沿用既有 `parse_failed` 语义：contentHash 为 null 不写 `files` 行，`rebuildPending()` 重试；不引入新状态机。
- `src/main/window-security.ts`：新增 `WebContentsLike` 接口与 `applyWindowNavigationGuard(webContents, allowedUrls)`——全局拒绝 `window.open`，`will-navigate` 仅放行白名单。
- `src/main/index.ts` `createMainWindow`：dev 用 `ELECTRON_RENDERER_URL`、prod 用 `pathToFileURL` 计算 index.html 地址作为白名单，加载前调用守卫。
- 扩展 `tests/document-parser.test.ts`（哑 worker 注入 + 超时转 `parse_failed` + 后续文件队列恢复）与 `tests/security-baseline.test.ts`（守卫单测：deny 一切 open、拦截非白名单导航、放行白名单）。

## 不做

- 不改解析格式、队列模型与 `rebuildPending` 语义；
- 不放行任何二级窗口或外部导航。

## 验收

- 哑 worker 下超时转 `parse_failed` + `PARSE_TIMEOUT`，`files` 行未写坏，后续文件队列恢复；
- 导航守卫测试、相关测试、typecheck、lint 通过；
- 完成后更新 STATUS/GOAL_PROGRESS 并创建 `v1.5.5(V155-C)` 本地提交。
