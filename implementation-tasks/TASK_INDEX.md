# 教师工作台 V1 / V1.1 / V1.2 / V1.3 / V1.4 / V1.5 任务索引

## 历史基线（全部冻结）

- T01–T08：应用骨架、SQLite、安全 IPC 与解析/搜索/刷新/恢复 Spike 已完成。
- 旧 `tasks/T09-*` 至 `tasks/T42-*` 已退役，只用于历史追溯，不得执行。
- L01–L12：Lean V1 已完成，最终标签 `checkpoint-L12-pass`。
- V11-01–V11-05：V1.1 外部资料、课次备课、Skill、草稿与最终门禁已完成，最终标签 `checkpoint-V1.1-pass`。
- V12-01–V12-05：V1.2 课程、学生、点名、进度和备课接入已完成，最终标签 `checkpoint-V1.2-pass`。
- V13-01–V13-05：V1.3 快速建课已完成，最终标签 `checkpoint-V1.3-pass`。
- V14-01–V14-03：V1.4 只读题库接入已完成，最终标签 `checkpoint-V1.4-pass`。

历史任务保持 `DONE`，不得因 V1.5 重新执行或改写验收状态。

## V1.5 当前唯一活动链

| 里程碑 | 前置 | 核心产物 | 验收 |
|---|---|---|---|
| [V15-01](v1.5-tasks/V15-01-teaching-content-navigation.md) | `checkpoint-V1.4-pass`、V1.5 修订冻结方案 | 教学内容目标、课程 / 学生入口、直接打开和双向返回 | 相关测试 + typecheck + lint + 风险 build |
| [V15-02](v1.5-tasks/V15-02-teaching-content-workspace-ui.md) | V15-01 | 课件 / 备课 / 草稿箱、临时课次抽屉、宽正文和沉浸阅读 | 相关回归 + build + UI smoke |
| [V15-03](v1.5-tasks/V15-03-final-gate.md) | V15-01–V15-02 | V1.5 全量回归、production build 与代表性 Windows 流程 | 最终验收 |

V15 任务必须按编号顺序执行；同一时刻最多一个里程碑为 `IN_PROGRESS`。V15-03 通过且产品负责人最终体验确认后才创建 `checkpoint-V1.5-pass`。V1.5 不运行 portable/installer packaging。

下一轮增量 V1.5.2（AI 修改工作区；本轮实施链整体记为 V1.5.1）不改变当前 V1.5 活动链，也不创建 V1.6；后续会在同一教学内容工作台上把“草稿箱”收口为“AI 备课 / 修改记录”，并补充工作副本、修改方案确认和版本发布能力。实现任务需在 V15-03 完成后另行确认。

## V1.5.2 活动链（AI 修改工作区）

基线 `checkpoint-V1.5-pass`；方案为主规格第 11 节，决策 D09–D15。

| 里程碑 | 前置 | 核心产物 | 验收 |
|---|---|---|---|
| [V152-A](v1.5.2-tasks/V152-A-terminology.md) | `checkpoint-V1.5-pass` | 课件 / AI 备课 / 修改记录三分区术语与全局入口收口 | 相关测试 + typecheck + lint + 风险 build |
| [V152-B](v1.5.2-tasks/V152-B-work-copy.md) | V152-A | 工作副本保存/恢复/未发布提示 | 相关测试 + typecheck + lint + 风险 build |
| [V152-C](v1.5.2-tasks/V152-C-improvement-flow.md) | V152-B | 参考范围 + 修改要求 + AI 方案确认 + 新旧对比 | 相关测试 + 中继式 AI 验收 + build |
| [V152-D](v1.5.2-tasks/V152-D-records-and-publish.md) | V152-C | 修改记录时间线 + 保存为新版本 | 相关测试 + UI smoke + build |
| [V152-E](v1.5.2-tasks/V152-E-final-gate.md) | V152-A–D | 全量回归 + 代表性 Windows 流程 + 分层 AI 验收 | 最终验收；确认后创建 `checkpoint-V1.5.2-pass` |

任务按编号顺序执行；同一时刻最多一个 `IN_PROGRESS`。V1.5.2 不运行 portable/installer packaging。

## V1.5.3.2 当前活动实现分支

方案：[`docs/v1.5.3.2-material-library-plan.md`](../docs/v1.5.3.2-material-library-plan.md)

