# L07 Sol 独立审核报告

- 审核时间：2026-08-21 +08:00
- 审核区间：L05–L07
- 审核基线：`checkpoint-L04-pass` (`6a9fc7c45cf75f054aef3b860e25d83e90a34e8f`)
- 候选提交：`486697145855a5a66827f47d84323ff71ed6a2d5` (`lean(L07): search ui rebuild gate`)
- 送审提交：`04918272dd83d772bd19f54e43e455a3f7f747ee` (`review(L07): request Sol review`)
- 结论：`CHANGES_REQUIRED`

## Findings

### P1 · 真实 managed Office/PDF 文件在 L06 Worker 中全部被判为 `parse_failed`

- 位置：`src/main/files/managed-file-service.ts:220`、`src/main/parser/document-parser.ts:359-368`。
- 复现：在隔离临时 workspace 中从仓库外匿名样本导入 `sample-001.pptx`、`sample-011.docx`、`sample-025.pdf`、`sample-040.xlsx`，逐个调用真实 `DocumentIndexWorker.enqueue`。四项均返回 `parse_failed`，Hash 已正确计算但 `chunkCount=0`。
- 原因：managed 对象正式路径统一为无扩展名的 `.../files/objects/<uuid>/content`；Worker 将这个无扩展名路径直接传给 `OfficeParser.parseOffice`。`officeparser@7.5.1` 的路径解析依赖扩展名，因此返回“不支持 content 文件”。
- 影响：L07 要求的“老师能搜索真实资料”和多格式 Parser→Search 集成在当前实现中无法工作。现有 43 项自动测试未覆盖“无扩展名 managed 对象 + 真实 Office/PDF”的组合，因此不能抵消该 finding。
- 最小修复：Worker 根据数据库中的 `original_name` 提取扩展名，并向 `OfficeParser.parseOffice` 显式传入 `fileType`；保留物理 managed 路径布局不变。增加代表性真实样本 smoke 或等价的无扩展名 managed fixture，确认 PPTX/DOCX/PDF/XLSX 至少返回 `indexed`/`no_text`，并确认中文/数学查询能命中。

## 已通过项目

- 候选祖先关系和审核区间正确；工作区在复核开始时干净。
- `npm test`：17 个文件、43 项测试通过。
- `npm run typecheck`、`npm run build`、`git diff --check` 通过。
- 搜索 UI、搜索 IPC/Preload 白名单、任意路径 payload 拒绝、来源位置/索引状态展示、删除 `search.db` 后重建节点/note/文件索引等自动化验收通过。
- 未发现 Renderer 直接访问 Node/SQLite/文件系统、搜索结果把任意路径交给打开 API、或重建覆盖 `workspace.db`/managed 原资料的问题。

## 非阻塞限制

实时 watcher、OCR、复杂查询语言、精确 Office 跳转、向量搜索和大规模强杀矩阵仍属于 Later，不是本次拒绝原因。

## 放行决定

L07 暂不能通过。Luna 只能在 L05–L07 区间修复上述 Parser 路径/类型提示问题，补齐真实或等价 smoke，重新运行全量测试、typecheck、lint、production build，并以 `fix(L07-review): ...` 重新送审。不得开始 L08，不得创建或移动 `checkpoint-L07-pass`。
