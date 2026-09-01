# V156-D · 向导去重与静态渲染测试

**状态：** `DONE`（2026-09-01；门禁与产物见下）

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

## 完成记录（2026-09-01）

- 新增 `src/renderer/quick-course-wizard-orchestration.ts`：共享编排 hook `useQuickCourseWizardOrchestration`，承载两向导重复的步骤 1–2 逻辑（state/花名册/空课次/教学计划输入/放弃确认/去到课次步/重名处理）；`quick-course-wizard.tsx` 与 `quick-course-wizard-full.tsx` 只保留各自步骤渲染层与 full 特有的步骤 3–4 排课/提交逻辑。逐向导差异经参数保持原值：basics 的回退文案“输入无效。”、full 的“创建失败，请稍后重试。”、full 的 `parseDuration(durationText)` 时长注入、full 的集成宿主 `confirm('放弃当前快速建课内容吗？')`。放弃确认的应用级对话框兜底文案收敛到 hook 单点。
- 字符串合同测试按 V156-C 先例重定向（断言意图不变、不降级）：`quick-course-wizard-ui.test.ts` 的 `resolveRosterDuplicate`/`confirmDiscard` 与 `quick-course-wizard-integration-ui.test.ts` 的 `lessonMode: hadLessons ? state.lessonMode : 'empty'` 改指向编排模块，并新增组件委托 hook 的断言；`QUICK_COURSE_LESSON_LIMIT_MESSAGE`、`max="100"`、`.createCourseSetup(` 唯一性等其余 pin 原位保留。v1.3-* 全组 17 tests 通过。
- 静态渲染测试升级（加法）：新增 `tests/static-render-v156-d.test.ts`（10 tests）。为可静态渲染做了最小导出/抽取（零行为变化）：`managed-files-panel` 导出 `FolderBranch`/`LibraryButton`/`FileList`/`FileSummary`，右键菜单 JSX 原样抽出为导出组件 `MaterialContextMenu`（分区渲染条件、文案与禁用逻辑逐字节保留）；`course-detail` 的 `LessonsSection` 加 export。覆盖：面板初始 loading 门槛、树行拖拽 affordance 类（is-dragging/is-drop-before|inside|after）与展开 aria、目录按钮 aria-current 与 drop 高亮、文件行 is-draggable 与四个行内动作（含“无课次时复制按钮禁用”）、右键菜单 role=menu/menuitem 骨架与 root/folder/file 三分区及禁用守卫、LessonsSection 阶段默认收起（V154 合同）与展开后的课次编号/Current/已点名徽章、draft-panel 收件箱/备课两初始态、App 外壳 8 项导航。拖拽运行时验证仍归产品负责人手工确认单。
- 门禁：全量 63 files / 265 passed / 1 skipped（+10）、typecheck 0 错误、lint 通过、`git diff --check` 干净。
