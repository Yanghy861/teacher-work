# V17-B · AI 修改对象放宽到全部 md（D27）

**状态：** `DONE`

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

## 完成记录（2026-09-03）

- `lesson-prep-context.ts`：新增 `isAiEditableFile`（mimeType === 'text/markdown'）与 `orderAiEditableFiles`（版本链最新版在前、其余 md 按原序跟后）；`isAppGeneratedCoursewareFile` 保留仅用于版本链命名/排序与整课基线，不再作修改准入。
- `draft-panel.tsx`：单文件修改候选 = `aiEditableCurrentFiles`（全部 md）；默认模式判定改为“有 md 即 single”；整课重做（lesson 模式）基线仍限应用内课件版本（V17-B 不动 D23 语义）；无 md/仅无版本链的引导文案分离更新。
- `lesson-files-section.tsx`：“修改这份”对 md 启用（含外部导入）；非 md 置灰 title 更新为“仅支持修改 Markdown 文件；外部 Office 文档请用系统应用打开修改”；无 md 引导为“本课还没有 Markdown 课件，可先导入 md 讲义或用 AI 生成第一版课件。”；“整课重做”按钮仍按应用内课件版本存在性显示。
- `publishLessonDraftVersion`：读取 note 的 ai_metadata_json，`modification.targetName` 为非版本链名（外部导入 md）时以 `原名 · 第 N 版.md` 命名（版本号仍课次锚定 MAX+1），版本链目标与无 modification 的节点维持课次标题命名；解析失败静默回退。
- 测试：`tests/v17-b-widen-scope.test.ts` 4 例（候选排序、外部 md 发布命名/原件不动、版本链/无目标命名回退、静态钉测）；`v1.6-scope-budget.test.ts` 钉测按 D27 演进（D27 行为即该测试“仅限版本链”断言的放宽，V16-B 其余预算断言不变）。
- 门禁：全量 75 files / 337 tests（1 skipped）、typecheck、lint 通过。
