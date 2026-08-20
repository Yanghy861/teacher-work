# T38 · Phase 3 AI 备课验收闸门

**前置：** T33–T37 全部 DONE。  
**目标：** 证明 AI 备课比手工复制粘贴形成真正闭环，同时不削弱本地功能和秘密安全。

## 实现范围

- 执行完整场景：进入第十一课，填写“应用题多一点，偏难”，选择 3 份历史资料，生成并修改讲义，再生成例题和作业；
- 在每个外部调用/数据库提交边界注入失败，验证已完成步骤保存、当前步重做；
- 审计 Gateway 请求只包含老师确认且经 ContextBuilder 限额的内容；
- 审计 source manifest、hash、provider/model/prompt_version 与 note 关系；
- 检查无 Key、错误 Key、网络断开、取消、关闭/强杀和恢复 UI；
- 搜索仓库、数据库、日志、错误与测试产物，确认无测试 Key；
- 只修复 Phase 3 缺陷，形成 `docs/phase3-acceptance.md`。

## 不做

不新增 provider 数量作为闸门目标，不做 Agent、语义 RAG、PPT/DOCX 生成或快速模式。

## 验收

- 原规格 Phase 3 场景及测试 13、14、25、26 全部有通过证据；
- 无 API Key 时 Phase 1/2 功能完整可用；
- typecheck、lint、完整测试、production build 通过；
- 任一秘密泄漏、来源越界或步骤数据丢失则标 `BLOCKED`。

