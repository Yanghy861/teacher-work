# Sol Max 审核提示词

当 `SOL_REVIEW_STATUS.md` 出现 `AWAITING_REVIEW` 时，切换到 Sol Max，提交下面的提示词。把 `TXX` 与审核区间替换为表格中的当前行。

```text
请使用 Sol Max 对教师工作台审核点 TXX（审核区间 TAA–TXX）进行“只审查、不修改”的独立审核。

先阅读：
- AGENTS.md
- implementation-tasks/GLOBAL_CONSTRAINTS.md
- implementation-tasks/VERSION_CONTROL.md
- implementation-tasks/STATUS.md
- implementation-tasks/GOAL_PROGRESS.md
- implementation-tasks/SOL_REVIEW_STATUS.md
- 本审核区间的任务文件、相关 Spike/ADR、验收报告
- `SOL_REVIEW_STATUS.md` 记录的候选提交，以及从上一个 PASS 标签到该候选提交的 Git diff

要求：
1. 先验证仓库、当前分支、候选 SHA 和审核基线。T03 使用 `checkpoint-T00`；之后使用上一个 `checkpoint-TNN-pass`。候选 SHA 缺失、不可解析或范围不可复现时不得 PASS。
2. 审核 `<上一通过标签>..<候选 SHA>`，并检查候选之后的送审元数据提交。不修改产品代码，不开始下一任务；可以运行只读检查、测试、typecheck、lint 和 build。
3. 核对该区间所有任务的验收条件及全局硬规则，复现关键验证，检查测试是否真的证明行为。
4. 特别检查数据丢失、文件串数据、事务、路径逃逸、Renderer/Main 边界、索引可重建、秘密泄漏和备份一致性等适用风险。
5. Findings 按 P0–P3 排序，每项给出文件/行号或测试证据、影响、根因、最小修复建议和必须新增的回归测试。
6. 把完整报告写入 `docs/reviews/TXX-sol-review.md`。
7. 没有阻塞问题且验收证据充分时，把 TXX 改为 `PASS`，填写报告与通过标签，创建 `review(TXX): pass` 本地提交，并在该提交创建 `checkpoint-TXX-pass` 带说明标签。
8. 否则改为 `CHANGES_REQUIRED`，链接报告并创建 `review(TXX): changes required` 本地提交；不得创建或移动通过标签。不要因为测试未运行或真实环境缺失而给 PASS。
9. 只暂存审核报告和审核状态等审核元数据；禁止自动 push、添加远程、提交秘密或真实教学资料。
```
