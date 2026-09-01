# V155-E · V1.5.5 最终回归与版本验收

**状态：** `IN_PROGRESS`（自动门与隔离冒烟已通过，待产品负责人最终确认）

## 前置

- V155-A–V155-D 均为 `DONE`。

## 完成记录（2026-08-31，自动门部分）

- 全量 59 files / 238 tests passed、1 skipped；typecheck、lint、production build、`git diff --check` 通过；
- 隔离 Windows 启动 smoke 通过（独立 app-data 与 user-data-dir，workspace.db/search.db 正常创建，冒烟后已清理）；
- 验收记录写入 `docs/v1.5.5-acceptance.md`（含 O(全表) 与"不做 v16"两个已接受设计）。

## 验收

- 使用真实窗口确认：旧修改节点还原正常；AI 修改两步流发布编号连续；素材库与搜索正常（见验收文档"待产品负责人最终确认"4 点）；
- 产品负责人确认后创建最终确认提交与 `checkpoint-V1.5.5-pass`；不运行 portable/installer，不自动 push。
