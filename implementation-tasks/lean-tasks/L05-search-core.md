# L05 · 简化搜索存储、Normalizer 与查询服务

**前置：** L04 Sol `PASS`、T05/T08 ADR。
**结果：** 文件名、节点标题、note 和已解析正文可以用统一 SearchService 搜索。

## 最小范围

- 保留可删除重建的 `search.db` 与 FTS5 trigram；只建立必要的 document/chunk 表。
- 在 `files` 或极小 search state 中保存 `indexed_hash` 与 `pending/indexed/no_text/parse_failed`；不建立持久 job/优先级系统。
- 实现 T05 已验证的 SearchNormalizer、两字及以下简单 fallback、文件名/标题独立匹配；不启用复杂 TokenExtractor，除非最小回归确实需要。
- SearchService 支持全局和当前课程范围，返回标题、路径、原文片段与位置。
- 不要求跨两个数据库的原子事务；状态不一致时按文件删除旧索引并重做。

## 验证

- 覆盖代表性中文、英文/数字和数学查询，特殊字符不造成 FTS 错误。
- 同一 Hash 重建不产生重复 chunk；新 Hash 替换旧正文。
- 运行相关测试、typecheck、lint。
