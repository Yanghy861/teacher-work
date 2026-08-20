# T34 · 统一 AI Gateway 与模型调用

**前置：** T33。  
**目标：** 建立一个轻量、可测试的文字模型边界，先支持 V1 实际使用的 provider，不引入 Agent 框架。

## 实现范围

- 定义自有 AI Gateway/Provider Adapter：模型、messages/input、超时、取消、结构化 usage/错误；
- 至少实现一个用户实际使用的生产 provider（可采用 OpenAI-compatible 作为首个边界），其他 provider 只在明确需要时逐个 Adapter；
- Main 内部从 SecureSettings 取 Key，任何请求/响应日志都不得记录 Authorization 或完整教学正文；
- 实现连接测试、超时、限流、认证失败、网络失败和响应解析；错误对用户可理解；
- 默认不对可能已经计费的生成请求做盲目自动重试；返回“结果可能已计费但未收到”的可解释状态；
- 使用本地 fake provider 完成确定性测试；真实 API 只做手动、可选、最小冒烟验证；
- Provider SDK/HTTP 依赖记录许可证、维护状态和打包结果。

## 不做

LangChain、通用 Agent、工具调用框架、多步骤备课、流式 token 断点恢复。

## 验收

- fake provider 覆盖成功、取消、超时、401、429、5xx、畸形响应；
- 设置页连接测试可用且 Key 不经过 Renderer；
- 日志/错误脱敏测试通过；
- 没有 Key 时仅 AI 功能禁用，资料管理和搜索完全可用。

