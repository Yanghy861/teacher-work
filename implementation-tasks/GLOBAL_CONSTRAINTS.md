# 教师工作台 V1 / V1.1 / V1.2 / V1.3 / V1.4 / V1.5 全局实施约束

Lean V1、V1.1、V1.2、V1.3、V1.4 已分别在 `checkpoint-L12-pass`、`checkpoint-V1.1-pass`、`checkpoint-V1.2-pass`、`checkpoint-V1.3-pass`、`checkpoint-V1.4-pass` 完成。本文件中的安全边界继续适用于 V1.5；V1.5 的新增产品范围与简单化裁决以冻结的 V1.5 产品方案和 `V1_5_DECISIONS.md` 为准。

## 1. 产品目标

V1 只证明三条核心流程：

1. 老师能按课程、学生和课次管理导入到工作台的资料；
2. 老师能搜索文件名、记录和常见教学文档正文，并打开来源；
3. 老师能选择资料，调用自己的兼容 API 生成可编辑、可保存的讲义/例题/作业草稿。

没有直接服务这三条流程的能力默认进入 Later。旧 T09–T42 中与 Lean 任务冲突的设计不再是验收要求。

## 2. 简单优先

- 手动刷新、重新打开或失败后重试，优先于实时监听和精确续传；
- 单个顺序 Worker 和内存队列，优先于 Worker 池、持久化调度器和优先级系统；
- 一个统一 Parser Adapter，优先于按格式拆成多套生产框架；
- 清晰按钮和普通表单，优先于拖拽、复杂树交互和超大规模优化；
- 每个任务只验证代表性正常流程、常见失败与适用的安全边界，不穷举第三方软件内部时序；
- 若复杂方案的额外收益不影响核心流程，应采用简单替代或写入 Later，而不是阻塞项目。

详细取舍见 `LEAN_V1_DECISIONS.md`。

## 3. 不可放松的技术与安全边界

- Windows 优先的 Electron + React + TypeScript 桌面应用；业务真相在 `workspace.db`，全文索引在可删除重建的 `search.db`；
- Renderer 只能通过类型化、运行时校验、白名单 IPC 使用能力，不能直接访问 SQLite、Node、任意文件系统或 API Key；
- Electron Main 只做短事务和编排；解析、批量 Hash、批量索引放入 Worker，顺序执行即可；
- managed 文件使用不由课程标题拼接的安全对象路径；路径解析必须防止逃逸工作区；
- 正式 managed 文件写入先落同目录临时文件，成功后原子重命名；失败不得留下被当成正式文件的半成品；
- 课程树移动或重命名只改变逻辑关系，不移动 managed 文件；
- API Key 只进入 OS-backed secure storage；若当前 Windows/Electron 环境无法安全落盘，可以仅在本次会话内使用，不得退回明文配置；
- Key、真实教学资料、工作区数据库、日志和备份不得进入 Git；
- AI 只生成普通可编辑草稿，不覆盖、删除或静默修改老师原资料。

## 4. 文件刷新、搜索与解析

- V1 只管理导入到工作台的副本；V1.1 仅新增一个外部根目录的按需只读浏览和复制入口，任意后台扫描、多 root、重定位、全文索引和长期同步继续进入 Later；
- 启动、窗口重新获得焦点、重新打开文件和手动刷新时做轻量核对；watcher 可以省略，不能成为正确性的前置条件；
- 搜索覆盖标题、文件名、note/body，以及 TXT、MD、文本 PDF、DOCX、PPTX、XLSX 的可提取文本；不做 OCR；
- 必须区分 `indexed`、`no_text` 和 `parse_failed`，但单个文件失败不能阻止其他文件可用；
- 搜索采用已验证的 SearchNormalizer + SQLite FTS5 路线；复杂分词、向量搜索和独立搜索服务进入 Later；
- 应保存可获得的 slide/page/heading/sheet 等来源位置；第三方库不给出稳定位置时允许明确降级到文件级来源。

## 5. AI、备份与交付

- 没有 API Key 时，资料管理和搜索仍可完整使用；
- 只发送老师明确选择的有限文本片段，并保留足以显示来源的 `file_id + position`；不要求内容哈希清单或通用 Workflow；
- 讲义、例题和作业可独立生成、独立保存、失败后整次重试；不建立持久化 AI 步骤状态机；
- 备份在暂停业务写入后进行，使用 SQLite backup API 和 managed 文件复制，恢复到新的空目录；不要求在线并发快照、孤儿文件修复系统或攻击矩阵；
- Windows 最终交付采用当前工具链中最简单可复现的安装包或便携包；自动更新、升级矩阵和签名发布进入 Later。

## 6. 完成与阻塞规则

历史 Lxx、V11-xx、V12-xx、V13-xx 与 V14-xx 的验证记录保持不变。V15-01–V15-02 运行相关测试、typecheck、lint，并按风险补充 build 或本地 smoke；V15-03 运行全量测试、typecheck、lint、production build、`git diff --check` 和代表性本地 Windows 流程。V1.5 不运行 portable/installer packaging，不创建对外交付包，也不建立多层企业审核链。

只有以下情况可以标记 `BLOCKED`：

- 核心用户流程在当前环境中无法实现或复现；
- 继续会产生资料损坏、路径逃逸或秘密泄漏风险；
- 缺少该核心流程必需的系统权限、凭据或工具；
- 两种选择会明显改变产品方向，需要用户决定。

实现很麻烦、自动化不完美、缺少极端矩阵、非核心增强做不完，不属于真实阻塞。此时必须选择简单实现或写入 Later，并继续推进。

V1.5 已在 `checkpoint-V1.5-pass` 冻结（增量 V1.5.1）。增量 V1.5.2（AI 修改工作区）遵循既有安全边界与复用裁决（D10–D14）：默认不新增 schema、migration、Service 或 IPC，现有白名单能力不足时停止并请产品负责人重新确认范围；验收按 D15 分层执行。V152-A–V152-D 运行相关测试、typecheck、lint 并按风险补 build；V152-E 运行全量测试、production build、`git diff --check` 和代表性本地 Windows 流程；不运行 portable/installer packaging。

完成里程碑后更新 `STATUS.md` 与 `GOAL_PROGRESS.md`，按 `VERSION_CONTROL.md` 创建范围清晰的本地提交；不得自动 push。
