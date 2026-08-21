# L07 Sol 独立审核报告

- 审核时间：2026-08-21 +08:00
- 审核区间：L05–L07
- 审核基线：`checkpoint-L04-pass` (`6a9fc7c45cf75f054aef3b860e25d83e90a34e8f`)
- 初始候选提交：`486697145855a5a66827f47d84323ff71ed6a2d5` (`lean(L07): search ui rebuild gate`)
- 修复提交：`f110614d96e85095640b2eb8b2414a7a5a0ca92e` (`fix(L07-review): preserve managed parser file types`)
- 送审提交：`ce7e0096595666a107f3c1d6588b48433c47f169` (`review(L07): request Sol review`)
- 结论：`PASS`

## Findings

### 初审 P1 · 真实 managed Office/PDF 文件在 L06 Worker 中全部被判为 `parse_failed`

- 位置：`src/main/files/managed-file-service.ts:220`、`src/main/parser/document-parser.ts:359-368`。
- 复现：在隔离临时 workspace 中从仓库外匿名样本导入 `sample-001.pptx`、`sample-011.docx`、`sample-025.pdf`、`sample-040.xlsx`，逐个调用真实 `DocumentIndexWorker.enqueue`。四项均返回 `parse_failed`，Hash 已正确计算但 `chunkCount=0`。
- 原因：managed 对象正式路径统一为无扩展名的 `.../files/objects/<uuid>/content`；Worker 将这个无扩展名路径直接传给 `OfficeParser.parseOffice`。`officeparser@7.5.1` 的路径解析依赖扩展名，因此返回“不支持 content 文件”。
- 影响：L07 要求的“老师能搜索真实资料”和多格式 Parser→Search 集成在当前实现中无法工作。现有 43 项自动测试未覆盖“无扩展名 managed 对象 + 真实 Office/PDF”的组合，因此不能抵消该 finding。
- 修复结论：已由 `f110614d…` 关闭。Worker 根据数据库中的 `original_name` 提取扩展名并向 `OfficeParser.parseOffice` 显式传入 `fileType`，物理 managed 路径布局保持不变；新增四格式无扩展名 managed 回归测试。

## 已通过项目

- 候选祖先关系和审核区间正确；工作区在复核开始时干净。
- `npm test`：17 个文件、44 项测试通过。
- `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过。
- 仓库外匿名真实样本 smoke：`sample-001.pptx`、`sample-011.docx`、`sample-025.pdf`、`sample-040.xlsx` 在隔离 workspace 中均成功完成 Hash/解析/索引；中文数学查询 `有理数`、`函数` 均有命中。
- 搜索 UI、搜索 IPC/Preload 白名单、任意路径 payload 拒绝、来源位置/索引状态展示、删除 `search.db` 后重建节点/note/文件索引等自动化验收通过。
- 未发现 Renderer 直接访问 Node/SQLite/文件系统、搜索结果把任意路径交给打开 API、或重建覆盖 `workspace.db`/managed 原资料的问题。

## 非阻塞限制

实时 watcher、OCR、复杂查询语言、精确 Office 跳转、向量搜索和大规模强杀矩阵仍属于 Later，不是本次拒绝原因。

## 放行决定

L05–L07 的搜索 UI、索引重建、来源展示和真实多格式搜索链均已复核通过，初审 P1 已关闭。L07 审核状态可改为 `PASS`，创建 `review(L07): pass` 并在其上创建 `checkpoint-L07-pass`；Luna 可在此之后开始 L08。
