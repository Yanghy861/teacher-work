# Luna Max 长期实施 Goal

## 使用方法

先在 Codex 中选择 **Luna Max**，确认当前工作区为同一个 Local checkout `D:\teacher_work`，然后把下面整个 `/goal` 内容作为一个 Goal 提交。每次运行只推进到下一个 Sol 审核点；Sol 审核通过后，再次提交同一个 Goal 继续下一段。不要使用独立 Worktree，不要额外附加“顺便优化”等要求。

## 可直接提交的 Goal

```text
/goal 继续完成 D:\teacher_work 中“教师工作台 V1”的实现，严格按照仓库内 T01–T42 的顺序逐项自行实现和验证；本次只推进到下一个尚未通过的 Sol 审核点，完成该审核点任务后记录证据、标记 AWAITING_REVIEW 并停止，绝不跨过审核点。Sol 将审核状态改为 PASS 后，下次使用同一 Goal 从状态表继续，最终直到 T42、最终 Sol 审核与完整 V1 Definition of Done 有可复现证据地通过。遇到真实样本、Office/WPS 人工操作、API 凭据、系统权限或产品决策等外部条件时准确记录阻塞并停止，绝不跳过、伪造或降低验收标准。

开始前必须完整阅读：
1. AGENTS.md
2. implementation-tasks/GLOBAL_CONSTRAINTS.md
3. implementation-tasks/TASK_INDEX.md
4. implementation-tasks/STATUS.md
5. implementation-tasks/TRACEABILITY.md
6. implementation-tasks/SOL_REVIEW_STATUS.md
7. implementation-tasks/VERSION_CONTROL.md
8. 教师工作台_V1_R3_产品与技术实施规格.md（只用于核对规格歧义，不重新拆任务）

Sol 审核点依次为：T03、T08、T15、T20、T24、T32、T33、T38、T40、T42。审核区间分别为 T01–T03、T04–T08、T09–T15、T16–T20、T21–T24、T25–T32、T33、T34–T38、T39–T40、T41–T42。

持续执行循环：
1. 先按 VERSION_CONTROL.md 检查 Git：必须是 `D:\teacher_work` 的 `main` 分支，并存在 `checkpoint-T00`；运行 `git status --short --branch` 与最近提交检查。若发现被中断的当前任务成果，保留并从状态表中的最小未完成任务继续，绝不 reset/clean/覆盖；若存在无法解释或无法安全分离的改动，准确记录并停止。
2. 再检查 SOL_REVIEW_STATUS.md：若最近已完成的审核点为 `AWAITING_REVIEW`，立即停止，不修改代码；若为 `CHANGES_REQUIRED`，只阅读对应 Sol 报告、修复该审核区间内的问题并重新验证，按 Git 协议提交修复，随后生成新候选 SHA、改回 `AWAITING_REVIEW` 再次停止；只有前一审核点为 `PASS` 时才能进入下一段。Luna 永远不得把审核状态改为 `PASS` 或创建通过标签。
3. 以 TASK_INDEX.md 的编号顺序和 STATUS.md 的状态为准。每次只选择“编号最小、状态不是 DONE、全部前置任务已 DONE”的一个 Txx；同一时刻最多一个任务为 IN_PROGRESS。
4. 开始该任务前，完整阅读对应 implementation-tasks/tasks/Txx-*.md、它明确列出的前置产物，以及相关现有代码/测试；从 T08 起，解析、搜索、文件监听必须服从 docs/spike-results.md 与已通过 ADR。
5. 将该任务标为 IN_PROGRESS。只实现当前任务，保留已有修改，不提前实现后续任务，不加入 Later 能力，不做无关重构，不自动 push、添加远程、发布或迁移真实教学资料。
6. 先建立或补充能证明本任务验收条件的自动测试/故障注入，再完成最小、可读、可维护的实现。真实验证不可由纯 mock 替代时，必须执行真实验证或标记阻塞。
7. 完成后运行任务要求的相关测试、TypeScript typecheck、lint；影响构建或打包时运行 production build/packaging；涉及 UI、Office/WPS、崩溃恢复、备份恢复时执行任务要求的真实或人工验收。任何失败都先在当前任务范围内定位并修复，然后重新运行，不能把失败留给下一任务。
8. 只有全部验收证据齐全时，才把任务改为 DONE，并在 implementation-tasks/GOAL_PROGRESS.md 追加任务记录。随后按 VERSION_CONTROL.md 只暂存当前任务相关文件，审查 staged diff，创建 `task(TXX): <任务名称>` 本地提交；不得把秘密、真实资料、运行库、构建产物或无关改动纳入提交。若该任务不是 Sol 审核点，提交成功后立即进入下一任务。
9. 若完成的任务是 T03、T08、T15、T20、T24、T32、T33、T38、T40 或 T42：先完成该任务提交；再取 `git rev-parse HEAD` 作为候选 SHA，填入 SOL_REVIEW_STATUS.md 并把状态改为 `AWAITING_REVIEW`；在 GOAL_PROGRESS.md 写明审核区间、验证证据、候选 SHA 与建议重点；创建 `review(TXX): request Sol review` 送审元数据提交，确认无未解释改动后立即停止，不开始下一任务。只有 Sol 可改为 `PASS` 并创建 `checkpoint-TXX-pass` 标签。
10. T08、T20、T32、T38、T42 同时是产品硬闸门。闸门未通过时不得继续下一阶段；闸门只能修复本阶段缺陷，不能扩展范围。
11. 若当前任务因真实外部条件阻塞：先保留不会伪造结果的安全工具、测试框架或文档；把 STATUS.md 中该任务改为 BLOCKED；在 GOAL_PROGRESS.md 写明已经完成什么、缺少什么、用户只需执行的最小解阻动作以及恢复后应从哪个任务继续。若这些变更可安全独立暂存，则按 VERSION_CONTROL.md 创建 `blocked(TXX): <原因摘要>` 本地提交；随后停止 Goal，不得改做依赖它的后续任务。

全程遵守：Local-first；Renderer 不直接访问 SQLite、任意文件系统或秘密；managed 文件物理路径与课程树解耦；业务写入事务化；正式文件采用临时文件加原子重命名；搜索索引可删除重建；解析、Hash 和批量索引不得阻塞 Electron Main；API Key 不得明文落盘、进日志或进入备份；AI 输出只保存为草稿且不覆盖老师原资料；V1 禁止向量搜索、OCR、通用 Agent/Workflow、课程继承同步、文件去重、AI 生成 PPT 等 Later 能力。

只有满足以下任一条件才停止：
A. T42 标为 DONE，T01–T42 全部 DONE，完整测试/typecheck/lint/build/Windows 验收通过，并且 docs/v1-acceptance.md 对“管资料、找资料、AI 备课、安全”四组 DoD 给出可复现证据；
B. 出现上述真实外部阻塞，已按规则标为 BLOCKED 并写出精确解阻步骤；
C. 继续需要用户授权的破坏性操作、秘密、付费调用或会改变 V1 产品方向的决定。
D. 到达下一个 Sol 审核点，已完成对应任务提交，记录候选 SHA，将其标为 AWAITING_REVIEW，并完成 `review(TXX): request Sol review` 交接提交；这是正常的分段停止，不是项目完成。

不要只重新规划、复述文档或给建议；现在从状态表确定第一个可执行任务并开始修改、测试和验证。
```

## 这个 Goal 的完成定义

- 分段完成：到达下一个 Sol 审核点，完成任务提交与送审提交、记录候选 SHA 并标为 `AWAITING_REVIEW`，等待 Sol 审核后再次提交同一 Goal；
- 项目完成：`T01–T42` 全部为 `DONE`、T42 的 Sol 审核为 `PASS`，且 `docs/v1-acceptance.md` 有完整证据；
- 合理暂停：某任务为 `BLOCKED`，`GOAL_PROGRESS.md` 已写清最小解阻动作；
- 不算完成：只生成计划、只写代码未测试、跳过阶段闸门、用 mock 冒充真实 Office/文档/恢复验证，或把未通过项改写成 Later。
