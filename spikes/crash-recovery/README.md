# T07 · 强杀与恢复实验器

该目录只操作 `D:\teacher_work\tmp\t07-crash-recovery` 下的合成临时数据。`run-harness.mjs` 为每个故障点启动一个 Node 子进程，收到明确 checkpoint 后用操作系统进程终止方式强杀，再在父进程中执行恢复检查；每次运行使用新的隔离目录，不删除既有实验结果。

## 运行

```powershell
node spikes/crash-recovery/run-harness.mjs `
  --output D:\teacher_work\spikes\crash-recovery\results\t07-crash-recovery.json `
  --repeat 2
```

`--root` 只能是仓库下固定的 `tmp/t07-crash-recovery`，报告只能写入本目录的 `results/`。报告保存匿名场景、故障点、强杀结果、恢复断言和统计，不保存路径、文件名、正文或完整 Hash。

覆盖的故障点：复制到临时文件、校验后原子 rename 前、SQLite 事务提交前、`processing` 已提交后、Hash 计算中、解析临时输出中、索引临时写入后以及损坏输入队列恢复。

生产建议与实际限制记录在 `docs/spike-results.md` 的 Spike D；该实验器不接入正式队列、索引器或真实用户工作区。
