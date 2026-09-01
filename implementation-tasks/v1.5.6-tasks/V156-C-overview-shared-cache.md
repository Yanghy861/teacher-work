# V156-C · overview 共享缓存

**状态：** `DONE`（2026-09-01；门禁与产物见下）

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

## 完成记录（2026-09-01）

- 新增 `src/renderer/core-overview-provider.tsx`：App 层 `CoreOverviewProvider`（挂在 `AppDialogProvider` 内侧），持有共享快照 + `reload()` + `invalidate()` + `clearError()`；`useCoreOverview()` 暴露 `overview/loading/error/reload/invalidate/clearError`。
- 新增 `src/renderer/overview-reload-coalescer.ts`：请求合并器纯模块。合并语义：无 in-flight 时直接发起；in-flight 期间的后续调用合并为"当前请求结束后立即再拉一次"（防抖合并，多次跟单只保留一次），保证调用方拿到调用之后的新数据——与旧页面"变更动作完成后整页重拉"的语义一致。`tests/overview-reload-coalescer.test.ts`（5 tests）覆盖单拉、并发合并（1 次 in-flight + 1 次跟单）、多次等待者不放大、失败回调、失败后可继续。
- `App.tsx` 接线 Provider；Provider 挂载即拉一次，`files.onContentChanged` 接同一失效口。`tests/core-overview-provider.test.ts`（6 tests）钉住 App 层接线、上下文合同、合并器复用、旧 reload 语义（失败返回 null + 共享回退文案）、订阅形态与"仅使用既有白名单 IPC 面"。
- 分页迁移（每页跑既有合同测试）：course-dashboard（含 CourseDetail/CreateCourseModal/两个 Modal 的 props 透传自动迁移）→ students-page → course-detail（纯 props，无自身拉取）→ draft-panel（三拉中 core 拉取替换为共享 reload，files 与 skills 保持独立拉取）。页面本地 `reload` 保留为委托 Provider 的薄包装，`runAction` 的动作错误与共享加载错误分离展示；页面挂载时 `clearError()` 复原旧"进入即空"的错误语义。
- 行为不变验证：单次变更动作（如保存点名/建课）现在只触发一次共享重拉（旧模式为页面级单次重拉，各页间无重复消费场景；合并器单测证明并发调用不放大拉取次数）；全量 62 files / 255 tests（+11：coalescer 5 + provider 6）、typecheck 0 错误、lint 通过、production build 通过、`git diff --check` 干净。零 IPC/schema 变化（wiring 测试钉住 Provider 只调用既有 `core.getOverview` 与 `files.onContentChanged`）。
- 备注：曾尝试 happy-dom DOM 型测试，因与项目 node 环境测试基建不合（act 环境告警 + vitest 可选 peer 自动补装污染 lockfile），改用"纯逻辑单测 + 字符串合同测试"的既有模式，happy-dom 已彻底移除、lockfile 恢复原状。
