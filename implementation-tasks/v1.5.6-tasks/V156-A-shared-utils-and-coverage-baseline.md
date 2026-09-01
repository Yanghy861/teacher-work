# V156-A · 共享工具收敛与覆盖率基线

**状态：** `TODO`

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
