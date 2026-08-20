# L08 · 安全模型设置与单一 AI Gateway

**前置：** L07 Sol `PASS`。
**结果：** 老师可以安全配置一个实际使用的模型入口并完成文本请求。

## 最小范围

- 普通 provider/model/endpoint 设置可持久化；API Key 使用 Electron `safeStorage`，不可用时允许仅本次会话使用或拒绝保存。
- Renderer 可提交新 Key，但保存后只能查询“已配置/未配置”，不能取回明文或密文。
- 用原生 `fetch` 或轻量 Adapter 支持一个 OpenAI-compatible provider；实现连接测试、超时、取消和常见错误。
- 日志、错误、数据库和备份不得包含 Key；无 Key 时资料和搜索照常可用。
- 测试使用本地 fake provider；真实付费调用仅在用户明确同意时做一次可选 smoke。

## 验证

- 成功、401、429/5xx、超时和取消的代表性测试；Key 替换/删除与日志脱敏测试。
- 运行相关测试、typecheck、lint。
