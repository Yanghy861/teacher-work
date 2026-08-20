# L02 受控文件、素材副本与安全打开

## 目标与范围

L02 在 L01 的课程树、课次和学生实体之上加入最小 managed 文件能力：文件从 Main 侧的系统选择器导入工作区，素材可以复制到课次或学生，正式对象可打开、在文件夹中显示、软删除和恢复。文件的物理位置不由课程标题、阶段标题或课次标题拼接，因此树节点重命名/移动不会移动文件。

本里程碑不实现 external roots、后台目录扫描、文件去重、精确断点续传、细粒度复制进度或取消。文件页面和刷新核对属于 L03。

## 数据与物理布局

schema v3 新增：

- `files`：`id`、原始文件名、大小、MIME、可选 `origin_file_id`、创建/更新时间和软删除时间；
- `lesson_files`：文件与 `lesson` 的关联；
- `student_files`：文件与学生的关联。

物理对象固定为：

```text
<workspace>/files/objects/<uuid>/content
```

素材库文件是不带关联或保留原始来源的 managed 文件。复制到不同课次/学生时，每次生成新的 UUID 对象，并在 `origin_file_id` 中保留来源关系；复制后修改副本不会修改来源或其他副本。

## 写入与失败边界

导入和副本复制都先在目标对象目录写 `.content-<uuid>.tmp`，完成可读性和大小校验后在同一目录原子重命名为 `content`，最后以短 SQLite transaction 登记 `files` 和关联。复制、校验、重命名或登记失败时不会提交可用的文件记录，并清理本次对象目录；因此半成品不会被 overview 当作正式文件。

恢复只对数据库中已登记且实体仍可读的文件清除 `deleted_at`；软删除不删除对象实体。打开和显示位置先通过登记 ID 查询 active 文件，再由 Main 解析受控对象路径。

## Renderer/Main 边界

Renderer 只能调用显式的 `files:*` 白名单方法。导入通道只接受空对象，请求的源路径由 Main 内部的 native file picker 返回；打开、显示位置、删除、恢复和复制通道只接受 `fileId` 与目标 `lessonId`/`studentId`。Renderer 不能传入任意绝对路径、SQL 或对象路径。

Preload 对响应执行运行时 guard；Main 将文件服务错误映射为稳定的 `MANAGED_FILE_ERROR`，不把本地路径写入返回错误。`openPath` 和 `showItemInFolder` 只接收文件服务解析出的受控 content 路径。

## 验证

自动化覆盖：

- 导入、受控对象路径、打开和显示位置；
- 路径穿越、存在但未登记的对象 ID 和额外 Renderer 路径字段拒绝；
- 同一素材复制到两个课次及学生后，副本隔离与 `origin_file_id`；
- 软删除/恢复保留实体；
- 模拟复制失败不留下 overview 可用记录或半成品对象目录；
- schema v3 重开与迁移回滚、file IPC 白名单注册/注销和稳定错误响应。

命令：

```text
npm test
npm run typecheck
npm run lint
```

L02 不属于 Sol 审核闸门；完成后创建 `lean(L02): managed files and materials` 本地提交，不 push，随后进入 L03。
