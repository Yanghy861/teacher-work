# 教师工作台 V1 / V1.1 / V1.2 / V1.3 / V1.4 / V1.5 / V1.6 / V1.7：实现代理约束

Lean V1 的 T01–T08 与 L01–L12、V1.1 的 V11-01–V11-05、V1.2 的 V12-01–V12-05、V1.3 的 V13-01–V13-05、V1.4 的 V14-01–V14-03、V1.5 的 V15-01–V15-03 均已完成；稳定基线依次为 `checkpoint-L12-pass`、`checkpoint-V1.1-pass`、`checkpoint-V1.2-pass`、`checkpoint-V1.3-pass`、`checkpoint-V1.4-pass`、`checkpoint-V1.5-pass`。旧 `tasks/T09-*` 至 `tasks/T42-*` 已退役，只保留历史参考；所有已完成状态和验收记录不得因后续增量重新实现或改写。

V1.5（增量 V1.5.1）至 V1.5.6 已分别冻结在 `checkpoint-V1.5-pass`、`checkpoint-V1.5.2-pass`、`checkpoint-V1.5.3-pass`、`checkpoint-V1.5.4-pass`、`checkpoint-V1.5.5-pass` 与 `checkpoint-V1.5.6-pass`。V1.6（AI 修改逻辑重做）已冻结在 `checkpoint-V1.6-pass`。当前活动增量是 **V1.7**（MD 课件编辑——AI 二改放宽 + 人工编辑器——与题库 AI 选题生成），设计基准 `docs/v1.7-md-editing-and-bank-integration-plan.md` 与决策 D27–D32，唯一活动链为 `implementation-tasks/v1.7-tasks/` 中的 V17-A–V17-E；同一时刻最多一个任务 `IN_PROGRESS`。V1.7 经产品负责人批准新增 migration v17（notes 表 note_kind CHECK 重建）与 `files:read-text` / `files:write-version` / `question-bank:search-questions` IPC 通道；题库保持独立只读快照（产品上一体为 AI 知识源、架构上解耦可缺省），生成产物永不覆盖原件。所有已完成版本的历史状态、验收记录和通过标签不得改写。

当用户指定当前实现任务时：

1. 先阅读 V1.7 设计基准（`docs/v1.7-md-editing-and-bank-integration-plan.md`）、`implementation-tasks/GLOBAL_CONSTRAINTS.md`、`implementation-tasks/V1_7_DECISIONS.md`、`implementation-tasks/VERSION_CONTROL.md`、当前 V17-xx 任务文件及其明确列出的前置产物；
2. 只完成当前任务，不提前实现后续任务；同一时刻最多一个 V17-xx 为 `IN_PROGRESS`；
3. 解析、搜索和文件刷新继续服从 `docs/spike-results.md` 的有效证据；V1.7 新增范围以冻结的设计基准与 decisions（D27–D32）为准；
4. 把 V1.7 当作个人 Windows 桌面小项目，优先复用 DraftPanel、draft-scope、draft-reference-budget、AiGateway、QuestionBankService、ManagedFileService、LessonMaterialReader/MarkdownDocument、SearchService 及既有 Main 服务；不得重做 V1.1 备课内核、V1.2 课程进度模型、V1.3 快速建课、V1.4 题库存储、V1.5 工作台布局或 V1.6 流式/预算/MinerU 冻结语义；
5. V1.7 只做设计基准列出的改动；migration 只允许 v17（notes 表 CHECK 重建），IPC 只允许 `files:read-text`、`files:write-version`、`question-bank:search-questions` 三条新通道；若需要超出设计基准的能力，停止并请产品负责人重新确认范围；
6. 编辑器零新依赖（受控 textarea + 工具栏 + 分屏 KaTeX 预览）；`files:write-version` 永远写新文件（临时文件 + 原子重命名），绝不 UPDATE 目标行，外部根目录资料不可编辑；题库只读（仅 search/getQuestion），题库定位为 AI 生成知识源但不演变为自动组卷、错题本、成绩分析、多快照换版或题库沉淀写路径；
7. V17-A–V17-D 分别运行相关测试、typecheck、lint，并按风险补充必要 build 或本地 smoke；只有 V17-E 运行全量测试、production build、`git diff --check`、隔离 Windows 冒烟和 DeepSeek 真实自测（预估 ≤ ¥3）；
8. V1.7 不运行 `package:portable`，不生成 portable、installer 或对外交付包；
9. 完成每个节点后更新 `implementation-tasks/STATUS.md` 与 `implementation-tasks/GOAL_PROGRESS.md`，并按版本控制协议创建当前里程碑的本地提交（`v1.7(V17-XX): <摘要>`）；产品负责人已授权里程碑提交后 push 到 GitHub（远程 `Yanghy861/teacher-work`），推送前确保无秘密与真实教学资料入库；
10. V1.7 只有 V17-E 一个最终验收点；未完成任务验收或未获得产品负责人的最终体验确认时，不得创建 `checkpoint-V1.7-pass`；
11. 只有核心 happy path 无法实现、存在资料损坏/路径越界/Key 泄漏风险、缺少必需权限或凭据、或需要产品负责人改变方向时，才可标为 `BLOCKED`。

Git 硬规则：只允许按 `implementation-tasks/VERSION_CONTROL.md` 创建可审计的本地方案、里程碑提交和通过标签；不得自动 push、添加远程、提交秘密或真实教学资料，不得用破坏性 Git 命令丢弃现有成果。

不可放松的安全边界：Local-first；Renderer 不直接访问 SQLite、Node、任意文件系统或秘密；外部资料默认只读且路径不得逃逸已登记根目录；managed 文件路径与课程树解耦；正式 managed 文件写入使用临时文件加原子重命名；长解析、Hash 和批量索引不得阻塞 Electron Main；API Key 不得明文落盘、写日志或进入备份；AI 草稿和保存成果绝不覆盖老师原资料。
