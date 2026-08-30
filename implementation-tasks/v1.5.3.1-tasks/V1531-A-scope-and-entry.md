# V1531-A · 修改范围模型与两种入口

**前置：** V153-A/B 已完成；D17 与 `docs/v1.5.3.1-design.md` 已冻结。

## 范围

- 新增 Renderer-only `PrepLaunchIntent`，支持 `new / single / lesson` 及可选 targetFileId；
- 抽取当前正式版、历史版本和当前材料分类纯函数，课件区与工作台共享；
- 课件区：无课件显示“AI 新建备课”；有课件显示“✦ 修改这份”和“整课重做”；
- 工作台：顶部模式切换；左栏改为修改对象、补充参考、本课修改节点；复选框只属于补充参考；
- 显式入口不自动恢复无关最近草稿；修改记录入口继续恢复指定节点；
- 不改 AI Gateway、Draft Service、ManagedFileService、IPC 或 schema。

## 验证

- 范围分类与导航 intent 单元测试；
- UI 契约覆盖两入口、分段模式、目标单选和可选参考；
- 相关测试、typecheck、lint、production build、`git diff --check`；
- 不运行 portable/installer，不自动 push。
