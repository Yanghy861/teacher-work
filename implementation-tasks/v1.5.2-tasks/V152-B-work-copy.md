# V152-B · 当前工作副本

**前置：** V152-A `DONE`。

## 范围

- 当前 lesson 的 AI 备课工作区具备显式"保存当前进度"：保存工作副本，不改变正式课件与已确认成果；
- 重新进入课次时优先恢复最近未发布工作副本，并明确提示"未成为正式课件"；
- 有未保存编辑离开工作区时给出确认，防误丢；
- 优先复用 notes 的 draft 生命周期与 ai_metadata_json，不新增 schema、migration、Service 或 IPC；若现有白名单能力不足，停止并请产品负责人重新确认范围。

## 不做

- AI 方案确认流、新旧对比（V152-C）；时间线与版本发布（V152-D）。

## 验证

- 保存/恢复/离开确认/未发布提示的自动化覆盖（含 fake provider）；
- 相关测试、typecheck、lint、按风险 build、`git diff --check`；隔离 UI smoke 按风险补充。
