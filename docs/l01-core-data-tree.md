# L01 核心数据、课程学生与基础树 UI

## 实现范围

L01 在 T02 的工作区和 SQLite 迁移基础上增加 schema v2。生产实现只覆盖核心数据，不提前创建 L02 的 `files`/managed 文件能力：

- `nodes` 是受约束的三层树：`course → period → lesson`；课程保存 `class` 或 `one_to_one` 模式。
- `students` 保存学生实体，`course_students` 保存课程—学生多对多关系。
- `notes` 保存学生普通 Markdown 记录，可选关联课次；记录是新增数据，不修改原资料。
- 所有创建、重命名、移动、排序、软删除、恢复、关联和记录写入均在 Main 侧使用 SQLite transaction。
- 节点 ID 和学生/记录 ID 使用 `crypto.randomUUID()`；测试通过注入 ID 工厂保持可重复性。

## NodeService 契约

`src/main/data/node-service.ts` 提供：

- `createCourse`、`createPeriod`、`createLesson` / 通用 `createNode`
- `getNode`、`listNodes`
- `renameNode`、`moveNode`、`reorderNode`
- `softDeleteNode`、`restoreNode`

移动会校验父级类型和整条父级链，目标不能是自身或自己的子树；软删除/恢复按整个子树处理，因此恢复后子节点关系和排序仍在。课程可拥有多个彼此独立的阶段，阶段之间不要求连续年份。

`src/main/data/core-data-service.ts` 提供学生创建/关联和普通记录；解除关系使用关系表硬删除，符合 L01 约定，不把关系本身放入节点回收站。

## Renderer/Main 边界

Renderer 只使用 Preload 暴露的 `core` 类型化方法。新增 IPC 是显式白名单：读取 overview、创建三类节点、创建学生/记录，以及节点重命名、移动、排序、软删除和恢复。请求运行时拒绝额外字段，响应在 Preload 再经过 schema guard；Renderer 没有 SQLite、Node 或文件系统导入。

基础 UI 是按钮、表单和列表：在“我的课程”中可创建课程、阶段、课次、把学生加入课程并保存普通记录；拖拽、完整键盘等价操作和大树优化按 Lean 决策留到 Later。

## 验证

自动化：

```text
npm test                 # 10 files / 24 tests
npm run typecheck        # passed
npm run lint             # passed
npm run build            # Main / Preload / Renderer passed
```

`tests/core-data.test.ts` 覆盖嵌套移动保留子节点、循环移动拒绝、节点子树软删除/恢复、不连续一对一阶段、课程—学生关联、普通记录、重命名和排序。`tests/core-ipc.test.ts` 覆盖核心 channel 白名单、完整创建/读取路径和带 SQL 字段的额外 payload 拒绝。

真实 UI smoke 在隔离的系统临时工作区完成：

```text
课程：L01 UI smoke course（one_to_one）
阶段：2026 Spring Period
课次：Fractions Lesson
学生：Student One
记录：UI smoke note: lesson completed.
```

Electron 页面即时显示课程树、阶段/课次和学生记录；关闭应用后只读查询同一临时 `workspace.db`，确认上述节点、课程—学生 link 和 note 均存在。将 smoke 工作区误放在仓库/安装目录的第一次启动被路径边界拒绝，改到系统临时目录后通过；未写入真实教学资料。

## 已知限制 / Later

L01 只提供基础列表和按钮操作；managed 文件导入、素材副本、文件页面和刷新属于 L02/L03。节点关系没有拖拽入口，删除/恢复操作暂未放入 UI 菜单，但 Main Service 和 IPC 契约已具备；这些都不影响本里程碑要求的创建流程和数据安全边界。
