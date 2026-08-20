# 教师工作台 V1 · Luna Max 实施任务包

这是从 `../教师工作台_V1_R3_产品与技术实施规格.md` 拆出的逐项实施包。原文中的产品要求被当作规格内容；本任务包才是为了后续实现而整理的执行入口。用户已经指定后续使用 **Luna Max**，因此原规格第 27 节关于 Sol 档位的建议不适用。

## 怎么使用

如果希望 Luna Max 自动推进，使用 [`LUNA_MAX_GOAL.md`](LUNA_MAX_GOAL.md) 中的分段长期 Goal；它会逐项读取状态、实现、验证，并在每个 Sol 审核点或真正外部阻塞处停止。审核通过后再次提交同一 Goal 继续。

本项目强制使用本地 Git 版本控制。Luna 与 Sol 开始前都必须阅读 [`VERSION_CONTROL.md`](VERSION_CONTROL.md)：每个任务验收后产生一个本地任务提交，每个 Sol PASS 产生审核提交和 `checkpoint-TXX-pass` 标签；代理不得自动 push。

建议严格按编号执行，一次只交给 Luna Max 一个任务：

```text
请使用 Luna Max 实现 implementation-tasks/tasks/T01-project-scaffold.md。
先读 AGENTS.md、implementation-tasks/GLOBAL_CONSTRAINTS.md 和本任务文件；
只完成本任务，通过全部验收后更新 implementation-tasks/STATUS.md，不要提前做下一项。
```

后续只替换任务文件名。每次新任务开始前，保留上一任务的代码和测试结果，不要要求模型“继续完善整个项目”。

## 开始前需要准备

- `T04`：准备 30～100 份脱敏后的真实 PPTX、DOCX、文本 PDF、扫描 PDF、XLSX 等样本；
- `T05`：准备由真实教学资料产生的搜索语料，并能扩充到至少 10,000 个 chunk；
- `T06`：Windows 机器上需有至少一种实际支持的 Office/WPS 应用，用代表性 DOCX/PPTX/XLSX 完成普通保存与打开未改验证；刷新核对与漏报恢复由自动化探针完成，不要求穷举自动恢复或保存中退出；
- `T34`：若做真实 API 冒烟测试，需临时提供可用 Key，但 Key 只能进入安全存储，不能写入仓库；
- `T42`：需要在 Windows 真机上做安装、升级、卸载与工作区保留测试。

没有这些条件时，可以先完成测试工具和操作说明，但对应 Spike/闸门不能标记为通过。

## 阶段与闸门

| 阶段 | 任务 | 结果 |
|---|---|---|
| 基础与风险验证 | T01–T08 | 可运行骨架 + 四项真实 Spike + 决策冻结 |
| Phase 1 管资料 | T09–T20 | 树、课程、学生、素材、managed/external 文件可用 |
| Phase 2 找资料 | T21–T32 | 可恢复、部分可用的中文/数学混合全文搜索 |
| Phase 3 AI 备课 | T33–T38 | 选资料 → 讲义 → 例题 → 作业的可恢复闭环 |
| Phase 4 安全交付 | T39–T42 | 一致性备份恢复、启动检查、Windows 正式验收 |

闸门任务为 `T08`、`T20`、`T32`、`T38`、`T42`。闸门任务以审计、补缺和形成证据为主，不扩展产品范围。

## 文件说明

- `GLOBAL_CONSTRAINTS.md`：所有任务都必须遵守的边界；
- `VERSION_CONTROL.md`：逐任务提交、审核范围、通过标签、恢复与秘密边界；
- `LUNA_MAX_GOAL.md`：可直接提交给 Luna Max 的长期 `/goal`；
- `GOAL_PROGRESS.md`：长期 Goal 的逐任务证据日志；
- `SOL_REVIEW_STATUS.md`：Luna 与 Sol 之间的强制审核闸门；
- `SOL_REVIEW_PROMPT.md`：审核点可直接交给 Sol Max 的提示词；
- `TASK_INDEX.md`：42 项任务、前置依赖和核心产物总览；
- `STATUS.md`：唯一任务状态表；
- `TRACEABILITY.md`：规格、自动测试与任务的对应关系；
- `RUN_PROMPT.md`：可直接复制给 Luna Max 的提示词；
- `tasks/`：42 个独立任务文件。
