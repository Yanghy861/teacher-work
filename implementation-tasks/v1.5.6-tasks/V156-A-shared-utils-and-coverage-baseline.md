# V156-A · 共享工具收敛与覆盖率基线

**状态：** `DONE`（2026-09-01；门禁与产物见下）

> 基线说明：按 2026-08-31 产品负责人裁决，V1.5.6 在 `checkpoint-V1.5.5-pass` 尚未打点的情况下提前启动；V1.5.5 与 V1.5.6 合并验收，通过后按版本顺序补齐两个 pass 标签。

## 前置

- 基线 `checkpoint-V1.5.5-pass` 已创建；
- 设计基准：`docs/v1.5.6-maintainability-plan.md` §2.1。

## 范围

- 新建 `src/renderer/ui-utils.ts`：`toErrorMessage(error: unknown, fallback: string)` 与 `formatBytes`；逐文件替换 16 处 `toErrorMessage` 与 4 处 `formatBytes` 本地定义（回退文案逐处保持原值），核对受影响的字符串合同测试断言。
- devDependency 增加 `@vitest/coverage-v8`（与 vitest 4 同主版本），script 增加 `"test:coverage": "vitest run --coverage"`。

## 不做

- 不改任何行为与文案；
- 不设覆盖率阈值（本任务只产出并记录基线）。

## 验收

- 全量测试（替换面广，须全量）、typecheck、lint 通过；
- `test:coverage` 可运行，基线数字记入 V1.5.6 验收文档；
- 完成后更新 STATUS/GOAL_PROGRESS 并创建 `v1.5.6(V156-A)` 本地提交。

## 完成记录（2026-09-01）

- `src/renderer/ui-utils.ts` 新建：`toErrorMessage(error, fallback)` 与 `formatBytes`；16 个文件移除本地 `toErrorMessage`、4 个文件移除本地 `formatBytes`（lesson-material-reader / managed-files-panel / external-library-panel / material-picker-panel），question-bank-page 原本即参数化，仅移除本地定义并接入 import。
- 等值审计：逐文件核对原本地函数回退文案与现调用点实参一一相同（含 quick-course-wizard 的“输入无效。”与 quick-course-wizard-full 的“创建失败，请稍后重试。”两套原值）；4 处 `formatBytes` 原副本逐段与共享版本一致（含 managed-files-panel 的单行副本）。提取脚本引入的 4 处误插 import 已纠正、15 处 EOF 多余空行已清理。
- 门禁：全量测试 60 文件 / 244 通过 / 1 跳过；typecheck 0 错误；lint 通过；`git diff --check` 干净。
- 新增 `tests/ui-utils.test.ts`（6 例，含"无 GB 档、1024 KB→1.0 MB 边界”合同），ui-utils.ts 覆盖率 100%。
- 覆盖率基线（`npm run test:coverage`，@vitest/coverage-v8 ^4.1.11，无阈值）：语句 73.28% / 分支 65.78% / 函数 76.55% / 行 75.25%（全量数字以 V1.5.6 验收文档为准）。
