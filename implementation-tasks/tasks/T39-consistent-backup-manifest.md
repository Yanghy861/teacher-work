# T39 · SQLite 一致性备份与 manifest

**前置：** T38、T15。  
**目标：** 创建可验证的完整工作区备份，不复制不一致数据库，也不携带派生数据或秘密。

## 实现范围

- BackupService 使用 SQLite backup API/等价一致性快照生成 workspace.db，禁止在活跃写入时直接复制数据库文件；
- 备份包含快照数据库和所有已登记 managed 文件：课程/课次、学生附件、素材、AI notes、普通 settings/prompt；
- 明确排除 external 原件、search.db、cache、日志和所有 API Key/安全存储密文；
- 生成 `backup_manifest.json`，至少含 backupVersion、schemaVersion、workspaceId、createdAt；可增加安全的文件计数/总大小；
- 使用临时 staging + 完成后原子发布备份包；中断/磁盘满不留下“成功”包；
- 协调备份期间 managed 文件变化：采用短暂一致性清单锁或变化检测/重试，避免数据库记录与文件版本明显错配；
- 提供进度、取消和安全错误，不做逐文件 SHA-256 强制全量清单。

## 不做

可选密码保护、增量备份、云备份、external 原件备份。

## 验收

- 在并发数据库写入测试中快照可打开且通过 SQLite integrity check；
- 包内路径和内容严格符合白名单，覆盖原规格测试 27、28 的创建部分；
- 中断、磁盘满、文件变化、不可读 managed 文件都有确定失败/重试行为；
- 备份产物中全文搜索不到测试 Key，且不存在 search/cache。

