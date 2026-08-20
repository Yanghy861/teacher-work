# Lean V1 任务索引

## 历史基线（保留有效）

| 任务 | 状态/作用 |
|---|---|
| [T01](tasks/T01-project-scaffold.md)–[T03](tasks/T03-secure-ipc-observability.md) | 已完成的应用骨架、SQLite 与安全 IPC 基线 |
| [T04](tasks/T04-spike-document-parser.md)–[T08](tasks/T08-spike-decision-gate.md) | 已完成的解析、搜索、刷新与恢复 Spike；T08 等待 Sol 复审 |

`tasks/T09-*` 至 `tasks/T42-*` 已由产品负责人于 2026-08-20 退役。文件只用于追溯旧设计，不得再作为 Luna 的执行入口或验收依据。

## 当前唯一有效的后续实施链

| 里程碑 | 前置 | 核心产物 | 审核 |
|---|---|---|---|
| [L01](lean-tasks/L01-core-data-tree.md) | T08 PASS | 核心数据、课程/学生/课次与基础树 UI | |
| [L02](lean-tasks/L02-managed-files-materials.md) | L01 | managed 文件导入、素材与课次副本 | |
| [L03](lean-tasks/L03-file-pages-refresh.md) | L02 | 文件页面、打开与刷新核对 | |
| [L04](lean-tasks/L04-phase1-gate.md) | L01–L03 | “管资料”阶段验收 | Sol |
| [L05](lean-tasks/L05-search-core.md) | L04 PASS | search.db、Normalizer 与基础检索 | |
| [L06](lean-tasks/L06-unified-parser-worker.md) | L05 | 统一 Parser + 单顺序 Worker | |
| [L07](lean-tasks/L07-search-ui-rebuild-gate.md) | L05–L06 | 搜索 UI、简单重建与阶段验收 | Sol |
| [L08](lean-tasks/L08-secure-ai-gateway.md) | L07 PASS | 安全 Key 与兼容 AI Gateway | |
| [L09](lean-tasks/L09-context-draft-generation.md) | L08 | 选资料并独立生成三类草稿 | |
| [L10](lean-tasks/L10-ai-gate.md) | L08–L09 | “AI 备课”阶段验收 | Sol |
| [L11](lean-tasks/L11-backup-restore.md) | L10 PASS | 空闲态备份与新目录恢复 | |
| [L12](lean-tasks/L12-windows-final-gate.md) | L11 | Windows 交付与 Lean V1 总验收 | Sol |

必须按编号顺序执行；同一时刻最多一个里程碑为 `IN_PROGRESS`。审核点未 `PASS` 时不得进入下一段。
