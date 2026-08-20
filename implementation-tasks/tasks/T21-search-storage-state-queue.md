# T21 · search.db、索引状态与持久队列数据层

**前置：** T20、T05、T08。  
**目标：** 建立“搜索可删、任务可恢复”的持久化基础，暂不实现具体解析器和查询 UI。

## 实现范围

- 独立连接 `search/search.db`，建立可重建的 search schema/version 管理；
- 建立 `search_documents`、`search_chunks` 的格式无关字段，保存 source、hash、ordinal、position、heading、原始展示文本；
- 在 `workspace.db` 建立最小 index state/job 持久层，状态为 pending/processing/indexed/no_text/parse_failed/stale；
- 定义状态迁移：新增→pending，源变更→stale/pending，启动时 processing→pending，单项失败不阻塞队列；
- 提供按状态统计和逐文件诊断查询；普通 UI 所需统计不能只存在内存；
- 设计 search.db 被删除/损坏后的检测与队列重建入口：业务 files/nodes 不得受影响；
- 对两个数据库的非原子边界使用幂等写和可恢复顺序，不假装跨库事务。

## 不做

不选择新 tokenizer（服从 T05/T08）、不解析文件、不创建完整 SearchService/UI。

## 验收

- 状态机非法跳转被拒绝或明确归一化；
- 模拟进程退出后 processing 重新进入 pending，indexed 不被无故重做；
- 删除 search.db 后 workspace.db、files、nodes 完全不变，并可生成全量 pending 计划；
- 进度统计在数据库重开后保持一致。

