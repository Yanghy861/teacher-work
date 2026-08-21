# L06 统一解析与顺序 Worker

L06 接入一个 Main 侧 `DocumentIndexWorker`。它维护内存队列并按文件顺序处理；启动时扫描 `files.indexed_hash`、`content_hash` 和 `index_status`，对未完成或 Hash 不一致的文件重新排队。当前任务失败后不会阻塞后续文件，崩溃或 Worker 重启允许当前文件从头重做。

Worker 线程负责受控 managed 对象的 SHA-256、TXT/MD 轻量解析以及 `officeparser@7.5.1` 的 PDF/DOCX/PPTX/XLSX 解析。Main 只读取登记的 `file_id`、推导 `files/objects/<uuid>/content`，接收纯数据结果，短事务写回 `files`，再调用 L05 `SearchService`。Renderer 没有路径、Node、Worker 或解析 API。

解析结果统一为 `indexed`、`no_text` 或 `parse_failed`，并保留 line/page/slide/sheet/heading 等位置；损坏文件保留 Hash 和失败状态，同 Hash 不会在每次焦点刷新时无限重试，显式 `enqueue` 仍可整文件重试。导入和资料刷新后的文件会进入同一顺序队列。

## 验证

- `tests/document-parser.test.ts` 覆盖 TXT/MD、Hash、line position、损坏 DOCX、队列继续、no_text、启动重扫和同 Hash 失败不重复排队。
- `npm test`、`npm run typecheck`、`npm run lint`、`npm run build` 全部通过。
- 当前 checkout 没有可提交的真实脱敏 Office 样本；真实 40 份样本和 Electron parser smoke 的证据仍来自 T04/T08，L06 不伪造新的真实样本结论。

## Later

- 不建立 Worker Pool、持久 job、优先级、精确取消或断点续传。
- packaged Electron 中 PDF.js worker 资源的一种最终交付方式留给 L12；L06 保持 `officeparser` 运行时依赖和固定 PDF.js override。
