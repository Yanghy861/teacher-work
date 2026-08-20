# T06 · Office/WPS 刷新核对与可选事件实验器

该目录只包含 Spike C 的实验器，不接入正式索引器。V1 以刷新核对保证正确性，watcher 只负责更快地标 dirty；因此 T06 不再要求穷举 WPS 自动恢复、大文件保存和保存中退出。

## 运行

先运行不依赖 Office/WPS UI、也不依赖 watcher 事件的刷新核对探针：

```powershell
node spikes/office-watcher/run-reconciliation-probe.mjs
```

探针验证启动、工作台焦点返回、重新打开和手动刷新都能在 watcher 完全漏报时发现新 Hash；Hash 未变不重建，同一新 Hash 的并发触发只合并为一个决定。

下面的 watcher 实验器仅用于记录一个代表性真实 Office/WPS 操作的事件特征。它使用 `chokidar@4.0.3` 监听指定临时目录，把变化转换为匿名事件和决策报告；报告只保留扩展名、事件类型、size、mtime、可读性、Hash 前缀和任务状态，不保存路径、文件名或正文。

```powershell
node spikes/office-watcher/run-experiment.mjs `
  --directory D:\teacher_work\tmp\t06-wps-experiment\docx-ordinary-save-r1 `
  --label "WPS Office" `
  --output D:\teacher_work\spikes\office-watcher\results\t08-remediation\docx-ordinary-save-r1.json `
  --scenario-id docx-ordinary-save-r1 `
  --action ordinary-save `
  --format docx `
  --round 1 `
  --expected-outcome "one stable content change yields exactly one rebuild decision" `
  --ready-file D:\teacher_work\tmp\t06-wps-experiment\docx-ordinary-save-r1.ready.json `
  --duration-ms 60000
```

每个报告只对应一个明确的 `scenario/action/format/round`。工具先对目录内已有目标文档建立稳定 Hash 基线，随后写出 `--ready-file`；只有看见 ready 标记后才可执行对应 WPS 操作。WPS 的锁文件和临时文件会进入匿名原始事件序列，但不会触发业务重建。可用参数包括 `--debounce-ms`、`--stable-samples`、`--stable-interval-ms`、`--task-duration-ms`、`--read-retry-ms` 和 `--read-retries`。实验结束后，工具会关闭 watcher，等待 debounce/任务完成，再对已见路径做最终只读快照。

每个可选报告仍只对应一个明确的 `scenario/action/format/round`，便于复核；但 T06/T08 门禁不要求 21 组合矩阵。已有 DOCX/PPTX/XLSX 普通保存与打开未改真机记录用于证明 WPS 能产生可读最终文件，自动化刷新探针用于证明漏报恢复和去重正确性。

## 实验结论

- Chokidar 是当前候选；Windows 上 rename 可能表现为 `unlink` + `add`，不要把单一事件名当作跨平台契约。
- 推荐从 3 次 `size + mtime + SHA-256` 稳定采样、300–500ms debounce、100–200ms 可读重试开始。
- 同一匿名文件 ID 只有一个运行中任务；运行期间再次保存只安排一次 `task_recheck`。
- `fs.watch` 保留为后续对照候选。本 Spike 未把未实测的后端差异写成生产结论。
- 自动恢复、大文件保存和保存中退出不属于 V1 的实时感知承诺，也不阻塞 T06/T08；未来若产品要承诺这些场景的即时更新或性能，再做专项实验。
