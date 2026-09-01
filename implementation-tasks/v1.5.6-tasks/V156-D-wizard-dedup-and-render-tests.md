# V156-D · 向导去重与静态渲染测试

**状态：** `TODO`

## 前置

- V156-C 为 `DONE`；
- 设计基准：`docs/v1.5.6-maintainability-plan.md` §2.4。

## 范围

- 抽共享编排 hook `useQuickCourseWizardOrchestration`（或并入 `quick-course-wizard-model.ts`），`quick-course-wizard.tsx` 与 `quick-course-wizard-full.tsx` 只保留各自步骤渲染层，入口行为不变。
- 静态渲染测试升级（**加法而非替换**）：`managed-files-panel` + `material-tree`（树结构、拖拽 affordance 类、aria 属性、右键菜单 DOM 骨架）→ `course-detail` LessonsSection 初始渲染（阶段默认收起、徽章）→ `draft-panel` 初始态（收件箱/备课两模式）→ App 外壳（8 项导航）。

## 不做

- 不删除或降级现有字符串合同测试；
- 不把拖拽运行时验证自动化（仍归产品负责人手工确认单）。

## 验收

- `v1.3-*` 全组测试、新静态渲染测试、typecheck、lint 通过；
- 完成后更新 STATUS/GOAL_PROGRESS 并创建 `v1.5.6(V156-D)` 本地提交。
