# V154-B · V1.5.4 最终回归与体验验收

**状态：** `IN_PROGRESS`

## 前置

- V154-A 为 `DONE`；自动质量门与隔离 Electron 启动 smoke 已通过，待产品负责人完成真实窗口体验确认。

## 验收

- 运行全量测试、typecheck、lint、production build 和 `git diff --check`；
- 使用隔离 Windows 工作区验证展开/收起、就地新建、文件拖拽、文件夹同级/跨级拖拽、右键菜单与重启保持；
- 检查 SQLite integrity、目录无循环、managed 文件内容与物理路径未变化；
- 更新验收记录与状态，创建 `v1.5.4(V154-B)` 本地提交；不运行 portable/installer，不自动 push。
