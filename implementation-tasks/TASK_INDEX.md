# 42 项任务索引

默认严格按编号执行。即使某些任务技术上可并行，也建议个人开发先顺序完成，以免多个 Luna Max 会话同时改 Migration、IPC 或共享类型。

| 任务 | 前置 | 核心产物 |
|---|---|---|
| [T01](tasks/T01-project-scaffold.md) | 无 | Electron/React/TS 骨架 |
| [T02](tasks/T02-workspace-sqlite-foundation.md) | T01 | 工作区路径、SQLite Migration |
| [T03](tasks/T03-secure-ipc-observability.md) | T01–T02 | 安全 IPC、错误与日志边界 |
| [T04](tasks/T04-spike-document-parser.md) | T01–T03 + 真实样本 | 文档解析证据 |
| [T05](tasks/T05-spike-chinese-math-search.md) | T04 + 真实语料 | 中文/数学搜索证据 |
| [T06](tasks/T06-spike-office-wps-watcher.md) | T01–T03 + 真机 Office/WPS | 保存事件证据 |
| [T07](tasks/T07-spike-crash-recovery.md) | T01–T03 | 强杀恢复证据 |
| [T08](tasks/T08-spike-decision-gate.md) | T04–T07 | ADR 与技术决策闸门 |
| [T09](tasks/T09-nodes-data-layer.md) | T08 | nodes Migration/Repository |
| [T10](tasks/T10-node-service.md) | T09、T03 | NodeService 与 IPC |
| [T11](tasks/T11-sidebar-tree-ui.md) | T10 | 受控左侧树 UI |
| [T12](tasks/T12-course-period-lesson.md) | T11 | 班课/一对一/阶段/课次 |
| [T13](tasks/T13-students-links-notes.md) | T10、T12 | links、学生与记录 |
| [T14](tasks/T14-files-data-storage-resolver.md) | T09、T08 | files 数据层与路径解析 |
| [T15](tasks/T15-managed-file-operations.md) | T14、T07 | managed 原子文件操作 |
| [T16](tasks/T16-material-library-isolation.md) | T11、T12、T15 | 素材库与副本隔离 |
| [T17](tasks/T17-external-roots.md) | T14、T15、T08 | external root 扫描/重定位 |
| [T18](tasks/T18-stable-managed-file-change.md) | T06、T15 | 稳定变化领域事件 |
| [T19](tasks/T19-file-facing-pages.md) | T13、T16–T18 | 课次/素材/附件文件 UI |
| [T20](tasks/T20-phase1-gate.md) | T09–T19 | Phase 1 验收闸门 |
| [T21](tasks/T21-search-storage-state-queue.md) | T20、T05、T08 | 搜索库/状态/队列数据层 |
| [T22](tasks/T22-document-parser-md-txt.md) | T21、T04、T08 | Parser Adapter + MD/TXT |
| [T23](tasks/T23-normalizer-tokenizer-fts.md) | T21–T22、T05、T08 | Normalizer/Token/FTS 内核 |
| [T24](tasks/T24-background-index-workers.md) | T21–T23、T07–T08 | 后台 Worker 与 Index Writer |
| [T25](tasks/T25-search-service.md) | T24、T10、T13、T17 | 统一 SearchService |
| [T26](tasks/T26-search-progress-ui.md) | T25 | 搜索页与持续进度 |
| [T27](tasks/T27-pdf-parser.md) | T22、T24、Spike ADR | PDF Parser |
| [T28](tasks/T28-docx-parser.md) | T22、T24、Spike ADR | DOCX Parser |
| [T29](tasks/T29-pptx-parser.md) | T22、T24、Spike ADR | PPTX Parser |
| [T30](tasks/T30-xlsx-parser.md) | T22、T24、Spike ADR | XLSX Parser |
| [T31](tasks/T31-incremental-reindex-recovery.md) | T18、T21–T30 | 增量/全量重建与恢复 |
| [T32](tasks/T32-phase2-gate.md) | T21–T31 | Phase 2 验收闸门 |
| [T33](tasks/T33-settings-secure-api-key.md) | T32 | 设置与安全秘密存储 |
| [T34](tasks/T34-ai-gateway.md) | T33 | AI Gateway |
| [T35](tasks/T35-candidates-context-builder.md) | T25–T26、T34 | 候选资料与 ContextBuilder |
| [T36](tasks/T36-ai-runs-lecture-flow.md) | T35、T13 | 讲义闭环与 ai_runs |
| [T37](tasks/T37-exercises-homework-recovery.md) | T36 | 例题/作业/步骤恢复 |
| [T38](tasks/T38-phase3-gate.md) | T33–T37 | Phase 3 验收闸门 |
| [T39](tasks/T39-consistent-backup-manifest.md) | T38、T15 | 一致性备份与 manifest |
| [T40](tasks/T40-validate-restore-new-workspace.md) | T39、T31、T02 | 校验与新工作区恢复 |
| [T41](tasks/T41-startup-integrity-backup-security.md) | T39–T40、T31 | 启动检查与备份安全 |
| [T42](tasks/T42-windows-release-v1-gate.md) | T01–T41 | Windows 正式交付总闸门 |

