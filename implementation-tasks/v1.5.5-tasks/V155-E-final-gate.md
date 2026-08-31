# V155-E · V1.5.5 最终回归与版本验收

**状态：** `TODO`

## 前置

- V155-A–V155-D 均为 `DONE`。

## 验收

- 运行全量测试、typecheck、lint、production build 和 `git diff --check`；
- 使用隔离 Windows 工作区冒烟：素材树拖拽与右键菜单不回归；AI 修改两步流（方案→确认→生成→发布）的结构化范围还原正常；旧笔记打开回退标记解析正常；导入大文件验证解析队列不因超时停摆；
- 重启后确认结构化 `modification` 元数据持久、课件版本发布编号正确（软删场景不重号）；
- 检查 SQLite integrity 与既有安全边界（Renderer 隔离、IPC 白名单、Key 不落盘）无回归；
- 验收记录写入 `docs/v1.5.5-acceptance.md`（含 O(全表) 接受决定），更新状态并创建 `v1.5.5(V155-E)` 本地提交；产品负责人完成最终体验确认后创建 `checkpoint-V1.5.5-pass`；不运行 portable/installer，不自动 push。
