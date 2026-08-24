# 教师工作台 V1.3 · 实施入口

Lean V1、V1.1、V1.2 已分别在 `checkpoint-L12-pass`、`checkpoint-V1.1-pass`、`checkpoint-V1.2-pass` 冻结。当前活动版本为 V1.3，只执行 `v1.3-tasks/V13-01`–`V13-05`；历史任务只保留追溯，不得重新执行。

## 活动资料

- 产品主规格：[`../教师工作台_V1_3_快速建课_产品与实施方案.md`](../教师工作台_V1_3_快速建课_产品与实施方案.md)
- 实施决策：[`V1_3_DECISIONS.md`](V1_3_DECISIONS.md)
- 界面与交互图集：[`../docs/v1.3-fast-course-design/README.md`](../docs/v1.3-fast-course-design/README.md)
- 唯一任务索引：[`TASK_INDEX.md`](TASK_INDEX.md)
- 唯一状态表：[`STATUS.md`](STATUS.md)
- Goal 进度证据：[`GOAL_PROGRESS.md`](GOAL_PROGRESS.md)
- Git 与标签协议：[`VERSION_CONTROL.md`](VERSION_CONTROL.md)

## V1.3 轻量实施链

```text
checkpoint-V1.2-pass
→ V13-01 数据契约与原子编排服务
→ V13-02 向导领域模型与排课预览
→ V13-03 课程 / 学生与阶段 / 课次 UI
→ V13-04 排课 / 确认 / 课程页完整接入
→ V13-05 全量回归与版本验收
→ checkpoint-V1.3-pass（需最终产品体验确认）
```

V13-01–V13-04 分别运行相关测试、typecheck、lint，并按风险补 build 或本地 smoke。V13-05 运行全量测试、typecheck、lint、build、`git diff --check` 和代表性本地 Windows 流程。V1.3 不运行 `package:portable`，不生成 portable、installer 或对外交付包。

## 保持冻结的能力

V1.1 的外部资料、素材、Skill、ContextBuilder、AI Gateway、DraftService、同区预览编辑、Parser、Search 与 Backup/Restore，以及 V1.2 的课程、学生、点名和进度模型原样复用。除向导内多选日期器外，V1.3 不扩展独立日历、提醒、成绩分析、学生文件 UI、复杂 enrollment 历史、多 session、文件共享或 Workflow/Agent。
