# V156-E · V1.5.6 最终回归与版本验收

**状态：** `TODO`

## 前置

- V156-A–V156-D 均为 `DONE`。

## 验收

- 运行全量测试、typecheck、lint、production build 和 `git diff --check`；
- `test:coverage` 基线数字与字符串/静态渲染测试清单记入 `docs/v1.5.6-acceptance.md`；
- 使用隔离 Windows 工作区冒烟：快速建课双入口、课程页、教学内容工作台、素材库、题库与搜索不回归；令牌替换后整体视觉与响应式行为无变化；单次变更仅触发单次 overview 共享重拉；
- 验收记录写入 `docs/v1.5.6-acceptance.md`，更新状态并创建 `v1.5.6(V156-E)` 本地提交；产品负责人完成最终体验确认后创建 `checkpoint-V1.5.6-pass`；不运行 portable/installer，不自动 push。
