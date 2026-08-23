# 教师工作台 V1.2 · 实施入口

Lean V1 已在 `checkpoint-L12-pass` 冻结，V1.1 已在 `checkpoint-V1.1-pass` 冻结。当前活动版本为 V1.2，只执行 `v1.2-tasks/V12-01`–`V12-05`；旧 T09–T42 只保留历史，不得继续执行。

## 活动资料

- 产品主规格：[`../教师工作台_V1_2_课程与学生信息架构重构_产品与实施方案.md`](../教师工作台_V1_2_课程与学生信息架构重构_产品与实施方案.md)
- 实施决策：[`V1_2_DECISIONS.md`](V1_2_DECISIONS.md)
- 唯一任务索引：[`TASK_INDEX.md`](TASK_INDEX.md)
- 唯一状态表：[`STATUS.md`](STATUS.md)
- Goal 进度证据：[`GOAL_PROGRESS.md`](GOAL_PROGRESS.md)
- Git 与标签协议：[`VERSION_CONTROL.md`](VERSION_CONTROL.md)

## V1.2 轻量实施链

```text
checkpoint-V1.1-pass
→ V12-01 Core 与持久化
→ V12-02 课程页与点名交互
→ V12-03 学生页
→ V12-04 V1.1 备课与资料接入
→ V12-05 全量回归与版本验收
→ checkpoint-V1.2-pass（需最终产品体验确认）
```

V12-01–V12-04 分别运行相关测试、typecheck、lint，并按风险补 build 或本地 smoke。V12-05 运行全量测试、typecheck、lint、build、`git diff --check` 和代表性本地 Windows 流程。V1.2 不运行 `package:portable`，不生成 portable、installer 或对外交付包。

## 保持冻结的能力

V1.1 的外部资料、素材、Skill、ContextBuilder、AI Gateway、DraftService、同区预览编辑、Parser、Search 与 Backup/Restore 原样复用。V1.2 不扩展日历、提醒、成绩分析、学生文件 UI、复杂 enrollment 历史、多 session、文件共享或 Workflow/Agent。
