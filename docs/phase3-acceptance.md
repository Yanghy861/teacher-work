# Phase 3 · AI 备课阶段验收

## 交付范围

- 备课页可勾选 managed 资料，并通过类型化 Preload/IPC 生成讲义、例题和作业三类独立草稿。
- 生成只读取明确选择的文件或文本片段，按字符上限截断，并把 token 上限传给兼容 API。
- Gateway 使用 fake provider 完成成功、网络失败、空响应和取消；失败不会创建新 note，已有 note 保留，手动重试可继续生成。
- 生成结果写入普通可编辑 note；通过既有 note 更新流程人工修改并保存，不覆盖 managed 原资料。
- API Key 只在 Main 侧使用。验收检查日志、SQLite、IPC 响应/错误和 workspace `backups` 目录均不含明文 Key。

## 自动化证据

- `tests/phase3-acceptance.test.ts`：
  - fake provider 串起“选资料 → 讲义/例题/作业 → 人工修改 → 保存”；
  - 未选择资料在 IPC 校验层被拒绝，fake fetch 调用数保持为零；
  - 字符上限、token 上限和实际截断/传参；
  - 网络失败、空响应、取消后已有 note 不丢，成功重试可保存；
  - 未选文件正文不会进入 prompt，原 managed 文件内容保持不变；
  - Key 不出现在日志、数据库、IPC 返回/错误或 workspace 备份目录。
- `tests/draft-service.test.ts`、`tests/draft-ipc.test.ts`：来源位置、普通 note 元数据、编辑保存、失败/空响应重试、路径字段和上限回归。
- `tests/ai-gateway.test.ts`、`tests/ai-ipc.test.ts`、`tests/logging-redaction.test.ts`：fake Gateway 成功/HTTP/超时/取消、Key 存储边界、错误和日志脱敏。

## 命令结果

- `npm test`：22 files / 61 tests ✅
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅
- `git diff --check` ✅

## 人工/真实环境与限制

本阶段没有接入真实 API Key 或付费 provider；所有网络行为均由本地 fake fetch 驱动。测试使用隔离临时 workspace、脱敏文本 fixture，未读取或提交真实教学资料、运行数据库、日志、Key 或构建产物。

本阶段调用现有 SQLite backup API 生成隔离验收备份，并对 `workspace/backups` 做 Key 明文负向扫描；完整 backup/restore 流程属于 L11，不在 L10 提前实现。持久化 AI workflow、流式输出、精确续跑、content hash manifest 和跨页面拖拽选取仍按 Lean V1 决策留在 Later。
