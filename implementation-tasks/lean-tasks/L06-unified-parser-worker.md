# L06 · 统一文档解析与单 Worker 索引

**前置：** L05、T04/T08 ADR。
**结果：** TXT/MD/PDF/DOCX/PPTX/XLSX 可在后台顺序解析并写入搜索库。

## 最小范围

- 使用仓库自有 DocumentParser 契约和已固定的 `officeparser@7.5.1`；TXT/MD 可用轻量自有解析。
- 一个 `worker_thread` 顺序执行 Hash/解析即可；Main 只排队和接收结果。
- 应用启动时扫描 `indexed_hash` 不一致/未处理文件并重建内存队列；崩溃后允许当前文件从头重做。
- 保留 `indexed/no_text/parse_failed`，记录 slide/page/heading/sheet 等库实际提供的位置。
- 不建立 Worker Pool、优先级、持久 job、版本化通用消息框架或精确取消。

## 验证

- 各格式一个小 fixture + 现有真实样本的代表性 smoke；无需分别达到旧 T27–T30 的独立门槛。
- 一个损坏文件不阻塞后续文件；解析过程中普通 IPC 仍可响应。
- 运行相关测试、typecheck、lint；影响构建时运行 build。
