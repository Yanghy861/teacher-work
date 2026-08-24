# 教师工作台 V1.5 · 实施入口

Lean V1、V1.1、V1.2、V1.3、V1.4 已分别在 `checkpoint-L12-pass`、`checkpoint-V1.1-pass`、`checkpoint-V1.2-pass`、`checkpoint-V1.3-pass`、`checkpoint-V1.4-pass` 冻结。当前活动版本为 V1.5，只执行 `v1.5-tasks/V15-01`–`V15-03`；历史任务只保留追溯，不得重新执行。

## 活动资料

- 产品主规格：[`../教师工作台_V1_5_课程课件导航重构_产品与实施方案.md`](../教师工作台_V1_5_课程课件导航重构_产品与实施方案.md)
- 实施决策：[`V1_5_DECISIONS.md`](V1_5_DECISIONS.md)
- 唯一任务索引：[`TASK_INDEX.md`](TASK_INDEX.md)
- 唯一状态表：[`STATUS.md`](STATUS.md)
- Goal 进度证据：[`GOAL_PROGRESS.md`](GOAL_PROGRESS.md)
- Git 与标签协议：[`VERSION_CONTROL.md`](VERSION_CONTROL.md)

## V1.5 轻量实施链

```text
checkpoint-V1.4-pass
→ V15-01 课程导航目标、学生来源与备课返回
→ V15-02 课次课件浏览与备课动作分离
→ V15-03 全量回归与版本验收
→ checkpoint-V1.5-pass（需最终产品体验确认）
```

V15-01–V15-02 分别运行相关测试、typecheck、lint，并按风险补 build 或本地 smoke。V15-03 运行全量测试、typecheck、lint、build、`git diff --check` 和代表性本地 Windows 流程。V1.5 不运行 portable/installer packaging，不生成对外交付包。

## 保持冻结的能力

V1.1 的备课、外部资料、素材、Skill、Parser、Search、AI 与 Backup，V1.2 的课程/学生/点名/进度数据语义，V1.3 的快速建课，以及 V1.4 的只读题库原样复用。V1.5 只整理 Renderer 的课程、课次、课件浏览和双向返回，不建立第二套课件目录或新数据模型。
