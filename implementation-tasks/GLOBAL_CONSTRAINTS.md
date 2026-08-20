# 全局实施约束

## 1. 产品边界

V1 只证明三件事：管理资料、全文找资料、基于老师确认的资料完成 AI 备课。未写入 V1 的能力默认进入 Later，不得顺手加入。

明确禁止在 V1 引入：云端账号/多人协作、向量数据库或语义搜索、Embedding、OCR、知识图谱、课程继承/同步/合并、文件去重、通用 Workflow/Agent 框架、AI 生成或修改 PPT、题库整体迁移、旧式 DOC/PPT/XLS 支持、多端实时同步。

## 2. 固定技术与数据边界

- Windows 优先的 Electron + React + TypeScript 桌面应用；业务库为 SQLite `workspace.db`，派生全文库为 SQLite `search.db`；
- React Renderer 只能通过类型化 IPC 使用能力，不能直接访问 SQLite、任意文件系统、Node API 或 API Key；
- Electron Main 只做短事务、IPC 编排和任务协调；文档解析、批量 Hash、首次/大批量索引放入 `worker_threads`；
- 业务服务边界至少包含 NodeService、FileService、LinkService、SearchService、ContextBuilder、AIService、BackupService、SettingsService；
- 第三方解析库必须包在自有 `DocumentParser` Adapter 后；业务库和搜索库不得保存第三方库私有 AST；
- 第三方库在采用前记录许可证、维护状态、Electron 打包兼容性及 Windows/WPS 实测结果。

## 3. 文件安全

- 程序安装目录与用户工作区彻底分离；升级/卸载不得自动删除工作区；
- managed 文件使用 `files/objects/<file-uuid>/<sanitized-name>` 一类对象布局，物理路径不能由课程树标题或路径拼接；
- external 文件只保存根目录 ID + 相对路径，默认只读；找不到时标记 `missing`，不得删除数据库记录或原文件；
- 素材或 external 加入课次时必须真实复制，副本从此独立，并记录 `origin_file_id`；
- 正式文件先写 `.tmp`，完成和校验后原子重命名，再以事务提交业务状态；中断不能留下“正式半文件”；
- 拖动/重命名课程树只改变逻辑关系，绝不移动 managed 物理文件；
- Office/WPS watcher 事件只能标 dirty，随后经过 debounce、稳定检测、可读检查、Hash 去重和单文件任务合并。

## 4. 数据一致性与可恢复性

- 核心写操作必须使用事务；要么完整提交，要么回滚；
- 软删除必须可恢复，禁止业务数据的隐式硬删除；
- 长任务必须有明确持久化状态；原 `processing` 项在异常重启后回到 `pending`；
- 搜索是派生数据：`search.db` 可删除并从 `workspace.db` + 真实文件重建，不能成为业务真相；
- 索引必须文件级恢复、持续显示进度、允许已完成文件先搜索；单文件失败不能阻塞队列；
- AI 任务必须步骤级保存；完成步骤保留，中断步骤允许整步重做，不做 token 级续传。

## 5. 搜索边界

- 搜索节点标题、文件名、note/body_md，以及 TXT/MD/PDF 文本层/DOCX/PPTX/XLSX 可提取正文；
- 图片、扫描 PDF、PPT 图片文字不 OCR；必须区分 `no_text` 与 `parse_failed`；
- 中文/数学策略由真实 Spike 决定，至少验证 `有理数`、`一元二次`、`函数`、`几何`、`圆`、`AMC8`、`P16`、`|x|`、`∠ABC`、`△ABC`、`x²`；
- 优先路径是 FTS5 trigram + SearchNormalizer，必要时使用 TokenExtractor/短词 fallback；不得用大型搜索系统替代未完成的验证；
- 结果保留 PPT slide、PDF page、DOCX/MD heading、XLSX sheet/cell 等来源位置，并能打开原文件。

## 6. AI 与秘密

- 没有 API Key 时，树、文件、学生、素材、搜索仍须完整可用；
- API Key 只进 OS-backed secure storage；不得明文进入 SQLite、配置文件、日志、错误、遥测、测试快照或备份；
- V1 只有固定 `prepareLesson()` 流程，不抽象通用 Agent/Skill/Workflow；
- ContextBuilder 只发送老师选择或命中的有限片段，去重、排序、控制预算，并保留 `file_id + position + content_hash`；
- AI 输出均为可审阅、可编辑的普通草稿 note，不覆盖原课程文件；
- `ai_runs` 至少保留 provider、model、prompt_version、选中来源与步骤状态。

## 7. 每个任务的完成协议

1. 开始前确认所有前置任务在 `STATUS.md` 为 `DONE`，并确认 `SOL_REVIEW_STATUS.md` 中前一审核点为 `PASS`；闸门或 Sol 审核未过不得绕过。
2. 只读当前任务需要的代码和文档；保留用户已有改动，不做无关重构。
3. 先补/写能证明验收条件的测试，再完成最小实现；测试不得只验证 mock 调用次数而忽略真实状态。
4. 至少运行当前相关测试、TypeScript 类型检查、lint；会影响打包时还要运行 production build。
5. 不以“测试太难”“当前环境没有 Office/真实文件”为理由伪造结果；缺真实条件就标 `BLOCKED`。
6. 完成后只把本任务状态改为 `DONE`，并在 `implementation-tasks/GOAL_PROGRESS.md` 追加记录：改动文件、运行命令、测试结果、人工验证、已知限制、下一任务可依赖的接口。
7. 用户已明确要求使用 Git 版本控制。完成并验证每个任务后，必须按 `VERSION_CONTROL.md` 创建范围可审计的本地提交；审核点按协议创建送审提交与通过标签。不得自动 push、添加远程、发布、改写历史、提交秘密或迁移真实教学资料。
8. Luna 到达 T03、T08、T15、T20、T24、T32、T33、T38、T40、T42 后必须设置 `AWAITING_REVIEW` 并停止；只有 Sol 审核会话可以把对应审核状态改为 `PASS`。
