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

下一轮增量 V1.5.2（AI 修改工作区；本轮实施链整体记为 V1.5.1）不改变当前 V1.5 活动链，也不创建 V1.6；后续会在同一教学内容工作台上把“草稿箱”收口为“AI 备课 / 修改记录”，并补充工作副本、修改方案确认和版本发布能力。实现任务需在 V15-03 完成后另行确认。

## V1.5.2 活动链（AI 修改工作区）

基线 `checkpoint-V1.5-pass`；方案为主规格第 11 节，决策 D09–D15。

| 里程碑 | 前置 | 核心产物 | 验收 |
|---|---|---|---|
| [V152-A](v1.5.2-tasks/V152-A-terminology.md) | `checkpoint-V1.5-pass` | 课件 / AI 备课 / 修改记录三分区术语与全局入口收口 | 相关测试 + typecheck + lint + 风险 build |
| [V152-B](v1.5.2-tasks/V152-B-work-copy.md) | V152-A | 工作副本保存/恢复/未发布提示 | 相关测试 + typecheck + lint + 风险 build |
| [V152-C](v1.5.2-tasks/V152-C-improvement-flow.md) | V152-B | 参考范围 + 修改要求 + AI 方案确认 + 新旧对比 | 相关测试 + 中继式 AI 验收 + build |
| [V152-D](v1.5.2-tasks/V152-D-records-and-publish.md) | V152-C | 修改记录时间线 + 保存为新版本 | 相关测试 + UI smoke + build |
| [V152-E](v1.5.2-tasks/V152-E-final-gate.md) | V152-A–D | 全量回归 + 代表性 Windows 流程 + 分层 AI 验收 | 最终验收；确认后创建 `checkpoint-V1.5.2-pass` |

任务按编号顺序执行；同一时刻最多一个 `IN_PROGRESS`。V1.5.2 不运行 portable/installer packaging。

## V1.5.3.2 候选后续分支（待确认，不是当前活动链）

方案：[`docs/v1.5.3.2-material-library-plan.md`](../docs/v1.5.3.2-material-library-plan.md)

该分支将“素材库”实现为老师维护的逻辑目录树；外部资料仍映射真实文件夹树，课程/学生副本继续与素材库原件隔离。产品负责人确认方案和版本归属前，不得将以下任务标记为 `IN_PROGRESS`，不得新增 schema/migration/Service/IPC：

| 里程碑 | 前置 | 核心产物 | 验收 |
|---|---|---|---|
| [V1532-A](v1.5.3.2-tasks/V1532-A-material-library-model.md) | 方案确认 | 目录模型、单父级约束、现有资料一次性整理 | 模型/迁移测试 + typecheck + lint + build |
| [V1532-B](v1.5.3.2-tasks/V1532-B-material-library-ipc.md) | V1532-A | 目录查询、新建、重命名、移动、删除、排序与复制流转 IPC | IPC/安全契约 + typecheck + lint + 风险 build |
| [V1532-C](v1.5.3.2-tasks/V1532-C-material-library-ui.md) | V1532-B | 逻辑目录树、文件区、详情、搜索路径和明确资料流转文案 | Renderer 测试 + typecheck + lint + build + UI smoke |
| [V1532-D](v1.5.3.2-tasks/V1532-D-final-gate.md) | V1532-A–C | 全量回归、迁移/隔离 Windows 流程与最终体验确认 | 最终验收；确认后按裁决创建标签 |
