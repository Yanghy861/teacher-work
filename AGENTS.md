# 教师工作台 V1 / V1.1 / V1.2 / V1.3 / V1.4 / V1.5：实现代理约束

Lean V1 的 T01–T08 与 L01–L12、V1.1 的 V11-01–V11-05、V1.2 的 V12-01–V12-05、V1.3 的 V13-01–V13-05、V1.4 的 V14-01–V14-03、V1.5 的 V15-01–V15-03 均已完成；稳定基线依次为 `checkpoint-L12-pass`、`checkpoint-V1.1-pass`、`checkpoint-V1.2-pass`、`checkpoint-V1.3-pass`、`checkpoint-V1.4-pass`、`checkpoint-V1.5-pass`。旧 `tasks/T09-*` 至 `tasks/T42-*` 已退役，只保留历史参考；所有已完成状态和验收记录不得因后续增量重新实现或改写。

V1.5（增量 V1.5.1）、V1.5.2 与 V1.5.3（含 V1.5.3.1、V1.5.3.2）已分别冻结在 `checkpoint-V1.5-pass`、`checkpoint-V1.5.2-pass` 与 `checkpoint-V1.5.3-pass`。当前活动增量是 V1.5.4（素材库树交互），设计基准 `docs/v1.5.4-material-tree-interactions.md` 与决策 D18，唯一活动链为 `implementation-tasks/v1.5.4-tasks/` 中的 V154-A–V154-B；同一时刻最多一个任务 `IN_PROGRESS`。V1.5.4 不新增 schema/migration 或 IPC 通道，复用现有 MaterialLibraryService 与白名单 IPC，只扩展既有目录排序请求以支持受控换父级。所有已完成版本的历史状态、验收记录和通过标签不得改写。

当用户指定当前实现任务时：

1. 先阅读 V1.5.2 产品方案（主规格第 11 节）、`implementation-tasks/GLOBAL_CONSTRAINTS.md`、`implementation-tasks/V1_5_DECISIONS.md`、`implementation-tasks/VERSION_CONTROL.md`、当前 V152-xx 任务文件及其明确列出的前置产物；
2. 只完成当前任务，不提前实现后续任务；同一时刻最多一个 V152-xx 为 `IN_PROGRESS`；
3. 解析、搜索和文件刷新继续服从 `docs/spike-results.md` 的有效证据；V1.5.2 新增范围以冻结的 V1.5.2 方案与 decisions（D10–D15）为准；
4. 把 V1.5 当作个人 Windows 桌面小项目，优先复用 CourseDashboard、CourseDetail、StudentsPage、LessonFilesSection、LessonMaterialReader、DraftPanel、LessonPrepContext 及既有 Main 服务；“教学内容”统一承载课件、备课和草稿箱，不得重做 V1.1 备课内核、V1.2 课程进度模型、V1.3 快速建课或 V1.4 题库；
5. V1.5.2 默认只改 Renderer 与既有 notes 生命周期的复用方式，不新增 schema、migration、Service 或 IPC；若现有安全能力不足，停止并请产品负责人重新确认范围；
6. 课程 / 课次目录默认只能按需临时展开，不得与本课课件目录同时常驻并挤压正文；不得顺手加入独立课件库、第二棵课程树、文件拖拽整理、云同步、组卷、错题本、自动推荐、成绩分析、多题批量入课或新 AI 工作流；
7. V152-A–V152-D 分别运行相关测试、typecheck、lint，并按风险补充必要 build 或本地 smoke；只有 V152-E 运行全量测试、production build、`git diff --check` 和代表性本地 Windows 流程；
8. V1.5.2 不运行 `package:portable`，不生成 portable、installer 或对外交付包；
9. 完成每个节点后更新 `implementation-tasks/STATUS.md` 与 `implementation-tasks/GOAL_PROGRESS.md`，并按版本控制协议创建当前里程碑的本地提交（`v1.5.2(V152-XX): <摘要>`）；
10. V1.5.2 只有 V152-E 一个最终验收点；未完成任务验收或未获得产品负责人的最终体验确认时，不得创建 `checkpoint-V1.5.2-pass`；
11. 只有核心 happy path 无法实现、存在资料损坏/路径越界/Key 泄漏风险、缺少必需权限或凭据、或需要产品负责人改变方向时，才可标为 `BLOCKED`。

Git 硬规则：只允许按 `implementation-tasks/VERSION_CONTROL.md` 创建可审计的本地方案、里程碑提交和通过标签；不得自动 push、添加远程、提交秘密或真实教学资料，不得用破坏性 Git 命令丢弃现有成果。

不可放松的安全边界：Local-first；Renderer 不直接访问 SQLite、Node、任意文件系统或秘密；外部资料默认只读且路径不得逃逸已登记根目录；managed 文件路径与课程树解耦；正式 managed 文件写入使用临时文件加原子重命名；长解析、Hash 和批量索引不得阻塞 Electron Main；API Key 不得明文落盘、写日志或进入备份；AI 草稿和保存成果绝不覆盖老师原资料。
