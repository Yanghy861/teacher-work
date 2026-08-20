# T06 · Office/WPS 保存事件实验器

该目录只包含 Spike C 的实验器，不接入正式索引器。实验器使用 `chokidar@4.0.3` 监听指定目录，把文件变化转换为匿名事件和决策报告；报告只保留扩展名、事件类型、size、mtime、可读性、Hash 前缀和任务状态，不保存路径、文件名或正文。

## 运行

```powershell
node spikes/office-watcher/run-experiment.mjs `
  --directory D:\teacher_work\tmp\t06-wps-experiment `
  --label wps-12.1.0.28043-all-formats `
  --output D:\teacher_work\spikes\office-watcher\results\wps-12.1.0.28043-all-formats.json `
  --duration-ms 60000
```

可用参数包括 `--debounce-ms`、`--stable-samples`、`--stable-interval-ms`、`--task-duration-ms`、`--read-retry-ms` 和 `--read-retries`。实验结束后，工具会关闭 watcher，等待 debounce/任务完成，再对已见路径做最终只读快照。

## 实验结论

- Chokidar 是当前候选；Windows 上 rename 可能表现为 `unlink` + `add`，不要把单一事件名当作跨平台契约。
- 推荐从 3 次 `size + mtime + SHA-256` 稳定采样、300–500ms debounce、100–200ms 可读重试开始。
- 同一匿名文件 ID 只有一个运行中任务；运行期间再次保存只安排一次 `task_recheck`。
- `fs.watch` 保留为后续对照候选。本 Spike 未把未实测的后端差异写成生产结论。
- WPS 自动恢复、大文件容量和保存中退出未在本轮稳定触发，因此没有相关支持承诺。
