# V155-A · AI 修改范围元数据结构化

**状态：** `TODO`

## 前置

- 基线 `checkpoint-V1.5.4-pass` 已创建（V154-B 产品负责人体验确认完成）；
- 设计基准：`docs/v1.5.5-hardening-plan.md` §2.1。

## 范围

- `src/shared/draft-contracts.ts`：新增 `DraftModificationScope`（`scopeVersion: 1`、`mode: 'single' | 'lesson'`、`baselineCount` 1..100、可选 `targetFileId` ≤128 / `targetName` ≤500、`teacherRequirement` ≤ `DRAFT_REQUIREMENT_MAX_CHARS`、可选 `confirmedPlan` ≤800）与守卫 `isDraftModificationScope`；`DraftNoteMetadata` 增加可选键 `modification`；`GenerateDraftRequest` 增加可选键 `modification`，`isGenerateDraftRequest` 可选键列表同步加入。
- `src/main/draft/draft-service.ts`：`generateResolved` 透传 `input.modification` 入 metadata；`regenerate` 与 `requirement` 同步透传 `original.aiMetadata.modification`。
- 新建 `src/renderer/draft-scope.ts`：从 `draft-panel.tsx` 原样移入 `buildModeRequirement`、`parseModificationScope`、`extractMarkedSection`、`modificationNodeLabel`、`buildPublishConfirmation`，签名不变。
- `src/renderer/draft-panel.tsx`：`confirmPlanAndGenerate` 构造结构化对象随 `drafts.generate` 请求发出；`parseModificationScope` 优先读 `aiMetadata.modification`，无此键回退现有标记解析。
- 新增 `tests/draft-scope.test.ts`；扩展 `tests/draft-service.test.ts` 与 `drafts:generate` 合同测试。

## 不做

- 不改 AI 提示词内容与 `DRAFT_PROMPT_VERSION`（标记串继续原样发送给 AI）；
- 不新增 IPC 通道（仅扩展现有 `drafts:generate` 载荷，同 D18 先例）；
- 不做 `ai_metadata_json` 数据迁移（旧笔记回退标记解析）。

## 验收

- draft-scope、draft-service、合同测试、typecheck、lint 通过；
- 结构化键优先、旧笔记回退解析不回归、老师要求含标记原文不再污染还原；
- 完成后更新 STATUS/GOAL_PROGRESS 并创建 `v1.5.5(V155-A)` 本地提交。
