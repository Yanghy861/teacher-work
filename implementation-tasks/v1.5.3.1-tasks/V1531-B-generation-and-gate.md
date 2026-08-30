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
