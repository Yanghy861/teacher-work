# 教师工作台 V1：实现代理约束

本仓库的产品主规格是 `教师工作台_V1_R3_产品与技术实施规格.md`。实施任务位于 `implementation-tasks/`。

当用户指定某个 `Txx` 任务时：

1. 先阅读 `implementation-tasks/GLOBAL_CONSTRAINTS.md`、`implementation-tasks/VERSION_CONTROL.md`、该任务文件，以及它明确列出的前置任务产物；
2. 只完成当前任务，不顺手实现后续任务；
3. `T08`、`T20`、`T32`、`T38`、`T42` 是阶段闸门，未通过不得进入下一阶段；
4. `implementation-tasks/SOL_REVIEW_STATUS.md` 定义额外审核点；前一审核点不是 `PASS` 时，Luna 不得开始下一段任务，也不得自行把审核状态改为 `PASS`；
5. 从 `T08` 起，涉及解析、搜索和文件监听的实现必须服从 `docs/spike-results.md` 中已经验证的结论；
6. 完成后运行当前任务要求的测试、类型检查和构建，更新 `implementation-tasks/STATUS.md` 与 `implementation-tasks/GOAL_PROGRESS.md`，并按版本控制协议创建当前任务的本地提交；
7. 若真实前置条件不足，不得伪造通过结果。把状态标为 `BLOCKED`，写明缺什么、怎样补齐。

Git 硬规则：只允许按 `implementation-tasks/VERSION_CONTROL.md` 创建可审计的本地任务提交、审核提交和通过标签；不得自动 push、添加远程、提交秘密或真实教学资料，不得用破坏性 Git 命令丢弃现有成果。

全局硬规则：V1 范围冻结；Local-first；Renderer 不直接访问 SQLite、任意文件系统或秘密；managed 文件物理路径与课程树解耦；业务写入事务化；最终文件使用临时文件加原子重命名；搜索索引可删除重建；长解析、Hash 和批量索引不得阻塞 Electron Main；API Key 不得明文落盘、写日志或进入备份；AI 输出只保存为草稿，不覆盖老师原资料。
