# V156-E · V1.5.6 最终回归与版本验收

**状态：** `IN_PROGRESS`（2026-09-01；自动门与隔离冒烟已通过并记录于 `docs/v1.5.6-acceptance.md`，按 2026-08-31 裁决与 V1.5.5 合并验收，待产品负责人最终确认）

## 前置

- V156-A–V156-D 均为 `DONE`。

## 验收

- 运行全量测试、typecheck、lint、production build 和 `git diff --check`；
- `test:coverage` 基线数字与字符串/静态渲染测试清单记入 `docs/v1.5.6-acceptance.md`；
- 使用隔离 Windows 工作区冒烟：快速建课双入口、课程页、教学内容工作台、素材库、题库与搜索不回归；令牌替换后整体视觉与响应式行为无变化；单次变更仅触发单次 overview 共享重拉；
- 验收记录写入 `docs/v1.5.6-acceptance.md`，更新状态并创建 `v1.5.6(V156-E)` 本地提交；产品负责人完成最终体验确认后创建 `checkpoint-V1.5.6-pass`；不运行 portable/installer，不自动 push。

## 完成记录（2026-09-01，自动门部分）

- 自动门：全量 63 files / 265 passed / 1 skipped、typecheck 0 错误、lint 通过、production build 通过、`git diff --check` 干净；未运行 portable/installer。
- 覆盖率：V156-A 首记基线 73.28%（60 files / 245 tests）；V156-E 终值 54.32%（63 files / 265 tests）。两数字范围不同不可直接比较——V156-D 静态渲染测试导入 App 后整个页面树进入报告（分母扩大），逐文件覆盖率一致或更高；口径说明与逐文件对比已完整记入 `docs/v1.5.6-acceptance.md`。
- 隔离冒烟：独立 `TEACHER_WORKBENCH_L01_SMOKE_APP_DATA` + `--user-data-dir` 启动 production Electron，主窗口进程存活（两次采样），`workspace.db` / `search.db`（含 WAL/SHM）创建成功，stderr 无错误；进程与临时目录已清理。
- 行为不变性：等值替换/文案原值/合并语义均有单测或逐字节对比证明；两处已知更优差异（draft-panel 随 onContentChanged 感知、runAction 通知不再被刷新失败吞掉）已在验收文档记录在案。
- 待办：产品负责人与 V1.5.5 一次走查（清单见验收文档"待最终确认"节）；通过后依版本顺序创建两个 checkpoint。
