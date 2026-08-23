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

## V1.2 活动里程碑

| 里程碑 | 状态 | 完成/阻塞记录 |
|---|---|---|
| V12-01 Core、课程生命周期与点名持久化 | DONE | schema v12、课程进度/生命周期、学生在读关系、课次 session、点名快照与 3 个安全 IPC 已完成；11 项 V12 专项、112 项全量测试、typecheck、lint、build、diff check 通过 |
| V12-02 我的课程、软推进与点名交互 | DONE | 课程列表/详情三栏、活动/已结束筛选、今日点名、Current/Viewed 分离、局部创建 Modal、软推进和点名交互已完成；25 项相关、119 项全量测试、typecheck、lint、build、隔离 Electron smoke 通过 |
| V12-03 真正的学生页 | DONE | 学生列表/详情、搜索/新建、在读/历史课程、manual 记录和课程双向导航已完成；22 项相关、127 项全量测试、typecheck、lint、build、隔离 Electron smoke 通过 |
| V12-04 课次资料与 V1.1 备课接入 | TODO | 等待 V12-03 |
| V12-05 V1.2 全量回归与版本验收 | TODO | 等待 V12-01–V12-04；最终标签还需产品负责人体验确认 |
