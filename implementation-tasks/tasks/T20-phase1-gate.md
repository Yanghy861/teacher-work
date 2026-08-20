# T20 · Phase 1 集成与验收闸门

**前置：** T09–T19 全部 DONE。  
**目标：** 证明“管资料”达到可自用下限；未通过不得开始全文搜索。

## 实现范围

- 增加最小回收站视图，能列出并恢复 nodes/files/notes，默认不做永久删除；
- 把原规格 Phase 1 场景写成自动集成测试 + Windows 人工验收脚本；
- 场景必须包含：张三一对一、两个不连续阶段、多节课、素材 PPT 加入 A/B 班、PowerPoint/WPS 修改 A 班、副本完全隔离、删除课次后恢复；
- 增加故障注入：复制中断、数据库回滚、external missing/root 重定位、非法路径、watcher 事件风暴；
- 验证移动/重命名课程树不改变任何 managed 物理路径；
- 审计 Renderer/Main 边界与大目录/大文件操作响应性；
- 只修复 Phase 1 验收发现的缺陷，形成 `docs/phase1-acceptance.md`。

## 不做

不提前创建 search.db、parser、AI、备份，不美化非阻塞页面。

## 验收

- 原规格 Phase 1 九步场景及测试 1–9、18、22 的 Phase 1 部分全部有通过证据；
- 所有自动测试、typecheck、lint、production build 通过；
- 人工真机结果记录 Office/WPS 版本和实际文件；
- 任一隔离/原子性/恢复问题未解决则标 `BLOCKED`。

