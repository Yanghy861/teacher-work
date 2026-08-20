# T08 · 基础风险决策闸门

**前置：** T04、T05、T06、T07 均为 DONE。  
**目标：** 把四项 Spike 的证据转成生产实现约束；这是进入 Phase 1 的硬闸门。

## 实现范围

- 审核 `docs/spike-results.md` 是否包含样本、方法、指标、失败与可复现命令，而非只有结论；
- 为文档解析、中文搜索、Office/WPS watcher、崩溃恢复各写一份简短 ADR；
- 冻结：采用/拒绝的库及版本范围、DocumentParser 结果契约、Normalizer/TokenExtractor 规则、watcher 参数策略、任务恢复状态机；
- 核对所有生产候选的许可证、维护状态、Electron 打包与 Windows 兼容证据；
- 把仍不确定但不阻塞 V1 的内容放入 Later/known limitations；真正阻塞正确性的内容必须退回对应 Spike；
- 更新项目依赖，但不借机实现 Phase 1 业务功能。

## 不做

不以“先写再说”跳过失败 Spike，不引入大型搜索/Agent/OCR 作为补救，不开发树或文件 UI。

## 验收

- 四份 ADR 都能让后续任务直接选择实现方案，不需要重新猜测；
- `docs/spike-results.md` 中不存在未解释的“通过”；
- typecheck、lint、测试、production build 通过；
- 任一关键证据不足则 T08 标 `BLOCKED`，Phase 1 不得开始。

