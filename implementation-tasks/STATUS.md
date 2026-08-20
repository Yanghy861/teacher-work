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
| T08 Spike 决策闸门 | DONE | 23/23 gate、18 项测试、typecheck、lint、build 通过；等待更新范围后的 Sol 复审 |

> 旧 T09–T42 已退役，不再出现在活动状态表中，也不得执行。

## Lean V1 活动里程碑

| 里程碑 | 状态 | 完成/阻塞记录 |
|---|---|---|
| L01 核心数据与基础树 | TODO | |
| L02 managed 文件与素材 | TODO | |
| L03 文件页面与刷新 | TODO | |
| L04 管资料阶段闸门 | TODO | |
| L05 搜索核心 | TODO | |
| L06 统一解析与顺序 Worker | TODO | |
| L07 搜索 UI/重建阶段闸门 | TODO | |
| L08 安全 Key 与 AI Gateway | TODO | |
| L09 Context 与三类草稿 | TODO | |
| L10 AI 备课阶段闸门 | TODO | |
| L11 空闲态备份与恢复 | TODO | |
| L12 Windows 交付总闸门 | TODO | |
