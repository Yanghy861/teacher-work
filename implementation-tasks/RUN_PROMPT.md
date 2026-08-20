# Luna Max 单任务提示词

把下面内容复制给 Luna Max，并替换两处任务编号/文件名：

```text
请实现教师工作台 V1 的任务 TXX：implementation-tasks/tasks/TXX-name.md。

执行规则：
1. 先完整阅读 AGENTS.md、implementation-tasks/GLOBAL_CONSTRAINTS.md、implementation-tasks/VERSION_CONTROL.md、当前任务文件，以及任务明确列出的前置产物；原产品规格只用于核对歧义。
2. 检查 implementation-tasks/STATUS.md；前置任务或阶段闸门未完成时停止并说明，不能跳过。
3. 只实现 TXX，不提前做后续功能，不加入 Later 能力，不做无关重构。
4. 保留工作区现有修改；开始前检查相关代码和测试。
5. 完成任务要求的自动测试、类型检查、lint；需要时执行 production build 和人工验证。
6. 只有验收证据齐全时才把 TXX 标为 DONE；环境或真实样本不足时标为 BLOCKED，并给出最小解阻步骤。
7. 验收齐全并更新状态与进度后，只暂存当前任务相关文件，检查 staged diff，创建 `task(TXX): <任务名称>` 本地提交；不得自动 push。
8. 最终汇报：结果、关键设计、修改文件、验证命令与结果、本地提交 SHA、未解决风险、下一任务可依赖的接口。

现在直接执行，不要把整份实施重新规划一遍，也不要只给建议。
```
