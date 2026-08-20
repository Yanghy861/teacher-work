# T36 · ai_runs 与“生成讲义”最小闭环

**前置：** T35、T13。  
**目标：** 先跑通课次 → 要求 → 选资料 → 生成讲义 → 人工修改 → 保存，并做到步骤级持久化。

## 实现范围

- Migration 创建 `ai_runs`：lesson、status、current_step、request_text、state_json、时间、错误；
- 实现固定 `prepareLesson()` 状态机，不抽象通用 workflow；状态含 running/waiting_user/completed/failed/cancelled；
- 保存老师要求、已选来源、provider/model/prompt_version、ContextBuilder manifest；
- 调 AI Gateway 生成讲义草稿；收到完整有效结果后立即持久化完成步骤；
- 讲义在工作台 Markdown 编辑器中可人工修改，并保存为当前 lesson 下普通 note；不得覆盖源资料；
- 网络失败时保留已选择资料/要求；讲义已完成后后续错误不得使其丢失；
- 重开应用可恢复到上次已持久步骤。

## 不做

例题、作业、快速模式、PPT/DOCX 输出、通用 Skill/Agent。

## 验收

- 完整最小流程可在真模型或受控 fake provider 下完成；
- 生成中强杀时该步可从头重做，已完成讲义/人工编辑不丢；
- 覆盖原规格测试 13；
- 数据库故障注入不会出现 completed ai_run 却没有可读讲义 note。

