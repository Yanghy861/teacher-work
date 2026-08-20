# 实施状态

状态只使用 `TODO`、`IN_PROGRESS`、`BLOCKED`、`DONE`。只有任务验收证据齐全时才能标 `DONE`。

| 任务 | 状态 | 完成/阻塞记录 |
|---|---|---|
| T01 项目骨架 | DONE | 类型检查、lint、5 项测试、production build 均通过；Windows 真实开发窗口已在保留 `sandbox: true`、未使用 `--no-sandbox`/`--disable-gpu-sandbox` 的条件下正常显示并以 Alt+F4 退出，进程退出码 0 |
| T02 工作区与 SQLite 基础 | DONE | `WorkspacePaths`、SQLite 连接/迁移/身份封装完成；重复打开、迁移回滚、构建目录替换后数据保留及路径错误测试通过 |
| T03 安全 IPC 与基础可观测性 | DONE | 共享契约/运行时校验、白名单 IPC、getWorkspaceInfo、Renderer Error Boundary、Main 脱敏日志与边界测试完成；安装目录隔离、正文/凭据脱敏和 Renderer AST/ESLint 边界复审修复；类型检查、lint、17 项测试、production build 通过 |
| T04 文档解析 Spike | DONE | 40 份外部脱敏样本已用 `officeparser@7.5.1` 重跑：35 indexed、5 no_text、0 parse_failed、12,797 chunks；三个损坏 OOXML 夹具均正确为 parse_failed，PDF.js 6.2.108 安全处置探针通过 |
| T05 中文/数学搜索 Spike | DONE | 40 份真实样本以新 Adapter 重提取 12,797 个 chunk；FTS5 trigram、SearchNormalizer、TokenExtractor、短词 fallback、标题/文件名对比结论保持一致 |
| T06 Office/WPS 刷新核对 Spike | DONE | 产品决策改为“启动/焦点返回/重新打开/手动刷新保证一致，watcher 仅可选加速”；刷新探针在零 watcher 事件下通过全部断言，已有 WPS DOCX/PPTX/XLSX 普通保存与打开未改真机证据保留；不再以自动恢复、大文件保存和保存中退出矩阵阻塞 V1 |
| T07 强杀与恢复 Spike | DONE | 严格固定临时 root 的 crash harness 双轮运行 16/16 场景通过；实际 SIGKILL 覆盖临时文件、原子 rename、SQLite 事务、processing 恢复、Hash、解析、索引和损坏输入队列，结果已写入 `docs/spike-results.md` |
| T08 Spike 决策闸门 | DONE | T08 复审修复完成：损坏 OOXML 正确分类、PDF.js 6.2.108 安全处置、刷新核对取代 WPS 极端场景矩阵、机器门禁 23/23；等待新的 Sol 复审，未进入 T09 |
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
