# 实施状态

状态只使用 `TODO`、`IN_PROGRESS`、`BLOCKED`、`DONE`。只有当前里程碑验收证据齐全时才能标 `DONE`。

## 已完成历史基线

| 任务 | 状态 | 完成记录 |
|---|---|---|
| T01 项目骨架 | DONE | Electron/React/TS 骨架，测试、typecheck、lint、build 与 Windows 启动验证通过 |
| T02 工作区与 SQLite 基础 | DONE | WorkspacePaths、SQLite 连接/迁移/身份封装与回滚验证完成 |
| T03 安全 IPC 与可观测性 | DONE | 类型化白名单 IPC、Renderer/Main 边界、脱敏日志与回归测试完成；Sol PASS |
| T04 文档解析 Spike | DONE | 40 份脱敏真实样本、损坏输入和 Electron runtime 证据完成 |
| T05 中文/数学搜索 Spike | DONE | 真实语料、SearchNormalizer、FTS5 trigram 与 fallback 证据完成 |
| T06 文件刷新 Spike | DONE | 以启动/焦点返回/重新打开/手动刷新保证一致，watcher 仅为可选加速 |
| T07 恢复 Spike | DONE | 代表性临时文件、SQLite、解析与派生索引恢复证据完成 |
| T08 Spike 决策闸门 | DONE | 23/23 gate、18 项测试、typecheck、lint、build 通过；Sol PASS |

> 旧 T09–T42 已退役，不再出现在活动状态表中，也不得执行。

## Lean V1 已完成里程碑

| 里程碑 | 状态 | 完成/阻塞记录 |
|---|---|---|
| L01 核心数据与基础树 | DONE | schema v2、NodeService、课程/学生/课次与 note、类型化 core IPC、基础树 UI；24 tests、typecheck、lint、build 与隔离 Windows UI smoke 通过 |
| L02 managed 文件与素材 | DONE | schema v3、受控对象目录、导入/独立副本/软删除恢复、文件 IPC 与 Preload 边界完成；32 tests、typecheck、lint 通过 |
| L03 文件页面与刷新 | DONE | schema v4、素材库/课次/学生资料入口、启动/焦点/刷新/重新打开核对与内容变化事件完成；33 tests、typecheck、lint、production build 与隔离 Windows Electron UI smoke 通过 |
| L04 管资料阶段闸门 | DONE | 代表性资料流程、两个不连续阶段与副本隔离、外部编辑刷新、删除/恢复完成；34 tests、typecheck、lint、production build 与 Windows Electron UI smoke 通过；Sol PASS，`checkpoint-L04-pass` 已创建 |
| L05 搜索核心 | DONE | schema v5 索引状态、可重建 search.db/FTS5 trigram、版本化 Normalizer、短词 fallback、文件/节点/note/chunk 搜索与课程范围过滤完成；37 tests、typecheck、lint 通过 |
| L06 统一解析与顺序 Worker | DONE | `officeparser@7.5.1` 统一 Parser、TXT/MD 轻量解析、单 worker 顺序 Hash/解析/索引、启动重扫、导入/刷新后排队与 indexed/no_text/parse_failed 状态完成；41 tests、typecheck、lint、production build 通过 |
| L07 搜索 UI/重建阶段闸门 | DONE | 全局搜索页、来源/位置/状态展示、类型化搜索 IPC、登记 fileId 打开、search.db 删除/重建与阶段 2 验收完成；44 tests、typecheck、lint、production build 通过；Sol PASS，`checkpoint-L07-pass` 已创建 |
| L08 安全 Key 与 AI Gateway | DONE | provider/model/endpoint 设置、safeStorage/会话 Key、OpenAI-compatible Gateway、错误/超时/取消、fake provider 测试完成；51 tests、typecheck、lint 通过 |
| L09 Context 与三类草稿 | DONE | 选定文件/片段与字符/token 限制、讲义/例题/作业独立生成、来源与 prompt 元数据、普通可编辑 note、失败重试与安全 IPC 完成；57 tests、typecheck、lint 通过 |
| L10 AI 备课阶段闸门 | DONE | fake provider 完整选资料→三类草稿→人工修改→保存验收；Key/失败/重试/上限/原资料隔离边界完成；22 files / 61 tests、typecheck、lint、production build 与 diff check 通过；Sol PASS，`checkpoint-L10-pass` 已创建 |
| L11 空闲态备份与恢复 | DONE | Main 侧外部编辑器确认与空闲闸门、SQLite backup API、managed 文件与元数据 manifest、staging 原子发布、新空目录恢复、SQLite/schema/路径/数量/大小/元数据校验、恢复后搜索索引重建与 Key 排除完成；24 files / 70 tests、typecheck、lint、diff check 通过 |
| L12 Windows 交付总闸门 | DONE | 选择 unpacked Windows portable 目录交付；`npm test` 24 files / 70 tests、typecheck、lint、production build、electron-builder `dir` packaging 与 `git diff --check` 通过；四条 smoke、Windows 启动/工作区创建/退出/重开与 Renderer/包内容安全审计记录于 `docs/v1-acceptance.md`；Sol PASS，`checkpoint-L12-pass` 已创建 |

