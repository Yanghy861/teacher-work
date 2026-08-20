# T14 · files 数据层与安全路径解析

**前置：** T09、T08。  
**目标：** 建立真实文件记录与逻辑树位置分离的数据模型和唯一安全路径解析入口。

## 实现范围

- Migration 创建 `files`，字段覆盖 parent_node_id、name、extension、storage_mode、external_root_id、relative_path、managed_storage_key、content_hash、size、modified_at、origin_file_id、status、时间与软删除；
- 同一 Migration 可预建 `external_roots` 结构，行为留给 T17；
- FileRepository 默认过滤软删除，明确 available/missing/error；
- `StorageResolver` 仅以 file ID/managed key 或 root ID + 相对路径解析真实路径；
- managed key 必须与课程树标题无关，目标布局固定在 `files/objects/<file-uuid>/`；
- 文件名清理、扩展名、路径穿越、绝对 relative_path、符号链接/reparse point 逃逸都要校验；
- 文件正文不进入 SQLite BLOB。

## 不做

不复制/打开文件，不扫描 external root，不监听变化，不做索引。

## 验收

- 重命名/移动节点前后，同一 managed file 解析出的物理目录完全相同；
- `..`、绝对路径、跨 root、畸形 managed key 均无法逃出工作区/外部根；
- external 与 managed 的互斥字段约束有测试；
- Migration 与 Repository 测试通过。

