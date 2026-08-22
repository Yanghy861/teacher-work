# 教师工作台 V1 / V1.1 任务索引

## 历史基线（保留有效）

| 任务 | 状态/作用 |
|---|---|
| [T01](tasks/T01-project-scaffold.md)–[T03](tasks/T03-secure-ipc-observability.md) | 已完成的应用骨架、SQLite 与安全 IPC 基线 |
| [T04](tasks/T04-spike-document-parser.md)–[T08](tasks/T08-spike-decision-gate.md) | 已完成的解析、搜索、刷新与恢复 Spike；T08 Sol PASS |

`tasks/T09-*` 至 `tasks/T42-*` 已由产品负责人于 2026-08-20 退役。文件只用于追溯旧设计，不得再作为 Luna 的执行入口或验收依据。

## Lean V1 已完成链

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

L01–L12 均为 `DONE`，最终标签为 `checkpoint-L12-pass`。这些任务保持冻结，不因 V1.1 重新执行或改写状态。

## V1.1 当前唯一活动链

| 里程碑 | 前置 | 核心产物 | 验收 |
|---|---|---|---|
| [V11-01](v1.1-tasks/V11-01-external-library.md) | `checkpoint-L12-pass` | 单 external root、安全 lazy 资料树、折叠与打开 | 相关测试 |
| [V11-02](v1.1-tasks/V11-02-lesson-prep-materials.md) | V11-01 | 从课次进入备课、外部/素材复制为本课独立资料 | 相关测试 + UI 体验 |
| [V11-03](v1.1-tasks/V11-03-skills-prompt.md) | V11-02 | Skill、本次要求与固定 Prompt 组合 | 相关测试 |
| [V11-04](v1.1-tasks/V11-04-draftbox-preview-edit-save.md) | V11-03 | 草稿箱、同区预览编辑、重新生成与保存到课次 | 相关测试 |
| [V11-05](v1.1-tasks/V11-05-final-gate.md) | V11-01–V11-04 | V1.1 完整流程、V1 回归与 Windows portable | 最终验收 |

V11 任务必须按编号顺序执行；同一时刻最多一个里程碑为 `IN_PROGRESS`。V1.1 只有 V11-05 一个最终验收点。
