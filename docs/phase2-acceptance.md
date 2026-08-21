# Phase 2 · 找资料阶段验收

## 交付范围

- 全局“搜索”页面通过类型化 Preload API 调用 `search:query`、`search:get-status` 和 `search:rebuild`。
- 结果显示文件/节点/记录标题、受控来源路径、原文片段、line/page/slide/sheet/heading 位置、索引状态和来源类型。
- 文件结果的“打开资料”只传登记 `fileId` 到既有 `files.open`，Renderer 不接收任意路径。
- 页面显示可用、准备中、无文本、失败四类索引状态；搜索和重建均不阻塞页面。
- 重建先清空可删除的 `search.db` 派生内容，重建节点/note，再由 L06 顺序 Worker 按当前 Hash 重做文件索引。

## 自动化证据

- `tests/search-core.test.ts`：中文/英文/数字/数学查询、短词 fallback、文件名/标题、课程范围、原文位置、Hash 替换和删除后 pending。
- `tests/document-parser.test.ts`：TXT/MD、损坏 Office、no_text、顺序 Worker、启动重扫和失败状态。
- `tests/phase2-acceptance.test.ts`：删除派生搜索内容后，文件/节点/note 均可重建恢复；文件正文新词重新出现。
- `tests/search-ipc.test.ts`：搜索白名单注册/注销、查询/状态/重建响应和带任意路径的 Renderer payload 拒绝。

## 命令结果

- `npm test`：17 files / 43 tests ✅
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅
- `git diff --check` ✅

## 真实资料基线与限制

T04/T08 已使用仓库外脱敏真实样本完成中文/数学、多格式 Parser 与 Electron runtime smoke；本次 checkout 没有可安全提交的真实资料，因此不复制或伪造新样本。L07 自动化验收使用隔离 workspace 和脱敏文本/损坏 Office fixture，覆盖搜索阶段的可复现数据恢复边界。

实时 watcher、OCR、复杂查询语言、精确 Office 跳转、向量搜索和大规模强杀矩阵仍按 Lean V1 决策留在 Later。
