# 教师工作台 V1 / V1.1 / V1.2 / V1.3 / V1.4 / V1.5 任务索引

## 历史基线（全部冻结）

- T01–T08：应用骨架、SQLite、安全 IPC 与解析/搜索/刷新/恢复 Spike 已完成。
- 旧 `tasks/T09-*` 至 `tasks/T42-*` 已退役，只用于历史追溯，不得执行。
- L01–L12：Lean V1 已完成，最终标签 `checkpoint-L12-pass`。
- V11-01–V11-05：V1.1 外部资料、课次备课、Skill、草稿与最终门禁已完成，最终标签 `checkpoint-V1.1-pass`。
- V12-01–V12-05：V1.2 课程、学生、点名、进度和备课接入已完成，最终标签 `checkpoint-V1.2-pass`。
- V13-01–V13-05：V1.3 快速建课已完成，最终标签 `checkpoint-V1.3-pass`。
- V14-01–V14-03：V1.4 只读题库接入已完成，最终标签 `checkpoint-V1.4-pass`。

历史任务保持 `DONE`，不得因 V1.5 重新执行或改写验收状态。

## V1.5 当前唯一活动链

| 里程碑 | 前置 | 核心产物 | 验收 |
|---|---|---|---|
| [V15-01](v1.5-tasks/V15-01-teaching-content-navigation.md) | `checkpoint-V1.4-pass`、V1.5 修订冻结方案 | 教学内容目标、课程 / 学生入口、直接打开和双向返回 | 相关测试 + typecheck + lint + 风险 build |
| [V15-02](v1.5-tasks/V15-02-teaching-content-workspace-ui.md) | V15-01 | 课件 / 备课 / 草稿箱、临时课次抽屉、宽正文和沉浸阅读 | 相关回归 + build + UI smoke |
| [V15-03](v1.5-tasks/V15-03-final-gate.md) | V15-01–V15-02 | V1.5 全量回归、production build 与代表性 Windows 流程 | 最终验收 |

V15 任务必须按编号顺序执行；同一时刻最多一个里程碑为 `IN_PROGRESS`。V15-03 通过且产品负责人最终体验确认后才创建 `checkpoint-V1.5-pass`。V1.5 不运行 portable/installer packaging。

V1.5.1 方案不改变当前 V1.5 活动链，也不创建 V1.6；后续会在同一教学内容工作台上把“草稿箱”收口为“AI 备课 / 修改记录”，并补充工作副本、修改方案确认和版本发布能力。实现任务需在 V15-03 完成后另行确认。
