# L11 备份与恢复

L11 在 Main 侧提供空闲状态的完整工作区备份与恢复：

- 备份前由 `WorkspaceActivityGate` 拒绝新的业务 IPC，等待正在进行的刷新完成，并暂停顺序索引 Worker；
- `workspace.db` 使用 `better-sqlite3` 的 SQLite backup API，managed 对象按登记的 `fileId` 复制，并保存大小、mtime、mode 等必要元数据；
- 备份包只包含 `workspace.db`、`files/objects/**/content` 和 `backup_manifest.json`，不包含 `search.db`、cache、日志、API Key/safeStorage 密文、外部原始资料、依赖或构建产物；
- 所有内容先写入 staging 目录，manifest 和文件校验完成后再原子发布；
- 恢复只接受当前工作区之外的新空目录，先在 restore staging 中复制、打开并校验 SQLite，再重建搜索索引，最后原子发布；失败会清理 staging，不修改当前工作区，也不发布半成品；
- 恢复后不会恢复 API Key，设置页提示老师重新配置 Key。

当前不实现增量、云端、加密、并发变化重试、复杂孤儿修复或恶意压缩包攻防矩阵。
