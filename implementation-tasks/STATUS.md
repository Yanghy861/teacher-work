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

## V1.1 活动里程碑

| 里程碑 | 状态 | 完成/阻塞记录 |
|---|---|---|
| V11-01 外部资料浏览 | DONE | 单 external root、安全 lazy 资料树、折叠/恢复、打开/定位与手动刷新已完成；18 项相关测试、typecheck、lint、开发窗口空状态走查通过 |
| V11-02 课次备课入口与本次资料 | TODO | 从课次进入备课，外部/素材复制为本课 managed 独立资料 |
| V11-03 Skill、本次要求与固定 Prompt | TODO | 简单 Skill CRUD、可选本次要求、固定三类生成组合 |
| V11-04 草稿箱、预览编辑与保存 | TODO | draft/saved 两态、重新生成保留旧草稿、同区预览编辑 |
| V11-05 V1.1 回归与 Windows 交付 | TODO | 完整流程、V1 代表性回归、portable Windows 最终验收 |
