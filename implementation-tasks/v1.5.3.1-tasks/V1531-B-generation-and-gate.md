# V1531-B · 模式化生成与最终回归

**前置：** V1531-A `DONE`。

## 范围

- 单文件和整课分别生成可审阅方案，明确基线与补充参考；
- 单文件 sources[0] 固定为目标；整课自动使用当前正式版或进入时已有材料；
- 新建备课才显示生成讲义/例题/作业；整课生成一份完整课件 Markdown；
- 使用既有 `aiMetadata.requirement + sources` 恢复模式、目标和比较基线；旧草稿兼容；
- 模式化发布确认文案、文本预算和截断提示；
- 更新 `docs/v1.5.3-acceptance.md`，追加 V1.5.3.1 证据，不改写 V153 历史。

## 验证

- 全量 `npm test`、typecheck、lint、production build、`git diff --check`；
- 中继式 AI 隔离流程：修改这份 → 方案 → 完整修订稿 → 对比 → 发布；整课重做 → 方案 → 完整课件 → 发布；新建备课与工作副本恢复回归；
- 产品负责人确认前不创建 `checkpoint-V1.5.3-pass`；不运行 portable/installer，不自动 push。

## 完成记录

- 单文件与整课分别使用模式化方案 Prompt；正文读取按“基线优先、补充参考使用余量”执行，并显示截断提示；
- 单文件目标与整课自动基线写入既有 `aiMetadata.requirement` 可读标记，结合有序 sources 恢复模式、要求、Skill、目标、参考与对比基线；旧无标记草稿保持兼容；
- 整课固定生成一份 `lecture` 类型完整 Markdown，明确包含讲义、典型例题、课堂练习和课后作业；发布确认与节点名称按模式区分；
- 隔离 Electron 中继流程完成“第 1 版 → 单文件修订第 2 版 → 整课重做第 3 版”，SQLite 完整性、版本序列、节点状态、模式标记与唯一来源顺序全部通过；
- 修复既有发布版本匹配未包含 `.md` 后缀导致重复第 1 版的问题，补充连续发布第 2、3 版服务回归；未新增 Service、IPC、schema 或 migration；
- 最终门：55 files / 205 tests passed，另 1 file / 1 test skipped；typecheck、lint、production build、`git diff --check` 通过。

**状态：** `DONE / AWAITING_PRODUCT_CONFIRMATION`。产品负责人确认前不创建 `checkpoint-V1.5.3-pass`。
