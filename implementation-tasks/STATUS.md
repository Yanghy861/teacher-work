# 实施状态

状态只使用 `TODO`、`IN_PROGRESS`、`BLOCKED`、`DONE`。只有任务验收证据齐全时才能标 `DONE`。

| 任务 | 状态 | 完成/阻塞记录 |
|---|---|---|
| T01 项目骨架 | DONE | 类型检查、lint、5 项测试、production build 均通过；Windows 真实开发窗口已在保留 `sandbox: true`、未使用 `--no-sandbox`/`--disable-gpu-sandbox` 的条件下正常显示并以 Alt+F4 退出，进程退出码 0 |
| T02 工作区与 SQLite 基础 | DONE | `WorkspacePaths`、SQLite 连接/迁移/身份封装完成；重复打开、迁移回滚、构建目录替换后数据保留及路径错误测试通过 |
| T03 安全 IPC 与基础可观测性 | DONE | 共享契约/运行时校验、白名单 IPC、getWorkspaceInfo、Renderer Error Boundary、Main 脱敏日志与边界测试完成；类型检查、lint、16 项测试、production build 通过 |
| T04 文档解析 Spike | TODO | |
| T05 中文/数学搜索 Spike | TODO | |
| T06 Office/WPS 保存监听 Spike | TODO | |
| T07 强杀与恢复 Spike | TODO | |
| T08 Spike 决策闸门 | TODO | |
| T09 nodes 数据层 | TODO | |
| T10 NodeService | TODO | |
| T11 左侧树 UI | TODO | |
| T12 课程/阶段/课次 | TODO | |
| T13 学生、记录与 links | TODO | |
| T14 files 数据层与路径解析 | TODO | |
| T15 managed 文件导入/复制/打开 | TODO | |
| T16 素材库与副本隔离 | TODO | |
| T17 external roots | TODO | |
| T18 稳定文件变化检测 | TODO | |
| T19 课次/素材/学生文件 UI | TODO | |
| T20 Phase 1 闸门 | TODO | |
| T21 搜索库、状态与队列数据层 | TODO | |
| T22 DocumentParser + MD/TXT | TODO | |
| T23 SearchNormalizer/TokenExtractor/FTS | TODO | |
| T24 后台 Worker 与受控索引写入 | TODO | |
| T25 SearchService | TODO | |
| T26 搜索与索引进度 UI | TODO | |
| T27 PDF Parser | TODO | |
| T28 DOCX Parser | TODO | |
| T29 PPTX Parser | TODO | |
| T30 XLSX Parser | TODO | |
| T31 增量重建与索引恢复 | TODO | |
| T32 Phase 2 闸门 | TODO | |
| T33 设置与 API Key 安全存储 | TODO | |
| T34 AI Gateway | TODO | |
| T35 候选资料与 ContextBuilder | TODO | |
| T36 讲义最小闭环与 ai_runs | TODO | |
| T37 例题/作业/步骤恢复 | TODO | |
| T38 Phase 3 闸门 | TODO | |
| T39 一致性备份与 manifest | TODO | |
| T40 备份校验与新工作区恢复 | TODO | |
| T41 启动完整性与备份安全 | TODO | |
| T42 Windows 交付与 V1 总闸门 | TODO | |
