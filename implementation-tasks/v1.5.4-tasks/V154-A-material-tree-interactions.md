# V154-A · 素材库树交互与安全移动

**状态：** `DONE`

## 范围

- 扩展现有 `ReorderMaterialFolderRequest`，加入目标 `parentId`；
- MaterialLibraryService 支持文件夹跨父级移动、同级排序和循环防护；
- Renderer 支持目录展开/收起、树内新建、应用内右键菜单；
- 文件拖到目录/待整理，文件夹拖入目录或插入同级前后；
- 补充 Service、IPC 与 UI 契约测试。

## 不做

- 不新增 schema/migration、Service 或 IPC 通道；
- 不做外部资料跨页拖拽、Windows 文件拖放、多选批量、物理文件移动；
- 不改写 V1532-A–D 历史验收记录。

## 验收

- 相关测试、typecheck、lint、production build、`git diff --check`；
- 文件夹循环、非法目标与课程/学生副本隔离继续受 Main 防护；
- 完成后更新 STATUS/GOAL_PROGRESS 并创建 `v1.5.4(V154-A)` 本地提交。
