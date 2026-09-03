# V17-C · md 人工编辑器（D28/D29）

**状态：** `DONE`（2026-09-03）

## 范围

- `lesson-material-reader.tsx`：md 文件新增"编辑"按钮 → 编辑/预览切换（只读课次与外部根目录资料不显示；MinerU 增强解析按钮逻辑不动）；
- 新组件 `md-editor.tsx`（**零新依赖**：受控 textarea + 工具栏 + 分屏预览复用 `MarkdownDocument`）：
  - 工具栏：加粗/斜体、标题 H1–H3、有序/无序列表、引用、表格模板、分隔线、行内公式 `$…$`、块级公式 `$$…$$`（模板插入 + 光标定位）、插图（从本课文件列表选图片 → 插入 `![名](文件名)` 引用）、撤销/重做；
  - **行级公式输入**（立项要求）：textarea 原文 `$…$`；预览侧实时 KaTeX；工具栏附 **LaTeX 片段速查**（分式/根号/上下标/角度/三角形等数学高频，点选插入模板）；
  - **字号/排版**：标题层级模板 + `<sub>`/`<sup>` 上下标（`renderInline` 已有的 code/文本通道；不引入 HTML 内联样式——渲染端无任意 HTML 能力，安全边界不放松）；
  - 热保存：localStorage（键 = fileId，250ms 防抖，失败静默）；进入编辑时存在热草稿 → "恢复上次未保存编辑？恢复/丢弃"；
- 保存（D29 存为新版本）：`files:write-version` → 成功提示"已保存为新版本（旧版保留在历史版本）"并自动选中新文件；
- overview：`note_kind='manual_edit'` 来源标注"人工编辑"（不参与 AI note 语义，仅标识，历史版本区并列展示）。

## 不做

- 不做"直接改当前版"（D29 明确排除）；外部根目录资料无编辑入口（先复制到本课）；
- 不引入 CodeMirror/Monaco/任何编辑器依赖；不做 base64 内嵌图片；不改 draft-panel 的 AI 草稿编辑（保存前 textarea 现状保留）。

## 验收

- 编辑器组件静态渲染测试（工具栏项、公式模板插入回调、分屏预览、热保存恢复提示）；
- write-version 已由 V17-A Service 测试覆盖（本任务做 UI 接线）；阅读器既有回归（公式渲染、增强解析按钮、图片引用）全绿；
- 手工冒烟：编辑含 `\[...\]` 公式的课件 → 插入本课图片 → 保存 → 新版本文件出现且旧版在历史版本、原图未动；
- typecheck、lint；完成后更新 STATUS/GOAL_PROGRESS 并提交 `v1.7(V17-C): <摘要>`。

## 完成记录（2026-09-03）

- `lesson-material-reader.tsx`：`editable`/`onFileSaved` props + “✎ 编辑 / ✓ 预览”切换（aria-pressed，仅 md + editable）；编辑态渲染 MdEditor，非编辑态渲染 MarkdownDocument；保存成功分支提示并 `onSelectFile(result.file.id)` 选中新文件。
- `lesson-files-section.tsx`：`editable={!readOnly}` 接线；`onFileSaved` → 重拉课件清单 + 共享 overview（useCoreOverview）+ 选中新文件；历史版本区并列展示最近 5 条 manual_edit 标注（“✎ 人工编辑：原名 → 新名”）。
- `md-editor.tsx`（新建，零新依赖）：受控 textarea + 工具栏（加粗/斜体/H1–H3/上下标/列表/引用/表格/分隔线/行内与块级公式/18 项 LaTeX 速查/插图面板/撤销重做）；光标定位 + 选区包裹插入；分屏 KaTeX 预览复用 MarkdownDocument；localStorage 热保存（250ms 防抖、失败静默）+ sessionStorage 原文/热草稿分离 + “恢复草稿/丢弃”提示；保存调 `files.writeVersion`，成功清热草稿。
- `managed-file-service.ts`：`writeVersion` 两分支后调 `recordManualEditNote`（INSERT note_kind='manual_edit'，draft_status NULL，body “人工编辑：原名 → 新名”），try/catch 静默——标注失败不阻塞保存。
- `core-data-service.ts` + `core-contracts.ts`：NoteRow/NoteRecord.noteKind 扩 'manual_edit'；mapNoteRecord 显式暴露 manual_edit noteKind（manual 省略语义不变）；既有 listLessonAiResults/手记/学生列表/快建向导过滤天然排除 manual_edit（钉测确认）。
- 手工冒烟项“编辑含 `\[...\]` 公式课件 → 插图 → 保存”的自动化部分由分屏 KaTeX 预览钉测 + write-version 服务测试覆盖；真实手感冒烟归 V17-E 隔离 Windows 冒烟。
- 测试：`tests/v17-c-md-editor.test.ts` 12 例新增；全量 75 files / 349 tests、typecheck、lint 通过。
