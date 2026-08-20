# L04 · 管资料阶段闸门

**前置：** L01–L03。
**结果：** 证明“建结构、导入资料、复制隔离、外部编辑后刷新”可以日常自用；完成后等待 Sol 审核。

## 验收

- 完成一条代表性流程：一对一课程 → 两个不连续阶段 → 课次 → 学生 → 素材导入 → 复制到两个课次 → 修改其中一份 → 返回工作台刷新 → 删除/恢复。
- 核对副本隔离、Renderer/Main 边界、临时文件写入和基本路径校验。
- 不要求 external roots、拖拽树、Watcher、磁盘满矩阵、每个边界强杀或 1000+ 节点压力测试。
- 运行完整测试、typecheck、lint、production build 和一次 Windows UI smoke；形成简短 `docs/phase1-acceptance.md`。
