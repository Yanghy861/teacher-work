# 教师工作台 V1 · Git 版本控制协议

## 1. 授权与范围

- 用户已明确要求本项目使用版本控制，授权 Luna 与 Sol 在本仓库创建**本地提交和审核标签**；
- 默认分支为 `main`，Luna 与 Sol 都在同一个 Local checkout：`D:\teacher_work` 中顺序工作；
- 禁止代理自动添加远程仓库、`push`、发布、改写历史或上传真实教学资料；远程备份必须由用户另行授权；
- 禁止自动执行 `reset --hard`、`clean`、强制 checkout、rebase、强制 tag 覆盖或其他可能丢失成果的 Git 操作。

## 2. 仓库基线

- `checkpoint-T00` 指向只包含产品规格、实施任务包、代理约束和版本控制规则的初始基线；
- 本仓库是在 T01 已经开始后补建 Git。紧随 T00 的 `wip(T01)` 提交只用于保存被中断的项目骨架，不代表 T01 已通过验收；
- Luna 恢复时必须从 `STATUS.md` 判断任务状态，并检查已有实现，不得因存在 WIP 提交就直接把任务标成 `DONE`。

## 3. Luna 的逐任务提交协议

每个 Txx 都执行以下流程：

1. 开始前运行 `git status --short --branch`，确认位于 `main`，且不存在未解释的冲突或其他任务遗留修改；
2. 若存在中断留下的当前任务改动，先阅读并保留这些成果，从当前任务继续；不得回滚或覆盖；
3. 只修改当前任务文件。完成全部自动、真实或人工验收后，更新 `STATUS.md` 和 `GOAL_PROGRESS.md`；
4. 检查 `.gitignore`，确保 `.env`、API Key、证书、日志、本地数据库、真实教学资料、工作区、备份和构建产物没有进入暂存区；
5. 只用路径明确的 `git add -- <files...>` 暂存当前任务相关文件，禁止使用无法审计范围的 `git add .` 或 `git add -A`；
6. 提交前运行 `git diff --check`、`git diff --cached --stat` 和 `git diff --cached`，确认没有秘密、生成物或无关改动；
7. 创建一个本地任务提交，格式为 `task(TXX): <简短任务名称>`。只有任务验收齐全并已标 `DONE` 才能使用此格式；
8. 不自动 push。未能把当前任务与无关改动安全分离时，记录为 `BLOCKED`，不得把别人的改动一起提交。

任务提交本身的 SHA 通过 `git log --grep="task(TXX):"` 可追溯，不要求在同一个提交内容中自引用 SHA。

## 4. Luna 的审核交接协议

到 T03、T08、T15、T20、T24、T32、T33、T38、T40 或 T42 时：

1. 先完成该 Txx 的 `task(TXX)` 提交；
2. 运行 `git rev-parse HEAD`，把结果作为**候选提交 SHA**；
3. 在 `SOL_REVIEW_STATUS.md` 对应行写入候选 SHA，并把状态改为 `AWAITING_REVIEW`；在 `GOAL_PROGRESS.md` 写清审核区间、验证证据、候选 SHA 和建议重点；
4. 只暂存上述审核交接文件，创建 `review(TXX): request Sol review` 本地提交；
5. 再次确认工作区无未解释改动，然后立即停止，不开始下一任务；
6. Luna 永远不得创建 `checkpoint-TXX-pass` 标签，也不得把审核状态改为 `PASS`。

## 5. Sol 的独立审核协议

- T03 的审核基线为 `checkpoint-T00`；其余审核基线为上一个 `checkpoint-TNN-pass` 标签；
- Sol 必须验证候选 SHA 存在且属于当前历史，并审核 `<上一通过标签>..<候选 SHA>`；还应检查候选 SHA 之后的审核交接提交，但不得把它误当作产品实现；
- Sol 默认不修改产品代码，只能运行检查，写审核报告、状态和审核元数据；
- 审核通过：写 `docs/reviews/TXX-sol-review.md`，把状态改为 `PASS`，创建 `review(TXX): pass` 提交，并在该审核提交上创建带说明的标签 `checkpoint-TXX-pass`；
- 审核不通过：写报告，把状态改为 `CHANGES_REQUIRED`，创建 `review(TXX): changes required` 提交，不得创建或移动通过标签；
- 缺候选 SHA、范围不可复现、测试证据不足、工作区含无法解释的产品改动时，不得给 `PASS`。

## 6. 修复与恢复

- `CHANGES_REQUIRED` 后，Luna 只修复当前审核区间，重新验证并创建 `fix(TXX-review): <摘要>` 提交；随后生成新的候选 SHA、重新标记 `AWAITING_REVIEW` 并创建新的送审提交；
- 任务被中断时，恢复者先查看 `git status`、`git log --oneline --decorate -n 20`、状态表和进度日志；保留已完成成果，从最小未完成任务继续；
- 回退到某个通过点属于破坏性或方向性操作，必须先获得用户授权。审核标签只提供可恢复锚点，不授权代理自行回退。

## 7. 提交边界

可以提交：源代码、测试、锁文件、构建配置、脱敏测试夹具、规格、ADR、状态表、进度日志和审核报告。

不得提交：真实学生/教学资料、实际工作区、SQLite 运行库、搜索索引、备份、API Key、`.env`、证书、日志、临时文件、`node_modules`、`out`、`dist`、coverage 或安装包。