## V1.1 已完成里程碑

| 里程碑 | 状态 | 完成/阻塞记录 |
|---|---|---|
| V11-01 外部资料浏览 | DONE | 单 external root、安全 lazy 资料树、折叠/恢复、打开/定位与手动刷新已完成；18 项相关测试、typecheck、lint、开发窗口空状态走查通过 |
| V11-02 课次备课入口与本次资料 | DONE | 从课程课次进入备课、学生可选上下文、外部/素材独立副本与本次资料默认选择完成；49 项相关测试、typecheck、lint 和隔离 Electron 双入口 UI 走查通过 |
| V11-03 Skill、本次要求与固定 Prompt | DONE | schema v10 Skill 软删除 CRUD、两套可编辑预置模板、可选 Skill/本次要求、固定三类分区 Prompt 与历史快照完成；38 项相关测试、typecheck、lint 和隔离 Electron UI 走查通过 |
| V11-04 草稿箱、预览编辑与保存 | DONE | schema v11 draft/saved 同行生命周期、全局草稿箱、课次结果列表、同区预览编辑、保留旧稿的重新生成与软删除完成；全局导航固定、右侧内容独立滚动；41 项相关测试、typecheck、lint 和隔离 Electron UI 走查通过 |
| V11-05 V1.1 回归与 Windows 交付 | DONE | 自动主流程、96 项全量测试、typecheck、lint、production build、portable 打包、安全审计和隔离 Windows 启动/本地 fake AI smoke 已通过；最终通过标签等待产品负责人完成测试后确认 |
| V1.1 测试后小修复 | DONE | Bug 1–5 已完成：隐藏 Windows 默认菜单、工作区自适应撑满、整体紧凑化、白色图标导航、已移除资料二次确认后彻底删除；开发版 Main/Preload 重启要求已记录于 `docs/v1.1-post-test-fixes.md` |
| V1.1 当前候选重验 | DONE | 当前 HEAD 的 32 files / 101 tests、typecheck、lint、build、portable、diff check、包内容审计及隔离 Windows 启动/滚动/正常退出均通过；产品负责人已确认最终体验，`checkpoint-V1.1-pass` 创建于最终确认记录提交 |

## V1.2 已完成里程碑

| 里程碑 | 状态 | 完成/阻塞记录 |
|---|---|---|
| V12-01 Core、课程生命周期与点名持久化 | DONE | schema v12、课程进度/生命周期、学生在读关系、课次 session、点名快照与 3 个安全 IPC 已完成；11 项 V12 专项、112 项全量测试、typecheck、lint、build、diff check 通过 |
| V12-02 我的课程、软推进与点名交互 | DONE | 课程列表/详情三栏、活动/已结束筛选、今日点名、Current/Viewed 分离、局部创建 Modal、软推进和点名交互已完成；25 项相关、119 项全量测试、typecheck、lint、build、隔离 Electron smoke 通过 |
| V12-03 真正的学生页 | DONE | 学生列表/详情、搜索/新建、在读/历史课程、manual 记录和课程双向导航已完成；22 项相关、127 项全量测试、typecheck、lint、build、隔离 Electron smoke 通过 |
| V12-04 课次资料与 V1.1 备课接入 | DONE | Viewed Lesson 的 lesson_files、任意课次开始/继续备课、Prep 文案和学生文件 UI 收口已完成；35 项相关、131 项全量测试、typecheck、lint、build、隔离 Electron smoke 通过 |
| V12-05 V1.2 全量回归与版本验收 | DONE | 42 files / 133 tests、typecheck、lint、production build、diff check、安全审计与代表性隔离 Windows 流程通过；产品负责人最终体验确认 PASS，`checkpoint-V1.2-pass` 创建于最终确认提交 |

## V1.3 已完成里程碑

