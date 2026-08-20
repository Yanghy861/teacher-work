# L03 文件页面与刷新核对

## 目标与范围

L03 在 L02 的 managed 文件服务之上提供素材库、课次资料和学生资料的最小页面入口。资料仍由 Main 侧 native picker 导入，Renderer 只能通过显式 `files:*` API 操作登记 ID；文件列表支持打开、显示所在文件夹、加入当前课次、加入当前学生、软删除和恢复。

本里程碑采用“权威刷新核对”保证外部编辑后的正确性：应用启动、窗口重新获得焦点、资料页刷新、重新打开文件时读取受控对象的 size/mtime，并在需要时异步计算 SHA-256。Hash 变化会通过 `files:content-changed` 通知 Renderer，页面显示简单的内容变化提示并重新加载列表。目录 watcher、缩略图和 Markdown 编辑器不属于本里程碑。

## 数据与刷新契约

schema v4 在 `files` 增加 `mtime_ms` 与 `content_hash`。首次刷新会建立核对基线；后续只有 size/mtime 变化或缺少 Hash 时才读取文件计算 Hash。Hash 计算使用异步 stream，并且按 chunk 让出事件循环；刷新操作在 Main 侧串行化，避免同一文件出现并行元数据更新。

登记记录仍只包含受控 UUID 布局，刷新不会接受 Renderer 路径。对象缺失返回稳定的 `FILE_OBJECT_MISSING`，不会把任意本地路径放入 Renderer 响应；导入、复制和正式写入继续沿用 L02 的临时文件加原子重命名规则。

## 页面流程

- “素材库”和“学生”页显示可用资料及已删除资料，提供导入、刷新、打开、显示位置、恢复和关联操作。
- 课程页的当前课次/当前学生资料区复用同一组件；导入后可分别生成当前课次和学生的独立副本。
- 资料卡显示来源类型、大小和“已核对/待核对”状态；刷新或 Main 事件到达后重新读取 overview。
- 页面使用简单错误提示；Watcher、缩略图、全文预览和 Markdown 编辑器记入 Later。

## 验证

自动化覆盖：

- schema v4 首次迁移、重开和失败迁移回滚；
- 首次 Hash、无变化短路、外部修改后 size/mtime/Hash 变化检测；
- `openFile` 刷新后发出 `files:content-changed`，Preload 只接收经过 runtime guard 的事件；
- 既有 L02 的导入、打开、关联副本、软删除/恢复、路径越界和 IPC 边界回归。

命令：

```text
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
```

真实 Electron UI smoke 在隔离临时工作区完成：创建一对一课程、阶段、课次和学生；通过 Windows 原生文件选择器导入 `l03-ui-source.txt`；确认资料显示“已核对”，并验证加入当前课次和加入当前学生生成独立副本。测试 fixture 与临时 workspace 已在验证后删除，未接触真实教学资料。

L03 不是 Sol 审核闸门；完成后创建 `lean(L03): file pages and refresh` 本地提交，随后进入 L04。L04 完成并提交送审元数据后必须停止等待 Sol 审核。
