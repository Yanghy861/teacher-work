# 教师工作台 V1.5 · 实施入口

Lean V1、V1.1、V1.2、V1.3、V1.4 已分别在 `checkpoint-L12-pass`、`checkpoint-V1.1-pass`、`checkpoint-V1.2-pass`、`checkpoint-V1.3-pass`、`checkpoint-V1.4-pass` 冻结。当前活动版本为 V1.5，只执行 `v1.5-tasks/V15-01`–`V15-03`；历史任务只保留追溯，不得重新执行。

## 活动资料

- 产品主规格：[`../教师工作台_V1_5_教学内容工作台_产品与实施方案.md`](../教师工作台_V1_5_教学内容工作台_产品与实施方案.md)
- 实施决策：[`V1_5_DECISIONS.md`](V1_5_DECISIONS.md)
- 唯一任务索引：[`TASK_INDEX.md`](TASK_INDEX.md)
- 唯一状态表：[`STATUS.md`](STATUS.md)
- Goal 进度证据：[`GOAL_PROGRESS.md`](GOAL_PROGRESS.md)
- Git 与标签协议：[`VERSION_CONTROL.md`](VERSION_CONTROL.md)

## V1.5 轻量实施链

```text
checkpoint-V1.4-pass
→ V15-01 教学内容导航目标、课程 / 学生入口与返回
→ V15-02 教学内容三分区、临时课次抽屉与宽正文
→ V15-03 全量回归与版本验收
→ checkpoint-V1.5-pass（已确认）
→ V1.5.2：V152-A 术语收口 → V152-B 工作副本 → V152-C 已有课件改进 → V152-D 修改记录与版本发布 → V152-E 最终门
→ checkpoint-V1.5.2-pass（需最终产品体验确认）
```

V15-01–V15-02 分别运行相关测试、typecheck、lint，并按风险补 build 或本地 smoke。V15-03 运行全量测试、typecheck、lint、build、`git diff --check` 和代表性本地 Windows 流程。V1.5 不运行 portable/installer packaging，不生成对外交付包。

V1.5.1 记为本轮 V15-01–V15-03 教学内容工作台实施链的整体编号；V1.5.2 是其后的下一轮增量，不创建 V1.6：教学内容进一步演进为“课件 / AI 备课 / 修改记录”，支持当前工作副本随时保存、AI 修改会话追踪和老师确认后保存为新版本。V1.5.2 不提前并入 V15-01–V15-03，须在 V15-03 最终体验确认后另行确认实施；未来同类增量顺延为 V1.5.3、V1.5.4。

## 保持冻结的能力

V1.1 的备课、外部资料、素材、Skill、Parser、Search、AI 与 Backup，V1.2 的课程/学生/点名/进度数据语义，V1.3 的快速建课，以及 V1.4 的只读题库原样复用。V1.5 只整理 Renderer 的课程与“教学内容”入口，把课件、备课和草稿箱放进共享课次上下文；课程 / 课次目录按需临时展开，不建立第二套课程树或新数据模型。