| 里程碑 | 状态 | 完成/阻塞记录 |
|---|---|---|
| V13-01 快速建课数据契约与原子编排服务 | DONE | schema v13、`duration_minutes`、session 时长读写、`createCourseSetup` 单事务、Core IPC / Preload 和 Main 二次校验完成；43 files / 140 tests、typecheck、lint、build、diff check 通过 |
| V13-02 向导领域模型、名单与排课预览 | DONE | 名单精确匹配 / 重名解析、阶段推荐、1–100 课次、本地规律 / 自由日期排课、DST、例外、部分未排、确认摘要和最终请求转换完成；2 files / 18 tests、typecheck、lint、diff check 通过 |
| V13-03 快速建课前两步 UI | DONE | 四步容器、课程 / 学生、重名确认、阶段 / 课次、即时预览、100 节上限和返回保留状态完成；2 files / 17 tests、typecheck、lint、build、静态 Renderer smoke、diff check 通过，未提前暴露不完整入口 |
| V13-04 排课、确认页与课程页完整接入 | DONE | 三种排课、自由日期月历、例外 / 单节调整、全部 / 部分 / 未排确认、唯一事务提交、失败定位 / 重试、课程页主次入口、成功回详情和单节时长维护完成；10 files / 52 tests、typecheck、lint、build、diff check 与两组隔离 Windows Electron smoke 通过 |
| V13-05 V1.3 全量回归与版本验收 | DONE | 47 files / 164 tests、typecheck、lint、production build、diff check、安全审计和 Windows 流程通过；产品负责人最终体验确认 PASS，最终确认提交用于创建并上传 `checkpoint-V1.3-pass` |

## V1.4 已完成里程碑

| 里程碑 | 状态 | 完成/阻塞记录 |
|---|---|---|
| V14-01 题库快照、只读服务与安全 IPC | DONE | `.tqbank` 导出、原子导入、只读查询、单题复制、契约 / Preload / IPC / Main 接入完成；2 files / 8 tests、typecheck、lint、build、diff check 通过 |
| V14-02 工作台原生题库浏览与单题动作 | DONE | 现有工作台壳内题库导航、空状态、默认完整列表、宽屏右侧 / 窄屏下方详情、公式图片、答案解析和单题动作完成；3 files / 9 tests、typecheck、lint、build、真实快照 Electron smoke 通过 |
| V14-03 V1.4 全量回归与版本验收 | DONE | 普通全量 50 files / 174 tests、真实快照 1 file / 1 test、typecheck、lint、production build、diff check、安全 / Git 审计和代表性 Windows 流程通过；产品负责人最终体验确认 PASS，最终确认提交用于创建并上传 `checkpoint-V1.4-pass` |
| V1.4 测试后筛选修复 | DONE | 题型归一为 4 类、非月考 / 缺失月份显示“无”、知识点标签可折叠多选并支持包含 / 不包含；全量 50 files / 173 tests、真实快照 1 file / 1 test、typecheck、lint、build、导出器语法和 diff check 通过 |
| V1.4 高信息密度与组合筛选增强 | DONE | 紧凑两行筛选、考试类型 facet、自由题号表达式、结果卡 KaTeX 与 Markdown 转义处理完成；全量 50 files / 174 tests、真实快照 1 file / 1 test、typecheck、lint、build、隔离 Electron smoke 和 diff check 通过 |

## V1.5 活动里程碑

| 里程碑 | 状态 | 完成/阻塞记录 |
|---|---|---|
| V15-01 教学内容导航目标与双向入口 | DONE | Renderer 类型化教学内容目标、课程/学生/直接入口、草稿箱迁移、临时上下文与双向返回完成；52 files / 180 tests、typecheck、lint、production build、diff check 通过；未运行 portable/installer |
| V15-02 教学内容工作台与宽正文 | DONE | 三分区工作台、临时课次抽屉、课件正文、沉浸阅读、备课“查看课件”返回与窄窗口防御布局完成；1200px 宽度与窄窗口证据并入 V15-03 隔离流程；53 files / 187 tests、typecheck、lint、production build、diff check 通过 |
| V15-03 V1.5 全量回归与版本验收 | DONE | 最终门 54 files / 190 tests、typecheck、lint、production build、diff check 通过；代表性隔离 Windows 流程、真实 380MB 题库、fake AI 备课与宽度证据见 `docs/v1.5-acceptance.md`；修复课程/学生页加载期选择丢失缺陷；产品负责人最终体验确认 PASS，`checkpoint-V1.5-pass` 已创建于最终确认提交 |

