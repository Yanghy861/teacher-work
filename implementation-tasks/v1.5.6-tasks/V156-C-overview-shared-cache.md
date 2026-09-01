# V156-C · overview 共享缓存

**状态：** `TODO`

## 前置

- V156-B 为 `DONE`；
- 设计基准：`docs/v1.5.6-maintainability-plan.md` §2.3。

## 范围

- App 层新增 `CoreOverviewProvider`（与 `AppDialogProvider` 同级）：持有快照 + `reload()` + `invalidate()`；页面经 `useCoreOverview()` 消费；变更动作完成后 `invalidate()` 触发单次共享重拉；`files.onContentChanged` 接同一失效口。纯 Renderer 改动。
- 分页迁移，一次一页、每页跑该页既有 UI 合同测试：course-dashboard → students-page → course-detail → draft-panel；字符串测试钉住 reload 形态处同步更新断言（断言意图不变）。

## 不做

- 不新增 IPC/schema（保持 V1.5 系"只改 Renderer"约束）；
- 不改页面数据消费语义（页面拿到相同的 overview 快照，仅消除重复拉取）。

## 验收

- 迁移页行为不变，单次变更仅触发单次共享重拉（日志可证）；
- 全量测试、typecheck、lint、production build 通过；
- 完成后更新 STATUS/GOAL_PROGRESS 并创建 `v1.5.6(V156-C)` 本地提交。
