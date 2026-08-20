# 教师工作台 Lean V1 · 实施入口

产品负责人于 2026-08-20 将后续实施从旧 42 项方案收缩为 12 个 Lean 里程碑。T01–T08 的应用骨架和风险验证成果继续有效；旧 T09–T42 仅保留历史，不得继续执行。

## 推荐用法

- Luna Max Goal：完整阅读并执行 [`LUNA_MAX_GOAL.md`](LUNA_MAX_GOAL.md)；
- Sol Max 审核：当前审核状态为 `AWAITING_REVIEW` 时执行 [`SOL_REVIEW_PROMPT.md`](SOL_REVIEW_PROMPT.md)；
- 单独执行一个里程碑：使用 [`RUN_PROMPT.md`](RUN_PROMPT.md)；
- 产品取舍与 Later：[`LEAN_V1_DECISIONS.md`](LEAN_V1_DECISIONS.md)；
- 唯一活动任务索引：[`TASK_INDEX.md`](TASK_INDEX.md)；
- 唯一状态表：[`STATUS.md`](STATUS.md)；
- Git 与审核标签：[`VERSION_CONTROL.md`](VERSION_CONTROL.md)。

## 四段实施

| 阶段 | 里程碑 | 审核结果 |
|---|---|---|
| 管资料 | L01–L04 | 课程/学生/课次、managed 文件、素材副本、刷新可用 |
| 找资料 | L05–L07 | 常见教学文档可解析、搜索、打开来源和简单重建 |
| AI 备课 | L08–L10 | 安全 Key、选资料、独立生成并保存三类草稿 |
| 备份交付 | L11–L12 | 空闲态备份恢复与 Windows 可运行交付 |

Sol 审核点只有 T08、L04、L07、L10、L12。普通里程碑只跑相关测试、typecheck、lint；四个 Lean 闸门再跑全量测试和 build。

## 不再需要提前准备的条件

不再要求 external roots、WPS 自动恢复/大文件/保存中退出矩阵、索引精确断点续传、在线并发备份或完整升级矩阵。真实 API 冒烟只有用户愿意临时提供 Key 时才做；没有 Key 可用 fake provider 完成 L10，不阻塞资料管理和搜索。
