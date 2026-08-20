# T32 · Phase 2 搜索验收闸门

**前置：** T21–T31 全部 DONE。  
**目标：** 用真实中文数学资料证明“找资料”可靠、可恢复且不会卡死主界面。

## 实现范围

- 执行并记录真实语料验收：固定 11 类查询、文件名/标题/note、课程范围、学生范围；
- 验证 PPT slide、PDF page、DOCX heading/片段、MD heading、XLSX sheet-cell 位置；
- 以大量文件做首次索引、部分搜索、强杀、重启、search.db 删除重建；
- 用 Office/WPS 连续保存验证 dirty/debounce/stability/hash/coalescing 全链；
- 测量 Main 事件循环/Renderer 响应、索引吞吐、失败率与峰值内存；阈值依据 Spike/硬件记录，不伪造通用数字；
- 审计 no_text/parse_failed/missing/stale 的数据库状态和用户文案；
- 只修复 Phase 2 缺陷，形成 `docs/phase2-acceptance.md`。

## 不做

不加入语义搜索、OCR、AI 查询改写或新格式。

## 验收

- 原规格 Phase 2 场景及测试 10–12、17、19–24 全部有自动或明确人工证据；
- typecheck、lint、完整测试、production build 通过；
- 真实资料可在索引未完成时搜索已就绪内容；
- 任一数据损伤、主进程长时间假死或恢复失败则标 `BLOCKED`。

