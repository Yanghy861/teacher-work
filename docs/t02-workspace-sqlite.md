# T02 工作区与 SQLite 基础

## 工作区边界

`WorkspacePaths` 将用户数据固定在选定工作区下，当前只建立目录和路径约定，不创建业务表：

```text
<workspace>/
├── data/workspace.db
├── files/objects/
├── search/search.db
├── cache/
└── backups/
```

`initializeWorkspace` 接受用户明确选择的绝对路径和应用安装目录，并拒绝安装目录本身及其任意子目录；`initializeDefaultWorkspace` 接受应用数据目录和应用安装目录，并拒绝把默认候选路径放在安装目录内。初始化会逐级创建目录并做写入探针，遇到文件占位、权限错误或初始化失败时抛出带稳定错误码的 `WorkspacePathError`，不会静默回退到程序目录。

## SQLite 连接与迁移

`WorkspaceDatabase` 是 Main 侧的连接封装，统一设置：

- `journal_mode = WAL`
- `synchronous = NORMAL`
- `foreign_keys = ON`
- `busy_timeout = 5000`

连接对象提供显式 `close()` 生命周期和类型化的 `backup(destinationPath)` seam，当前任务不实现备份流程。迁移 runner 先确保 `schema_migrations` 存在，再按严格递增版本逐个使用 SQLite transaction 执行；迁移函数抛错时，其 DDL 与版本记录一起回滚。

T02 阶段的唯一迁移创建 `workspace_meta`。初始化完成后写入并复读 `workspaceId` 与 `schemaVersion`；工作区重开会复用原 ID，不会重复应用已记录的迁移。L01 的 schema v2 在同一 runner 中追加 `nodes`、学生关系和 `notes` 表；L02 的 schema v3 再追加受控 managed 文件及课次/学生关联表。`search`、`ai_runs` 等仍留给后续里程碑。

## 验证

```text
npm run typecheck
npm run lint
npm test
npm run build
```

`tests/workspace-foundation.test.ts` 只在系统临时目录创建测试工作区，覆盖重复打开、失败迁移事务回滚、替换 `out` 后身份数据保留，以及非法/应用内/非目录/不可写路径拒绝。
