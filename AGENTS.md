# 教师工作台 Lean V1：实现代理约束

本仓库的产品主规格是 `教师工作台_V1_R3_产品与技术实施规格.md`。T01–T08 是已完成的历史风险验证阶段；T08 通过 Sol 审核后，唯一有效的后续实施链为 `implementation-tasks/lean-tasks/` 中的 L01–L12。旧 `tasks/T09-*` 至 `tasks/T42-*` 已退役，只保留历史参考，不得继续执行。

当用户指定当前实现任务时：

1. 先阅读 `implementation-tasks/GLOBAL_CONSTRAINTS.md`、`implementation-tasks/LEAN_V1_DECISIONS.md`、`implementation-tasks/VERSION_CONTROL.md`、当前 Lxx 任务文件及其明确列出的前置产物；
2. 只完成当前任务，不提前实现后续任务；
3. T08、L04、L07、L10、L12 是审核闸门，前一审核点不是 `PASS` 时，Luna 不得开始下一段，也不得自行把审核状态改为 `PASS`；
4. 解析、搜索和文件刷新应服从 `docs/spike-results.md` 的有效证据，但生产实现范围以 `LEAN_V1_DECISIONS.md` 为准；
5. 默认选择能完成三条核心用户流程的最简单可靠实现。实时监听、持久化任务队列、精确断点续传、并发 Worker 池、复杂状态机、拖拽和大规模矩阵不是默认要求；实现代价明显偏高且不影响核心流程时，采用简单替代或记入 Later，不得因此把任务标为 `BLOCKED`；
6. 普通里程碑运行相关测试、typecheck 与 lint；只有 L04、L07、L10、L12 运行全量测试和 production build；
7. 完成后更新 `STATUS.md` 与 `GOAL_PROGRESS.md`，并按版本控制协议创建当前里程碑的本地提交；
8. 只有核心 happy path 无法实现、存在资料损坏/路径越界/Key 泄漏风险、缺少必需权限或凭据、或需要产品负责人改变方向时，才可标为 `BLOCKED`。

Git 硬规则：只允许按 `implementation-tasks/VERSION_CONTROL.md` 创建可审计的本地里程碑提交、审核提交和通过标签；不得自动 push、添加远程、提交秘密或真实教学资料，不得用破坏性 Git 命令丢弃现有成果。

不可放松的安全边界：Local-first；Renderer 不直接访问 SQLite、Node、任意文件系统或秘密；managed 文件路径与课程树解耦；正式 managed 文件写入使用临时文件加原子重命名；长解析、Hash 和批量索引不得阻塞 Electron Main；API Key 不得明文落盘、写日志或进入备份；AI 输出只保存为可编辑草稿，绝不覆盖老师原资料。
