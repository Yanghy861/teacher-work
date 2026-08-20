# Luna Max · Lean V1 长期实施 Goal

## 产品负责人已确认的方向

T01–T08 的有效成果保留。旧 T09–T42 已退役，后续只执行 L01–L12。Lean V1 的原则不是降低数据安全，而是删除不影响三条核心流程的工程冗余：能用刷新解决就不强求实时监听，能整项重试就不做精确续传，能用一个顺序 Worker 就不做并发调度，能用代表性验证就不做第三方软件极端时序矩阵。

## Luna 必须执行的长期目标

在同一个本地 checkout `D:\teacher_work` 的 `main` 分支，保留现有成果，严格按 `STATUS.md` 从最小未完成的 Lxx 开始，依次完成 L01–L12。每次运行持续推进到下一个 Sol 审核点、真实阻塞或项目完成；到审核点必须送审并停止。禁止执行已退役的 T09–T42，禁止自动 push。

开始前完整阅读：

1. `AGENTS.md`
2. `implementation-tasks/LEAN_V1_DECISIONS.md`
3. `implementation-tasks/GLOBAL_CONSTRAINTS.md`
4. `implementation-tasks/TASK_INDEX.md`
5. `implementation-tasks/STATUS.md`
6. `implementation-tasks/SOL_REVIEW_STATUS.md`
7. `implementation-tasks/VERSION_CONTROL.md`
8. 当前 Lxx 任务文件及其中明确列出的前置产物

主规格只用于核对产品意图；若旧详细章节与 `LEAN_V1_DECISIONS.md` 或 Lxx 任务冲突，以 Lean 文件为准。

## 持续执行循环

1. 检查 `git status --short --branch` 和最近提交。必须位于 `D:\teacher_work` 的 `main`；保留被中断的已有成果，绝不 reset/clean/覆盖。存在无法解释且无法安全分离的改动时记录后停止。
2. 检查 `SOL_REVIEW_STATUS.md`。若当前最近审核点为 `AWAITING_REVIEW`，不修改代码并停止；若为 `CHANGES_REQUIRED`，只修复该审核区间、重验、创建 fix 提交并重新送审；只有前一审核点为 `PASS` 才进入下一段。Luna 不得写 `PASS` 或创建通过标签。
3. T08 未 `PASS` 时不得开始 L01。T08 `PASS` 后，只从 `STATUS.md` 选择编号最小、状态非 `DONE`、前置已满足的 Lxx；同一时刻最多一个 `IN_PROGRESS`。
4. 开始 Lxx 前完整阅读对应 `lean-tasks/Lxx-*.md`、相关代码和测试。只实现当前里程碑，不执行旧 T09–T42，不提前实现后续能力。
5. 采用满足核心流程和硬安全边界的最简单实现。实时 watcher、external roots、持久化索引队列、精确进度/续传、Worker 池、复杂 AI 状态机、在线并发备份、拖拽和大规模矩阵均不是 V1 要求。若遇到高成本非核心设计，改用 `LEAN_V1_DECISIONS.md` 允许的简单替代或记录到 Later，然后继续；不得仅因“不够自动”“验证不够极端”而阻塞。
6. 不可削弱的边界包括：Renderer/Main/秘密隔离、路径防逃逸、managed 正式文件临时写入加原子重命名、长任务不阻塞 Main、API Key 不明文落盘/进日志/进备份、AI 只保存草稿且不覆盖原资料。涉及这些边界时必须写回归测试。
7. 普通里程碑运行相关测试、`npm run typecheck`、`npm run lint`；L04、L07、L10、L12 运行全量测试、typecheck、lint、production build 及任务要求的代表性 Windows smoke。测试失败先在当前范围修复。
8. 验收齐全后把当前 Lxx 标为 `DONE`，在 `GOAL_PROGRESS.md` 记录实现、验证、限制和简单化取舍；按 `VERSION_CONTROL.md` 仅暂存相关文件并创建 `lean(LXX): <名称>` 本地提交。普通里程碑提交后继续下一个。
9. 到 L04、L07、L10、L12：先完成里程碑提交；将该提交 SHA 写入 `SOL_REVIEW_STATUS.md` 并设为 `AWAITING_REVIEW`；在进度日志写审核区间、证据与重点；创建 `review(LXX): request Sol review` 元数据提交；确认工作区无未解释改动后立即停止。
10. 只有以下情况可标 `BLOCKED`：核心 happy path 确实无法实现；继续会导致资料损坏、路径越界或 Key 泄漏；缺少核心流程必需的权限/凭据/工具；需要产品负责人改变方向。记录已完成内容和用户最小解阻动作，可安全提交时创建 `blocked(LXX): <原因>`，然后停止。

## 停止条件

仅在以下情况停止：

- 到达 T08、L04、L07、L10 或 L12 的 `AWAITING_REVIEW` 交接点；
- 出现上面定义的真实阻塞并已留下可恢复记录；
- 发现无法解释的工作区修改，无法安全继续；
- L12 已通过 Sol 审核，三条核心流程、适用安全边界和 `docs/v1-acceptance.md` 均有可复现证据，Lean V1 完成。

不要只重新规划、复述文档或给建议；在审核状态允许时，直接从状态表确定第一个可执行 Lxx 并开始实现和验证。

## 可直接粘贴到 Goal 模式的一句话

```text
完整阅读 D:\teacher_work\implementation-tasks\LUNA_MAX_GOAL.md，并严格执行其中的 Lean V1 长期目标：保留 T01–T08 已有成果，只按活动状态表依次实现、验证和本地提交 L01–L12；到 T08、L04、L07、L10、L12 审核点时完成送审记录后停止；高成本非核心设计按文档采用简单替代或移入 Later，只有文档定义的真实阻塞才标记 BLOCKED 并停止。禁止执行已退役的 T09–T42，禁止自动 push。
```
