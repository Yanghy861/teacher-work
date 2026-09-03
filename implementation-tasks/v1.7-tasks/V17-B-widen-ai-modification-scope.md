# V17-B · AI 修改对象放宽到全部 md（D27）

**状态：** `TODO`

## 范围

- `lesson-prep-context.ts`：`isAppGeneratedCoursewareFile` → `isAiEditableFile`（`mimeType === 'text/markdown'`；版本模式 ` · 第 N 版.md` 判断保留，仅用于版本链命名与排序，不再作准入）；
- draft-panel：单文件修改候选列出课次全部 md（版本链最新版优先排序）；非 md 置灰提示更新为"仅支持修改 Markdown 文件；外部 Office 文档请用系统应用打开修改"；
- `lesson-files-section.tsx`："修改这份"入口对 md 文件启用（含外部导入 md）；无 md 课次引导更新"本课还没有 Markdown 课件，可先导入 md 讲义或用 AI 生成第一版课件"；
- 修改流（方案 → 确认 → 生成 → 对比 → 发布）复用 V1.5.2/V1.6 既有链路零改动；外部 md 发布产物 = `原名 · 第 N 版.md`（publishLessonDraftVersion 既有非版本链路径）。

## 不做

- 不动 docx/pdf/图片的不可修改边界；不动整课重做模式（仍以课次内 md 为基线）；
- 不改 V16-B 的参考预算与确认弹窗语义。

## 验收

- 静态渲染钉测更新（候选含外部 md、非 md 置灰文案、无 md 引导）；
- 既有修改流回归测试全绿；
- typecheck、lint；完成后更新 STATUS/GOAL_PROGRESS 并提交 `v1.7(V17-B): <摘要>`。