## V1.5.2 活动里程碑（AI 修改工作区）

| 里程碑 | 状态 | 完成/阻塞记录 |
|---|---|---|
| V152-A 术语和界面收口 | DONE | 三分区改为"课件 / AI 备课 / 修改记录"，全局入口改为"修改记录 {计数}"，状态术语改为"修改中/已确认"，Main 删除保护文案同步；全量 54 files / 190 tests、typecheck、lint、production build、diff check 通过 |
| V152-B 当前工作副本 | DONE | 进入 AI 备课自动恢复最近未发布工作副本并提示"未成为正式课件"；跨分区/换课次/返回有未保存编辑时弹确认；编辑中切换结果保留原有确认；54 files / 191 tests、typecheck、lint、production build、diff check 通过；隔离 UI smoke 通过 |
| V152-C 已有课件改进流程 | DONE | 基于课件改进入口 + 参考范围/修改要求校验 + AI 方案审阅（确认/重新出方案/放弃）+ 确认后按方案生成 + 新旧对比；4 项契约测试；55 files / 195 tests、typecheck、lint、build、diff check 通过；D15 中继式 AI 验收通过（方案与生成均为真实语义现写内容） |
| V152-D 修改记录与版本发布 | DONE | 按批准的窄通道 `draft:publish-to-lesson` 实现"保存为新版本"：原子写入 managed 新课件（"标题 · 第 N 版"命名）、关联课次、节点转"已确认"、旧版本保留；55 files / 196 tests、typecheck、lint、build、diff check 通过 |
| V152-E V1.5.2 全量回归与版本验收 | DONE |  全量 54 files / 197 tests、typecheck、lint、build、diff check 通过；真实思源课件全流程（导入→方案→确认→生成→对比→发布→课件区 v1/v2 并存）通过；修复结构性文件过滤误判；报告见 `docs/v1.5.2-acceptance.md`；产品负责人已确认以中继式测试结束 V1.5.2（真实 provider 自测为遗留项）；`checkpoint-V1.5.2-pass` 已创建 |

## V1.5.3 活动里程碑（课件动作化）

| 里程碑 | 状态 | 完成/阻塞记录 |
|---|---|---|
| V153-A 课件动作化与 AI 修改工作台 | DONE | 更正后真实现：两分区 + 课件区上下文 AI 入口 + **两栏工作台**（左=参考资料/本课修改节点，右=提示词常驻+方案审阅+对比+发布；移除旧三栏与"AI 备课"卡片）+ 课件列表单当前版+历史折叠+正文默认当前版；实机复验通过；55 files / 197 tests、typecheck、lint、build、diff check 通过 |
| V153-B V1.5.3 全量回归与版本验收 | DONE | 全量 54 files / 197 tests、typecheck、lint、build、diff check 通过；真实思源课件隔离全流程（入口→工作台→中继生成→发布→课件区单当前版+历史折叠+正文默认最新）通过；产品负责人已完成最终体验确认；报告 `docs/v1.5.3-acceptance.md`；已创建 `checkpoint-V1.5.3-pass` |

## V1.5.3.1 活动修正（AI 修改范围分流）

| 里程碑 | 状态 | 完成/阻塞记录 |
|---|---|---|
| V1531-A 修改范围模型与两种入口 | DONE | Renderer-only `new/single/lesson` intent、当前版/历史版分类、课件区“修改这份 / 整课重做 / 新建”入口、显式入口不抢恢复旧草稿、工作台目标/自动基线/可选参考分组与模式切换完成；5 files / 24 tests、typecheck、lint、production build、diff check 通过 |
| V1531-B 模式化生成与最终回归 | DONE | 单文件/整课模式化方案与完整生成、基线优先文本预算、metadata 恢复、模式化比较/发布语义完成；修复已有第 1 版发布时重复命名缺陷与思源跨行图片引用解析；新增课次正文“从本课移除”入口与素材库独立原件筛选/目录式查找；隔离 Electron 完成 v1→单文件 v2→整课 v3，SQLite/来源顺序核验通过；56 files / 211 tests passed（另 1 file / 1 test skipped），typecheck、lint、build、diff check 通过；产品负责人已确认 V1.5.3 |

## V1.5.3.2 活动实现（素材库逻辑目录）