该分支已进入实际实现：将“素材库”实现为老师维护的逻辑目录树；外部资料仍映射真实文件夹树，课程/学生副本继续与素材库原件隔离。

| 里程碑 | 前置 | 核心产物 | 验收 |
|---|---|---|---|
| [V1532-A](v1.5.3.2-tasks/V1532-A-material-library-model.md) | DONE | 目录模型、单父级约束、现有资料一次性整理 | 模型/迁移测试通过 |
| [V1532-B](v1.5.3.2-tasks/V1532-B-material-library-ipc.md) | DONE | 目录查询、新建、重命名、移动、删除、排序与复制流转 IPC | typecheck、lint、build 通过 |
| [V1532-C](v1.5.3.2-tasks/V1532-C-material-library-ui.md) | DONE | 逻辑目录树、文件区、明确资料流转文案 | UI 契约测试、typecheck、lint、build 通过 |
| [V1532-D](v1.5.3.2-tasks/V1532-D-final-gate.md) | IN_PROGRESS | 全量回归与最终体验确认 | 产品负责人走查后决定是否创建标签 |

## V1.5.5 已立项后续增量（正确性与健壮性加固）

方案：[`docs/v1.5.5-hardening-plan.md`](../docs/v1.5.5-hardening-plan.md)；决策 D19。基线 `checkpoint-V1.5.4-pass` 已创建；按编号顺序执行，同一时刻最多一个 `IN_PROGRESS`；不运行 portable/installer。

| 里程碑 | 前置 | 核心产物 | 验收 |
|---|---|---|---|
| [V155-A](v1.5.5-tasks/V155-A-draft-modification-scope-metadata.md) | `checkpoint-V1.5.4-pass` | AI 修改范围结构化元数据、draft-scope 纯模块、旧笔记回退 | 相关测试 + typecheck + lint |
| [V155-B](v1.5.5-tasks/V155-B-material-library-ipc-test-and-overview-fix.md) | V155-A | 素材库 IPC 测试补齐、getOverview 零行为简化与行为钉死 | 新测试 + typecheck + lint |
| [V155-C](v1.5.5-tasks/V155-C-parser-timeout-and-window-guard.md) | V155-B | 解析单作业超时、窗口导航守卫 | 相关测试 + typecheck + lint |
| [V155-D](v1.5.5-tasks/V155-D-version-counting-and-constraint-error-code.md) | V155-C | 版本计数 MAX+1、约束错误码修正 | 相关测试 + typecheck + lint |
| [V155-E](v1.5.5-tasks/V155-E-final-gate.md) | V155-A–D | 全量回归 + 隔离 Windows 冒烟 + 验收文档 | 最终验收；确认后创建 `checkpoint-V1.5.5-pass` |

## V1.5.6 已立项后续增量（可维护性技术债清理）

方案：[`docs/v1.5.6-maintainability-plan.md`](../docs/v1.5.6-maintainability-plan.md)；决策 D20。基线 `checkpoint-V1.5.5-pass`（待 V155-E 验收后创建），基线创建前任何任务不得 `IN_PROGRESS`；按编号顺序执行，同一时刻最多一个 `IN_PROGRESS`；不运行 portable/installer。

| 里程碑 | 前置 | 核心产物 | 验收 |
|---|---|---|---|
| [V156-A](v1.5.6-tasks/V156-A-shared-utils-and-coverage-baseline.md) | `checkpoint-V1.5.5-pass` | ui-utils 收敛 + 覆盖率基线 | 全量测试 + typecheck + lint |
| [V156-B](v1.5.6-tasks/V156-B-css-design-tokens.md) | V156-A | CSS 设计令牌等值替换 | build + 响应式测试 + 手工冒烟 |
| [V156-C](v1.5.6-tasks/V156-C-overview-shared-cache.md) | V156-B | overview 共享缓存与分页迁移 | 全量测试 + build |
| [V156-D](v1.5.6-tasks/V156-D-wizard-dedup-and-render-tests.md) | V156-C | 向导编排收敛 + 静态渲染测试 | v1.3 全组测试 + 新测试 |
| [V156-E](v1.5.6-tasks/V156-E-final-gate.md) | V156-A–D | 全量回归 + 隔离 Windows 冒烟 + 验收文档 | 最终验收；确认后创建 `checkpoint-V1.5.6-pass` |

