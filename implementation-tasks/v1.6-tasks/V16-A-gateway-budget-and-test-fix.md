# V16-A · 网关预算修复与测试连接判定修正

**状态：** `DONE`（2026-09-02；门禁与产物见下）

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

## 完成记录（2026-09-02）

- `src/main/ai/ai-gateway.ts`：默认超时提取为命名常量 `DEFAULT_AI_TIMEOUT_MS = 120_000`（`timeoutMs` 注入点与签名不变，测试继续注入短超时）；`testConnection` 走 `request(..., 'structure')` 结构判定——`parseChatResponse` 新增 `parsing: 'text' | 'structure'` 参数：结构模式只要求响应为对象且 `choices` 为非空数组（content 可为空字符串，思考型后端 `max_tokens: 1` 时正常）；文本模式（业务 `requestText`）对"结构合法但 choices 非数组/为空"从"空响应"改判"无法识别的响应"，正文非空校验语义不变。
- 请求体未新增 `thinking`/`reasoning_effort` 参数（D21：保持后端默认，DeepSeek 默认 enabled）。
- `src/shared/draft-contracts.ts`：`DRAFT_DEFAULT_MAX_CHARS` 12,000 → 30,000、`DRAFT_DEFAULT_MAX_TOKENS` 2,000 → 16,000；合同上限 `DRAFT_MAX_CHARS = 100_000`、`DRAFT_MAX_TOKENS = 32_000` 不变。渲染层 `draft-panel.tsx` 引用常量自动受益，无代码改动。
- 测试：`tests/ai-gateway.test.ts` 新增 3 例（常量合同 120s；结构合法 + content 为空（含 `reasoning_content`）的 testConnection 通过；业务空正文仍 `AI_INVALID_RESPONSE`、连接测试遇非 chat.completion 结构与空 choices 报 `AI_INVALID_RESPONSE`）；`tests/v1.1-acceptance.test.ts` 硬编码预算值 12,000/2,000 → 30,000/16,000（V1.1 历史链语义为"按当时默认预算生成"的验收重跑，引用常量会破坏 2 系人数断言的语义，保持字面值仅随本次默认值更新）。
- 门禁：全量 63 files / 268 passed / 1 skipped（+3）、typecheck 0 错误、lint 通过、production build 通过；`git diff --check` 干净。
