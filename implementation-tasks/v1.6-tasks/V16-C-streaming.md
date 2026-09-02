# V16-C · 流式生成 IPC 与渲染

**状态：** `DONE`（2026-09-02；门禁与产物见下）

## 范围

- 合同：`AiTextRequest` 可选键 `stream?: true`；新增 `AiStreamEvent`（`kind: 'reasoning' | 'text' | 'done' | 'error'` 及守卫）；新增推送通道 `ai:stream-event` 进 `AI_IPC_CHANNELS` 白名单；
- Main：`requestStreamText`（`stream: true` + `Accept: text/event-stream`，SSE 逐行解析，`delta.reasoning_content` → reasoning 事件（仅计数不转发原文）、`delta.content` → text 事件、`[DONE]` → done）；静默超时 30s（`AI_STREAM_IDLE_TIMEOUT_MS`，任何 chunk 重置计时，总时长无上限）；`cancel` 复用同一 AbortController；
- IPC：`requestText` 载荷含 `stream: true` 时走流式，chunk 经 `event.sender.send('ai:stream-event', …)` 推送（发送前 `isAiStreamEvent` 校验）；invoke 最终响应仍返回完整 `{text, model}`；
- Preload：`ai.onStreamEvent(callback): () => void` 订阅/退订；白名单注册新通道；`ipc-security` 测试覆盖面同步；
- Renderer：生成、方案生成、确认生成的"生成中"面板：思考阶段"AI 思考中…（已思考 N 字）"进度，正文逐字上屏只读预览，完成后进入既有编辑/对比流程；取消按钮复用 `ai.cancel`；
- 测试：fake 流式 fetch（分块 ReadableStream）覆盖 chunk 序列、reasoning 计数、done 组装、取消、静默超时、坏行跳过；既有非流式测试不动。

## 不做

- 不做 `reasoning_content` 原文展示、SSE 中断续传、网络层重试；
- 不改非流式 `requestText` 路径与测试连接；
- 不做状态推送通道（mineru 状态为 V16-D 拉取式）。

## 验收

- 相关测试、typecheck、lint、production build；
- 中继式 fake 流式 provider 一轮（chunk 序列 → 渲染计数 → done → note 组装），留痕；
- 完成后更新 STATUS/GOAL_PROGRESS 并创建 `v1.6(V16-C): <摘要>` 本地提交。

## 完成记录（2026-09-02）

- 合同：`ai-contracts.ts` 新增 `AI_STREAM_EVENT_KINDS`/`AiStreamEvent` 与守卫 `isAiStreamEvent`；`AiTextRequest` 增可选键 `stream?: true`（守卫只接受缺省或 `true`）；`ipc-contracts.ts` 新增推送通道常量 `AI_IPC_EVENTS.streamEvent = 'ai:stream-event'`（Main→Renderer 单向，不进 invoke 白名单，载荷双向守卫）。
- Main：`ai-gateway.ts` 新增 `requestStreamText(requestId, prompt, maxTokens, onEvent)`——请求体加 `stream: true`、`Accept: text/event-stream`；SSE 逐行解析（跨 chunk 缓冲、`data: [DONE]` 终止、空行/心跳/坏 JSON 行跳过）；`delta.reasoning_content` 归 reasoning 事件只推进度计数、不转发原文（D21/D22）；`delta.content` 逐块转发并组装全文；流末正文为空仍报 `AI_INVALID_RESPONSE`；静默超时 `AI_STREAM_IDLE_TIMEOUT_MS = 30_000`（任何 chunk 到达即重置，总时长无上限，`idleTimeoutMs` 注入点供测试）；`cancel` 复用同一 AbortController；流中断连 `AI_TIMEOUT`/`AI_CANCELLED` 区分；非流式 `requestText` 与测试连接路径零变化。
- IPC：`ai-ipc.ts` `dispatchAiIpc` 增可选 `sender`（`registerAiIpc` 经 `extractIpcSender` 从 event 提取）；`requestText` 载荷含 `stream: true` 时走流式，chunk 经 `pushAiStreamEvent` 校验 `isAiStreamEvent` 后发送（reasoning 为 Main 累计字符数），完成后推送 `done` 事件（含 model 与 chars）；最终 invoke 响应仍返回完整 `{text, model}`。`app-ipc.ts` 新增 `IpcEventSender` 端口与 `extractIpcSender`（unknown event 安全收窄）。
- Draft 接线：`draft-service.ts` `generate/regenerate` 增可选 `AiGatewayStreamSink`，有 sink 时改用 `requestStreamText`；`draft-ipc.ts` 同样接 sender，generate/regenerate 生成过程推送流事件并在完成时推送 done（chars = 正文长度），无 sender 时保持非流式（历史测试零影响）。
- Preload：`ai.onStreamEvent(callback)` 订阅（载荷经 `isAiStreamEvent` 校验）返回退订函数；`TeacherWorkbenchApi` 同步签名。
- Renderer（draft-panel）：新增 `streamState`（reasoning 计数/正文预览/requestId）与按 requestId 过滤的订阅；生成、方案生成、确认生成与重新生成四条流均进入"生成中"面板——"AI 思考中…（已思考 N 字）"进度 + 首个 text 起正文只读逐字上屏 + 取消按钮（复用 `ai.cancel`）；完成后进入既有编辑/对比流程，发布与版本语义零变化。
- 测试：新增 `tests/ai-gateway-stream.test.ts`（6：SSE chunk 序列与 reasoning 计数、单/跨 chunk 事件切分、空正文报错、取消、静默超时、心跳重置计时）与 `tests/ai-stream-ipc.test.ts`（5：合同守卫、流式推送与完整结果、非流式零推送、draft 通道流事件、中继式验收——SSE→推送→渲染状态机回放→done 组装与 invoke 最终结果一致性）。既有非流式测试全部不动、全部通过。
- 门禁：全量 66 files / 289 passed / 1 skipped（V16-B 基线 278 + 11）、typecheck 0 错误、lint 通过、production build 通过、`git diff --check` 干净。
