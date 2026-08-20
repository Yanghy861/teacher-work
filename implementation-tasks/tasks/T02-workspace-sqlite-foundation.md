# T02 · 工作区路径与 SQLite 基础

**前置：** T01。  
**目标：** 建立与程序安装目录彻底分离、可配置且可测试的用户工作区，以及可靠的 Migration 基础。

## 实现范围

- 实现 `WorkspacePaths`（或等价模块），集中解析 `data/workspace.db`、`files/objects`、`search`、`cache`、`backups`；
- 首次使用可以选择/创建工作区；默认路径不能落在应用安装目录内；
- 初始化目录时处理重复启动、权限失败和路径不可写，错误必须可理解；
- 建立 `workspace.db` 连接层、`schema_migrations` 与幂等 Migration runner；
- 生成并持久化 `workspaceId`、`schemaVersion` 等最小工作区身份信息，为后续备份使用；
- 明确 SQLite pragma/连接生命周期，并为将来一致性 backup API 留出封装点；
- 所有测试使用临时工作区，不写开发者真实用户目录。

## 不做

不创建 nodes/files/search/ai_runs 等业务表，不实现备份或工作区覆盖恢复。

## 验收

- 新目录可初始化，重复打开不会重复执行已完成 Migration；
- 模拟 Migration 失败时事务回滚，schema 版本不被错误推进；
- 应用构建目录删除/替换后，测试工作区数据仍存在；
- 非法/不可写路径返回明确错误，不静默切换到程序目录。

