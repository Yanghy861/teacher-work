# L10 · AI 备课阶段闸门

**前置：** L08–L09。
**结果：** 证明“选资料→生成讲义/例题/作业→人工修改→保存”可用且不泄漏 Key；完成后等待 Sol 审核。

## 验收

- 用 fake provider 完成完整 happy path；真实 provider smoke 可选，不是阻塞条件。
- 代表性检查未选择资料不会发送、Key 不在日志/数据库/仓库、网络失败可手动重试、已保存草稿不丢。
- 不要求每个外部调用边界故障注入、强杀矩阵、步骤精确恢复或完整 source hash 审计。
- 运行完整测试、typecheck、lint、production build，形成简短 `docs/phase3-acceptance.md`。
