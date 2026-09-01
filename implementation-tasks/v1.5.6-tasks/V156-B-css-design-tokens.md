# V156-B · CSS 设计令牌

**状态：** `TODO`

## 前置

- V156-A 为 `DONE`；
- 设计基准：`docs/v1.5.6-maintainability-plan.md` §2.2。

## 范围

- `styles.css` 头部增加 `:root` 调色板令牌（indigo 主色系、slate 文本四级、边线/底色/danger）与圆角/间距令牌；
- 对现有硬编码 hex 做**机械等值替换**，视觉零变化；`question-bank.css` 同步；此后新页面一律引用令牌。

## 不做

- 不重构布局、不引入 CSS 框架/预处理器；
- 不改变响应式断点行为。

## 验收

- production build、响应式合同测试通过；
- 手工冒烟确认视觉零变化；
- 完成后更新 STATUS/GOAL_PROGRESS 并创建 `v1.5.6(V156-B)` 本地提交。
