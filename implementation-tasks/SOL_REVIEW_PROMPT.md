# Sol Max 独立审核提示词

> 历史说明：V1 的 T08、L04、L07、L10、L12 均已 PASS。本提示词只用于历史复现；V1.1 不建立多阶段 Sol 审核链。

当 `SOL_REVIEW_STATUS.md` 有 `AWAITING_REVIEW` 时，在同一个 `D:\teacher_work` checkout 使用 Sol Max 执行：

```text
完整阅读 D:\teacher_work\implementation-tasks\SOL_REVIEW_PROMPT.md，并审核 SOL_REVIEW_STATUS.md 中当前唯一的 AWAITING_REVIEW 审核点。只审查和记录，不直接修改产品实现，不进入下一里程碑，不自动 push。
```

## 审核协议

1. 阅读 `AGENTS.md`、`LEAN_V1_DECISIONS.md`、`GLOBAL_CONSTRAINTS.md`、`VERSION_CONTROL.md`、`STATUS.md`、`GOAL_PROGRESS.md`、`SOL_REVIEW_STATUS.md`，以及当前审核区间的活动任务/Spike/ADR/验收证据。
2. 验证 `main`、候选 SHA 与审核基线：T08=`checkpoint-T03-pass`，L04=`checkpoint-T08-pass`，L07=`checkpoint-L04-pass`，L10=`checkpoint-L07-pass`，L12=`checkpoint-L10-pass`。
3. 审核 `<基线>..<候选 SHA>`，并查看候选之后的送审元数据提交。默认不修改产品代码；可以运行只读检查、测试、typecheck、lint 和 build。
4. 以当前 Lean 决策和 Lxx 验收为准。旧 T09–T42 已退役；不得因缺少 external roots、实时 watcher、持久化队列、精确续传、Worker 池、AI 状态机、在线并发备份或极端操作矩阵而拒绝通过。
5. 按适用风险重点检查：资料是否可能损坏/串数据、路径是否逃逸、Renderer/Main 边界、搜索是否可删除重建、Key 是否泄漏、AI 是否覆盖原资料、备份是否包含 Key。只要求与当前阶段相称的代表性证据。
6. Findings 按 P0–P3 给出文件/行号或复现证据、影响和最小修复建议。没有阻塞 finding 且活动验收满足时应 PASS，不能因为 Later 增强未实现而给 CHANGES_REQUIRED。
7. 报告写入 `docs/reviews/<审核点>-sol-review.md`。通过则更新为 `PASS`，创建 `review(<审核点>): pass` 本地提交并创建对应 `checkpoint-*-pass` 标签；不通过则更新为 `CHANGES_REQUIRED` 并创建 `review(<审核点>): changes required`，不得创建通过标签。
8. 只暂存审核报告和审核元数据；不得自动 push、添加远程、提交秘密或真实教学资料。
