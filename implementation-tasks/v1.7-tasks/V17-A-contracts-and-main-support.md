# V17-A · 合同与 Main 支撑（md 写路径 + 题库载荷）

**状态：** `TODO`

## 范围

- Migration v17：`notes.note_kind` CHECK 追加 `'manual_edit'`（12 步法重建；FK 守卫沿用 V16-D 修复后的 runMigrations 框架）；专项迁移测试（外键无损、旧值语义不变、幂等）；
- 新 IPC：`files:read-text`（`{fileId}` → `{content}`，仅 text/*）；`files:write-version`（`{fileId, bodyMd, summary?}` → `{file, version}`：版本链 → ` · 第 N+1 版.md`，非版本链 → `原名（编辑版）.md`；临时文件 + 原子重命名 + importToLesson + onContentChanged + SearchService 入索引；**绝不 UPDATE 目标行**）；`question-bank:search-questions`（Renderer 过目步用，载荷即 QuestionBankSearchRequest）；
- 合同扩展（`draft-contracts.ts`）：`DraftBankPlan`（`{text?, tags?, grade?, type?, difficultyMin?, difficultyMax?, targetCount}`，`isDraftBankPlan` 守卫，targetCount 1..20）；`GenerateDraftRequest.bankPlan?` / `dualVersion?`；`GenerateDraftResult.studentNoteId?`；`DraftNoteMetadata.bankSelection?`（plan/数量/候选 ID，不存全文）；
- `draft-service` buildContext 扩展：`renderQuestionForContext`（题干+选项+答案+解析+元数据行+含图标记）；候选块整块计入 maxChars 预算（超限按 targetCount 截减并记 metadata）；
- AI 检索计划（阶段一）：非流式 `requestText` + `QuestionBankSummary` facet 摘要 → JSON 计划解析（`{...}` 截取容错，失败回退 text 检索 + 默认难度）→ `isDraftBankPlan` 校验；
- 学生版生成编排（`dualVersion: true`）：教师版完成后第二次请求（剥离答案/标注 prompt，maxTokens 减半，非流式），产出 `studentNoteId`。

## 不做

- 不改 V1.6 流式/预算/MinerU 冻结语义；不动 `publishToLesson`（学生版发布命名在 V17-D 处理）；
- 不做题库写路径、多快照机制。

## 验收

- 迁移专项测试（v15→v17 无损、manual_edit 可写、FK 完整）；
- write-version Service 测试：版本链命名递增、外部 md 副本命名、原子写、索引 `mineru_ready`/`indexed` 状态正确、目标原件字节不变；
- 合同守卫测试（bankPlan 非法值拒绝、dualVersion 缺省不改变既有请求）；
- 计划解析容错测试（合法 JSON / 包裹 markdown fence / 非法回退）；
- 双版编排 fake provider 测试（两次请求序、studentNoteId 关联、学生版 prompt 含教师版全文）；
- typecheck、lint；完成后更新 STATUS/GOAL_PROGRESS 并提交 `v1.7(V17-A): <摘要>`。
