# L05 搜索核心

L05 建立可删除重建的 `search/search.db`，包含文档、课程范围、chunk 和 SQLite FTS5 trigram 表。业务真相仍在 `data/workspace.db`；managed 文件的 `indexed_hash` 与 `index_status`（`pending`、`indexed`、`no_text`、`parse_failed`）保存在 `files` 表。

`SearchNormalizer` 版本为 1，统一处理 NFKC、大小写、空白和常见数学 Unicode；索引保留原文，查询结果返回原文片段与位置。三字符及以上查询走安全的 FTS phrase，单字/双字查询走受控 `LIKE` fallback；文件名和节点标题是独立匹配来源，不混入正文 FTS 结果。

`SearchService` 当前提供文件、节点、note 和解析 chunk 的幂等替换、删除、索引状态读取、全局搜索与课程/阶段/课次范围搜索。文件路径始终由受控 UUID 对象目录推导，不接受外部路径参数。L06 再接入统一 Parser 和顺序 Worker；L07 再提供 UI、刷新重建和阶段验收。

## 已知限制 / Later

- L05 不解析 Office/PDF，不建立持久任务队列；解析与顺序 Worker 属于 L06。
- 不使用 OCR、向量库或复杂 tokenizer；复杂公式 tokenization 仍按 ADR-002 留在 Later。
- `search.db` 不与 `workspace.db` 做跨库原子事务；任一侧不一致时按文件 Hash 重做索引。
