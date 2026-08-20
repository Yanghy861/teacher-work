# Luna Max 单个 Lean 里程碑提示词

把 `LXX` 与文件名替换为当前活动里程碑：

```text
请实现教师工作台 Lean V1 的 LXX：implementation-tasks/lean-tasks/LXX-name.md。

先完整阅读 AGENTS.md、implementation-tasks/LEAN_V1_DECISIONS.md、GLOBAL_CONSTRAINTS.md、VERSION_CONTROL.md、STATUS.md、SOL_REVIEW_STATUS.md、当前任务及其前置产物。前一审核点不是 PASS 时停止。

只完成当前 LXX。采用能完成核心流程的最简单可靠实现；文档列为 Later 的实时 watcher、external roots、持久化队列、精确续传、Worker 池、复杂状态机和极端矩阵不得重新加入，也不得因此标记阻塞。数据损坏、路径越界、Renderer/Main/Key 边界和 AI 不覆盖原资料仍须严格验证。

普通里程碑运行相关测试、typecheck、lint；L04/L07/L10/L12 额外运行全量测试和 production build。验收完成后更新 STATUS.md 与 GOAL_PROGRESS.md，按 VERSION_CONTROL.md 创建 `lean(LXX): <名称>` 本地提交；审核点再完成 AWAITING_REVIEW 交接并停止。禁止执行旧 T09–T42，禁止自动 push。

现在直接执行，不要只给计划。
```