## V1.6 已立项当前活动链（AI 修改逻辑重做：预算修复、流式生成与 MinerU 文档解析）

方案：[`docs/v1.6-ai-modification-rewrite-plan.md`](../docs/v1.6-ai-modification-rewrite-plan.md)；决策 D21–D26（[`V1_6_DECISIONS.md`](V1_6_DECISIONS.md)）。基线 `checkpoint-V1.5.6-pass`（已创建）；按编号顺序执行，同一时刻最多一个 `IN_PROGRESS`；不运行 portable/installer。

| 里程碑 | 前置 | 核心产物 | 验收 |
|---|---|---|---|
| [V16-A](v1.6-tasks/V16-A-gateway-budget-and-test-fix.md) | `checkpoint-V1.5.6-pass` | 测试连接结构判定、超时 120s、30,000 字 / 16,000 token 预算 | 相关测试 + typecheck + lint |
| [V16-B](v1.6-tasks/V16-B-scope-and-reference-budget.md) | V16-A | 修改对象收口应用内文件、参考 ≤10 份与超量列名提示 | 合同与预算模块测试 + typecheck + lint |
| [V16-C](v1.6-tasks/V16-C-streaming.md) | V16-B | `ai:stream-event` 推送、SSE 解析、思考进度与正文上屏、静默超时 | fake 流式 provider 测试 + build + 中继式一轮 |
| [V16-D](v1.6-tasks/V16-D-mineru-integration.md) | V16-C | migration v16、safeStorage 多槽、MinerU 设置卡与判活、解析服务与入库、右键入口 | 迁移专项 + fake HTTP + 真实文件开发验证 |
| [V16-E](v1.6-tasks/V16-E-final-gate.md) | V16-A–D | 全量回归 + 隔离 Windows 冒烟 + DeepSeek/MinerU 真实自测 + 验收文档 | 最终验收；确认后创建 `checkpoint-V1.6-pass` |

V1.6 已冻结在 `checkpoint-V1.6-pass`（2026-09-02 产品负责人最终验收）。

## V1.7 当前唯一活动链（MD 课件编辑与题库 AI 选题生成）

基线 `checkpoint-V1.6-pass`；方案 `docs/v1.7-md-editing-and-bank-integration-plan.md`，决策 D27–D32。

| 里程碑 | 前置 | 核心产物 | 验收 |
|---|---|---|---|
| [V17-A](v1.7-tasks/V17-A-contracts-and-main-support.md) | `checkpoint-V1.6-pass`、V1.7 修订冻结方案 | migration v17、files:read-text / write-version（永写新文件）、题库搜索 IPC、DraftBankPlan/dualVersion 合同、题库上下文注入与检索计划、学生版编排 | 迁移专项 + Service/合同测试 + typecheck + lint |
| [V17-B](v1.7-tasks/V17-B-widen-ai-modification-scope.md) | V17-A | AI 修改对象放宽到全部 md（外部导入 md 可改，发布产物新版本文件） | 静态渲染钉测 + 修改流回归 |
| [V17-C](v1.7-tasks/V17-C-manual-md-editor.md) | V17-A | 阅读器 md 编辑器：工具栏、行级 LaTeX 公式输入与速查、插图引用、标题字号模板、热保存、存为新版本 | 组件静态渲染 + 手工冒烟（公式/插图/版本链） |
| [V17-D](v1.7-tasks/V17-D-bank-selection-and-dual-output.md) | V17-A–C | 参考题库开关、过目步（计划/剔除/调整）、流式选题生成、学生版/教师版双输出与发布命名 | 编排中继测试（fake bank + provider）+ 静态渲染 |
| [V17-E](v1.7-tasks/V17-E-final-gate.md) | V17-A–D | 全量回归 + 隔离 Windows 冒烟 + DeepSeek 真实自测 + 验收文档 | 最终验收；确认后创建 `checkpoint-V1.7-pass` |

V17 任务必须按编号顺序执行；同一时刻最多一个里程碑为 `IN_PROGRESS`。V17-E 通过且产品负责人最终体验确认后才创建 `checkpoint-V1.7-pass`。V1.7 不运行 portable/installer；里程碑提交后 push（产品负责人已授权 GitHub 同步）。
