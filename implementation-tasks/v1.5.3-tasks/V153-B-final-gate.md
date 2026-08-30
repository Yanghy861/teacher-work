# V153-B · V1.5.3 全量回归与版本验收

**前置：** V153-A `DONE`。

- 全量 `npm test`、typecheck、lint、production build、`git diff --check`；不运行 portable/installer；
- 代表性隔离 Windows 流程：真实课件 → AI 修改 → 方案确认 → 对比视图切换 → 保存为新版本 → 课件区单当前版+历史折叠核验；新建备课路径回归；V1.5.2 既有能力（工作副本恢复/离开确认）无回归；
- 验收报告 `docs/v1.5.3-acceptance.md`（匿名表述）；
- 中继式 AI 验收 + 产品负责人最终体验确认后创建 `checkpoint-V1.5.3-pass`；不自动 push。
