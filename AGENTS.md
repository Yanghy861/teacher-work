# 教师工作台 V1 / V1.1 / V1.2 / V1.3：实现代理约束

Lean V1 的 T01–T08 与 L01–L12、V1.1 的 V11-01–V11-05、V1.2 的 V12-01–V12-05 均已完成；稳定基线依次为 `checkpoint-L12-pass`、`checkpoint-V1.1-pass`、`checkpoint-V1.2-pass`。旧 `tasks/T09-*` 至 `tasks/T42-*` 已退役，只保留历史参考；所有已完成状态和验收记录不得因 V1.3 重新实现或改写。

当前活动版本是 V1.3。产品主规格是 `教师工作台_V1_3_快速建课_产品与实施方案.md`，实施决策是 `implementation-tasks/V1_3_DECISIONS.md`，唯一活动链为 `implementation-tasks/v1.3-tasks/` 中的 V13-01–V13-05。参考图只用于布局和交互关系；与冻结文字方案冲突时以文字为准。

当用户指定当前实现任务时：

1. 先阅读 V1.3 产品主规格、`implementation-tasks/GLOBAL_CONSTRAINTS.md`、`implementation-tasks/V1_3_DECISIONS.md`、`implementation-tasks/VERSION_CONTROL.md`、当前 V13-xx 任务文件及其明确列出的前置产物；
2. 只完成当前任务，不提前实现后续任务；同一时刻最多一个 V13-xx 为 `IN_PROGRESS`；
3. 解析、搜索和文件刷新继续服从 `docs/spike-results.md` 的有效证据；V1.3 新增范围以冻结的 V1.3 方案与 decisions 为准；
4. 把 V1.3 当作个人 Windows 桌面小项目，优先复用 NodeService、CoreDataService、CourseProgressService、ManagedFileService、DraftService、LessonPrepContext、Search、Parser、AI 与 Backup；不得重做 V1.1 备课内核或 V1.2 课程进度模型；
5. 除快速建课内的日期多选器外，不得顺手加入独立日历页、提醒、成绩分析、学生文件 UI、复杂 enrollment 历史、多 session、永久 recurrence、文件共享、新 AI 工作流、Workflow/Agent 或企业级验证矩阵；
6. V13-01–V13-04 分别运行相关测试、typecheck、lint，并按风险补充必要 build 或本地 smoke；只有 V13-05 运行全量测试、production build、`git diff --check` 和代表性本地 Windows 流程；
7. V1.3 不运行 `package:portable`，不生成 portable、installer 或对外交付包；
8. 完成每个节点后更新 `STATUS.md` 与 `GOAL_PROGRESS.md`，并按版本控制协议创建当前里程碑的本地提交；
9. V1.3 只有 V13-05 一个最终验收点；未完成任务验收或未获得产品负责人的最终体验确认时，不得创建 `checkpoint-V1.3-pass`；
10. 只有核心 happy path 无法实现、存在资料损坏/路径越界/Key 泄漏风险、缺少必需权限或凭据、或需要产品负责人改变方向时，才可标为 `BLOCKED`。

Git 硬规则：只允许按 `implementation-tasks/VERSION_CONTROL.md` 创建可审计的本地方案、里程碑提交和通过标签；不得自动 push、添加远程、提交秘密或真实教学资料，不得用破坏性 Git 命令丢弃现有成果。

不可放松的安全边界：Local-first；Renderer 不直接访问 SQLite、Node、任意文件系统或秘密；外部资料默认只读且路径不得逃逸已登记根目录；managed 文件路径与课程树解耦；正式 managed 文件写入使用临时文件加原子重命名；长解析、Hash 和批量索引不得阻塞 Electron Main；API Key 不得明文落盘、写日志或进入备份；AI 草稿和保存成果绝不覆盖老师原资料。
