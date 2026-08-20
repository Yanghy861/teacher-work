# T25 · SearchService：统一索引与查询 API

**前置：** T24、T10、T13、T17。  
**目标：** 建立 UI 和未来 AI 共用的唯一搜索入口。

## 实现范围

- 实现 `indexFile/removeFromIndex/search/rebuildIndex/reportIndexStatus`；
- `search({query, scopeNodeId?, fileTypes?, limit?})` 支持全局、课程子树、当前课和学生相关课程范围；scope 解析复用 NodeService/LinkService；
- 同时索引 nodes.title、note.body_md、文件名和解析 chunks；
- 结果统一返回 source type/id、文件/节点标题、所属树路径、原文 snippet、position、content_hash、状态与可执行 open target ID；
- ranking 明确区分标题/文件名/正文，不在 React 组件中拼 SQL 或查询语法；
- pending/stale 文件可返回元数据命中但不得声称正文已最新；missing 文件保留来源并清楚标记；
- 所有 limit、scope、file type 和 query 输入做运行时校验。

## 不做

语义搜索、自动 AI 改写查询、Office 精确跳转、搜索页面样式。

## 验收

- 全局和范围搜索不会越界返回无关树；
- 文件名、节点标题、note、MD/TXT 正文都有结果与正确路径；
- snippet/position/content_hash 与实际索引文档一致；
- 同一 API 可由 IPC 和 Main 内部 AI 调用，不复制查询逻辑。

