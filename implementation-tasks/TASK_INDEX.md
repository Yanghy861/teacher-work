# 教师工作台 V1 / V1.1 / V1.2 任务索引

## 历史基线（全部冻结）

- T01–T08：应用骨架、SQLite、安全 IPC 与解析/搜索/刷新/恢复 Spike 已完成。
- 旧 `tasks/T09-*` 至 `tasks/T42-*` 已退役，只用于历史追溯，不得执行。
- L01–L12：Lean V1 已完成，最终标签 `checkpoint-L12-pass`。
- V11-01–V11-05：V1.1 外部资料、课次备课、Skill、草稿与最终门禁已完成，最终标签 `checkpoint-V1.1-pass`。

历史任务保持 `DONE`，不得因 V1.2 重新执行或改写审核状态。

## V1.2 当前唯一活动链

| 里程碑 | 前置 | 核心产物 | 验收 |
|---|---|---|---|
| [V12-01](v1.2-tasks/V12-01-core-progress-attendance.md) | `checkpoint-V1.1-pass` | schema v12、课程进度、课次 session、点名、学生关系与安全 IPC | 相关测试 + typecheck + lint |
| [V12-02](v1.2-tasks/V12-02-course-dashboard.md) | V12-01 | 课程列表/详情、Current/Viewed、软推进、今日点名与课程生命周期 UI | 相关测试 + UI smoke |
| [V12-03](v1.2-tasks/V12-03-students-page.md) | V12-02 | 学生列表/详情、在读/历史课程、manual 学习记录 | 相关测试 + UI smoke |
| [V12-04](v1.2-tasks/V12-04-prep-files-integration.md) | V12-03 | Viewed Lesson 资料、任意课次备课、V1.1 内核与 student_files 兼容 | 相关测试 + 风险 smoke |
| [V12-05](v1.2-tasks/V12-05-final-gate.md) | V12-01–V12-04 | V1.2 全量回归、production build 与代表性本地 Windows 流程 | 最终验收 |

V12 任务必须按编号顺序执行；同一时刻最多一个里程碑为 `IN_PROGRESS`。V12-05 通过且产品负责人最终体验确认后才创建 `checkpoint-V1.2-pass`。V1.2 不运行 portable/installer packaging。
