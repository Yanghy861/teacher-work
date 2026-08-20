# T24 · 后台解析/Hash/索引协调与受控 Writer

**前置：** T21–T23、T07、T08。  
**目标：** 让大文件解析和大批量索引离开 Electron Main，并保持单一、可控的 SQLite 写入路径。

## 实现范围

- 使用原生 `worker_threads` 建立 parse/hash/index build worker；任务消息为版本化、可序列化 schema；
- Main 的 TaskCoordinator 只调度、限并发、取消和汇总，不执行 CPU 密集解析/Hash；
- worker 返回结构化结果，单一 Index Writer 批量、幂等地写 search.db；禁止多个 worker 无约束并发写库；
- 每个 file ID 同时最多一个等待/执行任务；队列支持优先级但 V1 不做通用任务框架；
- 任务开始/完成/失败都更新 T21 的持久状态；worker 崩溃只影响当前项；
- 支持优雅退出与强杀后的重启恢复；不要让安全性依赖退出弹窗；
- 增加事件循环延迟/Renderer 心跳测试，证明大批量任务时 Main 仍可响应短 IPC。

## 不做

不引入 LangChain、BullMQ、外部服务器或不必要的通用 Worker Pool 抽象。

## 验收

- 10,000+ chunk/大文件测试时 UI 心跳与普通 IPC 无长时间假死；
- writer 故障、worker crash、取消、重复投递均不会产生半文档或重复 chunk；
- processing 状态在异常重启后回 pending；
- 覆盖原规格测试 21 的基础证据。

