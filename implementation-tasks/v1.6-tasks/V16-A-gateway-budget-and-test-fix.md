# V16-A · 网关预算修复与测试连接判定修正

**状态：** `TODO`

## 范围

- `testConnection` 成功判据改为"HTTP 200 且合法 chat.completion 结构（choices 数组存在）"，不再要求 content 非空；`requestText` 正文非空校验保持不变；
- `AiGateway` 默认超时 15s → 120s，提取为 `DEFAULT_AI_TIMEOUT_MS` 常量（`timeoutMs` 注入点不变）；
- `DRAFT_DEFAULT_MAX_CHARS` 12,000 → 30,000、`DRAFT_DEFAULT_MAX_TOKENS` 2,000 → 16,000（`DRAFT_MAX_CHARS = 100_000`、`DRAFT_MAX_TOKENS = 32_000` 合同上限不变）；
- 请求体不发送 `thinking`/`reasoning_effort`（保持后端默认）；
- 同步更新受影响测试（判据、超时常量、默认预算引用）。

## 不做

- 不实现流式（V16-C）、不改 IPC 通道与合同结构；
- 不做 thinking 开关或 reasoning_effort 分档；
- 不改 `parseChatResponse` 对业务请求的空正文报错语义。

## 验收

- 相关测试、typecheck、lint，按风险补充 production build；
- fake provider 覆盖：content 为空但结构合法的 testConnection 通过、业务空正文仍报 `AI_INVALID_RESPONSE`；
- 完成后更新 STATUS/GOAL_PROGRESS 并创建 `v1.6(V16-A): <摘要>` 本地提交。
