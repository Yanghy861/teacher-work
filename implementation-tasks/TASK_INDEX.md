# 教师工作台 V1 / V1.1 / V1.2 / V1.3 任务索引

## 历史基线（全部冻结）

- T01–T08：应用骨架、SQLite、安全 IPC 与解析/搜索/刷新/恢复 Spike 已完成。
- 旧 `tasks/T09-*` 至 `tasks/T42-*` 已退役，只用于历史追溯，不得执行。
- L01–L12：Lean V1 已完成，最终标签 `checkpoint-L12-pass`。
- V11-01–V11-05：V1.1 外部资料、课次备课、Skill、草稿与最终门禁已完成，最终标签 `checkpoint-V1.1-pass`。
- V12-01–V12-05：V1.2 课程、学生、点名、进度和备课接入已完成，最终标签 `checkpoint-V1.2-pass`。

历史任务保持 `DONE`，不得因 V1.3 重新执行或改写审核状态。

## V1.3 当前唯一活动链

| 里程碑 | 前置 | 核心产物 | 验收 |
|---|---|---|---|
| [V13-01](v1.3-tasks/V13-01-course-setup-core.md) | `checkpoint-V1.2-pass` | schema v13、时长、`createCourseSetup` 契约、单事务 Service 与安全 IPC | 相关测试 + typecheck + lint + 风险 build |
| [V13-02](v1.3-tasks/V13-02-wizard-domain-model.md) | V13-01 | 名单、阶段、课次、规律 / 自由日期排课与确认摘要 view model | 相关测试 + typecheck + lint |
| [V13-03](v1.3-tasks/V13-03-wizard-course-lessons-ui.md) | V13-02 | 向导容器、课程与学生、阶段与课次前两步 UI | 相关测试 + build + UI smoke |
| [V13-04](v1.3-tasks/V13-04-scheduling-review-integration.md) | V13-03 | 三种排课、月历、确认页、课程页入口和创建结果完整接入 | 相关回归 + build + Windows smoke |
| [V13-05](v1.3-tasks/V13-05-final-gate.md) | V13-01–V13-04 | V1.3 全量回归、production build 与代表性本地 Windows 流程 | 最终验收 |

V13 任务必须按编号顺序执行；同一时刻最多一个里程碑为 `IN_PROGRESS`。V13-05 通过且产品负责人最终体验确认后才创建 `checkpoint-V1.3-pass`。V1.3 不运行 portable/installer packaging。
