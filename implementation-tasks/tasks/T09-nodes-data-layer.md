# T09 · nodes Migration 与 Repository

**前置：** T08。  
**目标：** 建立极简、可迁移、可测试的树节点持久化层，不混入 UI 和 IPC。

## 实现范围

- 新 Migration 创建 `nodes`：id、parent_id、kind、title、body_md、sort_order、meta_json、created_at、updated_at、deleted_at；
- kind 仅允许 `folder/course/period/lesson/student/note/reusable_unit`；使用 UUIDv7 或有序 UUID 文本；
- 为 parent、排序、kind、软删除查询建立必要索引和约束；
- Repository 提供单条读取、子项列表、批量树读取和事务内写入原语；默认查询排除软删除；
- 对 `meta_json` 做运行时 schema 校验，但低频字段仍保留在 JSON，不擅自升格；
- 时间、空标题、非法 parent/kind、损坏 JSON 的行为必须确定且可测试。

## 不做

不实现业务级 move/delete/restore，不做 UI，不创建大量节点类型。

## 验收

- Migration 可前进、重复运行无副作用；
- Repository 测试覆盖根节点、嵌套节点、同级顺序、软删除过滤和非法数据；
- 测试数据库关闭重开后数据与顺序一致；
- Renderer 不接触 Repository 或 SQLite。

