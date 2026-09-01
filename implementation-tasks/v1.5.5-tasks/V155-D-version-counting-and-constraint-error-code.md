# V155-D · 版本计数与约束错误码修正

**状态：** `DONE`

## 前置

- V155-C 为 `DONE`；
- 设计基准：`docs/v1.5.5-hardening-plan.md` §2.4。

## 完成记录（2026-08-31）

- `publishLessonDraftVersion` 版本号改为**含软删除文件的锚定 MAX+1**：查询 lesson 范围全部 `… · 第 N 版.md` 文件名（去掉 `deleted_at IS NULL` 过滤），用 `/ · 第 (\d+) 版\.md$/u` 提取最大数字 +1，无匹配为 1；历史版本号永不被复用，删除后版本号留空洞为诚实记录。
- `isConstraintError` 改为错误码优先：`code` 为字符串且 `SQLITE_CONSTRAINT` 前缀判真；消息匹配降级为兜底（错误被包装丢码时仍可用）；函数导出供测试。
- 测试：`managed-file-service.test.ts` 增 2 用例（软删 v2 后发布得 v3 而非 v2；手工导入 `… 第 9 版.md` 后发布得 v10）；`core-data.test.ts` 增 1 用例（FK 错误码识别、UNIQUE 裸消息兜底、无关错误/非对象判假、真实重复关联仍报 STUDENT_ALREADY_LINKED）。既有 1→2→3 序列与 v1.5.2 发布合同测试不回归。
- 顺带修复 V155-C 引入的 lint `prefer-const`（`const timeout` 声明前置于处理器定义之前）。
- 自动门：相关 32 tests ✅（含 parser 复跑 6 tests）；typecheck ✅；lint ✅。

## 范围

- `src/main/files/managed-file-service.ts` `publishLessonDraftVersion`：版本号由 COUNT+1 改为 MAX+1——lesson 范围查询文件名列表（**含软删除文件**，避免历史版本号复用），锚定正则 `/ · 第 (\d+) 版\.md$/u` 提取最大数字，无匹配为 1；移除未锚定 `LIKE`。
- `src/main/data/core-data-service.ts` `isConstraintError`：先查 better-sqlite3 错误码（`SQLITE_CONSTRAINT` 前缀），消息匹配降级为兜底。
- 扩展既有版本发布相关测试：软删 v2 后发布得 v3（非 v2）；手工导入 `… · 第 9 版.md` 后发布得 v10；正常序列 1→2→3 不回归；FK 约束错误码识别、裸消息兜底仍判真。
- 在 V1.5.5 验收文档记录树操作 O(全表) 的接受决定与 revisit 条件（节点数 > ~5k）。

## 不做

- 不做带版本列的 schema v16；
- 不改发布命名的用户可见格式（`标题 · 第 N 版.md` 不变）；
- 不做树操作性能优化。

## 验收

- 相关测试、typecheck、lint 通过；
- 完成后更新 STATUS/GOAL_PROGRESS 并创建 `v1.5.5(V155-D)` 本地提交。
