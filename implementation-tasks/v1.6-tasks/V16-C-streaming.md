# V16-C · 流式生成 IPC 与渲染

**状态：** `TODO`

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