| 里程碑 | 状态 | 完成/阻塞记录 |
|---|---|---|
| V1532-A 素材库目录模型与迁移 | DONE | 新增 schema v15 的 material_folders / material_folder_items；独立素材进入待整理虚拟入口，课程/学生副本隔离；嵌套目录、单父级归属和空目录删除规则完成；专项模型测试通过 |
| V1532-B 素材库服务与安全 IPC | DONE | 新增目录查询、新建、重命名、移动、排序、删除和保存为素材 IPC；Renderer 仅通过 Preload 白名单访问，外部根目录校验和托管文件原子复制继续复用 |
| V1532-C 素材库树形工作台 UI | DONE | 素材库页面改为系统入口 + 老师自建层级树 + 文件区；类型仅作辅助筛选；导入、复制到课次、移除/恢复和逻辑目录操作文案明确；外部资料入口同步为“保存到素材库” |
| V1532-D 最终回归 | DONE | 产品负责人已确认两棵树、目录维护、资料流转及应用内弹窗体验；Renderer 原生确认/输入框已统一替换为应用内弹窗，覆盖从本课移除资料、AI 修改、快速建课及素材库目录维护；自动质量门通过；已创建 `checkpoint-V1.5.3-pass` |

## V1.5.4 活动实现（素材库树交互）

| 里程碑 | 状态 | 完成/阻塞记录 |
|---|---|---|
| V154-A 树交互与安全移动 | DONE | 文件夹展开/收起、就地创建、文件/文件夹右键菜单、文件拖拽归档、文件夹跨级移动与排序完成；复用既有 schema、Service 和 IPC 通道；专项测试、typecheck、lint、production build 通过 |
| V154-B 最终回归与体验验收 | DONE | 最终门复跑通过：全量 57 files / 215 tests passed（1 skipped）、typecheck、lint、production build、`git diff --check`；产品负责人已完成真实窗口体验确认（素材树拖拽/右键/重启保持与课程阶段默认收起共 6 点全部通过）；`checkpoint-V1.5.4-pass` 创建于最终确认提交 |

## V1.5.5 已立项（正确性与健壮性加固）

| 里程碑 | 状态 | 计划内容 |
|---|---|---|
| V155-A AI 修改范围元数据结构化 | DONE | `DraftModificationScope` 可选键双轨制、`draft-scope.ts` 纯模块抽取、旧笔记回退解析完成；相关 30 tests、typecheck、lint 通过 |
| V155-B 素材库 IPC 测试与 overview 查询修正 | DONE | `material-library-ipc.test.ts` 补齐（6 tests）、恒真 WHERE 简化与类型化行接口（零行为变化）、软删除/挂课副本行为钉死完成；相关 11 tests、typecheck、lint 通过 |
| V155-C 解析超时与窗口导航守卫 | TODO | DocumentParser `parseTimeoutMs`（默认 120s）、`applyWindowNavigationGuard` |
| V155-D 版本计数与约束错误码修正 | TODO | 发布版本号改含软删除的锚定 MAX+1；`isConstraintError` 错误码优先 |
| V155-E V1.5.5 最终回归与版本验收 | TODO | 全量门 + 隔离 Windows 冒烟 + `docs/v1.5.5-acceptance.md`，确认后创建 `checkpoint-V1.5.5-pass` |

基线 `checkpoint-V1.5.4-pass`（已创建）；设计基准 `docs/v1.5.5-hardening-plan.md`，决策 D19；按编号顺序执行，同一时刻最多一个 `IN_PROGRESS`。

## V1.5.6 已立项（可维护性技术债清理，待 V1.5.5 闭环后激活）

| 里程碑 | 状态 | 计划内容 |
|---|---|---|
| V156-A 共享工具收敛与覆盖率基线 | TODO | `ui-utils.ts` 收敛 toErrorMessage/formatBytes；引入 coverage-v8 只记基线 |
| V156-B CSS 设计令牌 | TODO | `:root` 调色板/圆角/间距令牌，机械等值替换，视觉零变化 |
| V156-C overview 共享缓存 | TODO | `CoreOverviewProvider` + `invalidate()`，分页迁移，纯 Renderer 改动 |
| V156-D 向导去重与静态渲染测试 | TODO | 向导编排收敛为共享 hook；大型组件补 `renderToStaticMarkup` 测试 |
| V156-E V1.5.6 最终回归与版本验收 | TODO | 全量门 + 隔离 Windows 冒烟 + `docs/v1.5.6-acceptance.md`，确认后创建 `checkpoint-V1.5.6-pass` |

基线 `checkpoint-V1.5.5-pass`（待 V155-E 验收后创建）；设计基准 `docs/v1.5.6-maintainability-plan.md`，决策 D20；基线创建前任何任务不得置为 `IN_PROGRESS`。
