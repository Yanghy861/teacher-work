# V155-B · 素材库 IPC 测试与 overview 查询修正

**状态：** `TODO`

## 前置

- V155-A 为 `DONE`；
- 设计基准：`docs/v1.5.5-hardening-plan.md` §2.2。

## 范围

- 新增 `tests/material-library-ipc.test.ts`（复制 `tests/file-ipc.test.ts` 样板：`FakeIpcMain` + `TestLogger` + `initializeWorkspace` 真实临时工作区 + 真实服务栈）：
  - 注册通道集合恰为 `MATERIAL_LIBRARY_CHANNELS`（8 项），unregister 精确移除同一集合；
  - 额外键、负数 `sortOrder`、缺键请求在触碰服务层前被拒（`INVALID_PAYLOAD`）；
  - 未知通道返回 `UNKNOWN_CHANNEL`；
  - 错误映射：`reorderFolder` 拖入自身后代、`deleteFolder` 非空、`moveFile` 课程/学生副本、`saveExternal` 未登记根；
  - 内部错误返回 `INTERNAL_ERROR` 通用文案、响应无栈、`logger.error` 记录 channel。
- `src/main/files/material-library-service.ts`：`getOverview` 条目查询去掉恒真 `WHERE` 与冗余 `JOIN`，简化为 `SELECT file_id, folder_id, created_at FROM material_folder_items ORDER BY created_at, file_id`（行为零变化）；`files` 查询补类型化行接口。
- `tests/material-library-service.test.ts` 补行为钉死测试：软删除独立文件仍出现在 `overview.files`（`deletedAt` 非空）且条目保留；已挂课/学生文件的条目绝不出现在 `overview.items`。

## 不做

- 不给 overview 增加删除过滤（"已移除"文件保留在 overview 是 V1.5.3.1 有意行为，由渲染层分视图）；
- 不改素材库任何 IPC 通道、Service 行为与 UI。

## 验收

- 新 IPC 测试、service 钉死测试、typecheck、lint 通过；
- 完成后更新 STATUS/GOAL_PROGRESS 并创建 `v1.5.5(V155-B)` 本地提交。
