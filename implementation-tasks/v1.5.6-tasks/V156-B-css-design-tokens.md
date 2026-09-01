# V156-B · CSS 设计令牌

**状态：** `DONE`（2026-09-01；门禁与产物见下）

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

## 完成记录（2026-09-01）

- `styles.css` 头部新增令牌块（14 个令牌）：indigo 主色系 4 色、slate 文本四级、边线 `--color-border`、底色 `--color-page-bg`、danger 双色、圆角 `--radius-md: 8px` / `--radius-lg: 10px`；原有 `:root` 基础块保持不变。
- 机械等值替换：`styles.css` 291 行、`question-bank.css` 31 处；替换后令牌目标 hex 在两文件非定义区残留为 0；`border-radius: 8px/10px` 全值替换各 17/18 处，与替换前计数一致，多值半径（9px 组合、50%、0）未触碰。
- 等值性证明：替换为逐字符串精确替换（var 引用值即令牌定义的原 hex），程序校验 14 个令牌引用全部在 `:root` 定义集合内；production bundle 中令牌定义保留、`var()` 全部可解析（custom properties 为文档级全局继承，与 bundle 段落顺序无关）。
- 视觉冒烟说明：静态等值已由上述校验证明；真实窗口视觉走查按 2026-08-31 合并验收裁决并入产品负责人的 V1.5.5+V1.5.6 一次性行走验收。
- 门禁：全量测试 60 文件 / 244 通过 / 1 跳过（含 responsive-layout、question-bank-ui、v1.5-teaching-content-ui、quick-course-wizard-ui、v1.2-course-ui 五个 CSS 合同测试）；typecheck 0 错误；lint 通过；`git diff --check` 干净；production build 通过。
