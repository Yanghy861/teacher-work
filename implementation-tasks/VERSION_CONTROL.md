# 教师工作台 Lean V1 · Git 版本控制协议

## 1. 授权与禁止事项

- 用户已授权在 `D:\teacher_work` 的 `main` 分支创建可审计的本地提交和审核标签；
- Luna 与 Sol 使用同一个 Local checkout，顺序工作；
- 禁止代理自动添加远程、push、发布、改写历史、提交真实教学资料或秘密；
- 禁止自动执行 `reset --hard`、`clean`、强制 checkout/rebase、覆盖标签或其他可能丢失成果的命令。

## 2. 历史基线与活动链

- `checkpoint-T00`、`checkpoint-T03-pass` 及 T01–T08 的提交历史继续有效；
- T08 通过后创建 `checkpoint-T08-pass`；
- 旧 T09–T42 不再产生任务提交；活动链只使用 L01–L12；
- 后续审核标签依次为 `checkpoint-L04-pass`、`checkpoint-L07-pass`、`checkpoint-L10-pass`、`checkpoint-L12-pass`。

## 3. Luna 的里程碑提交

每个 Lxx 里程碑执行：

1. 开始前检查 `git status --short --branch` 和最近提交；保留被中断的已有成果，不 reset/clean；
2. 只修改当前里程碑及必要的状态/进度文件；
3. 普通里程碑运行相关测试、typecheck、lint；审核闸门额外运行全量测试和 production build；
4. 检查 `.gitignore`，确保 `.env`、Key、真实资料、运行数据库、索引、备份、日志、临时文件、`node_modules` 和构建产物未进入暂存区；
5. 使用路径明确的 `git add -- <files...>`，不使用 `git add .` 或 `git add -A`；
6. 提交前运行 `git diff --check`、`git diff --cached --stat`，并审阅完整 staged diff；
7. 验收齐全且状态为 `DONE` 时提交 `lean(LXX): <简短名称>`；真实阻塞可提交 `blocked(LXX): <原因>`；
8. 不自动 push。无法把当前成果与不明改动安全分离时停止并说明。

## 4. 审核交接

审核点为 T08、L04、L07、L10、L12：

1. 先完成产品/里程碑提交；
2. 取该提交的完整 SHA 作为候选；
3. 在 `SOL_REVIEW_STATUS.md` 写入候选并设为 `AWAITING_REVIEW`，在 `GOAL_PROGRESS.md` 写交接证据；
4. 创建 `review(T08): request Sol review` 或 `review(LXX): request Sol review` 元数据提交；
5. 确认无未解释改动后停止，不进入下一段；
6. Luna 不得写 `PASS`，不得创建通过标签。

审核基线：T08 使用 `checkpoint-T03-pass`；L04 使用 `checkpoint-T08-pass`；L07 使用 `checkpoint-L04-pass`；L10 使用 `checkpoint-L07-pass`；L12 使用 `checkpoint-L10-pass`。

## 5. Sol 的独立审核

- 验证候选 SHA、审核基线与工作区状态，审核 `<上一通过标签>..<候选 SHA>`，并查看候选后的送审元数据；
- 按当前 Lean 任务及适用风险复现关键检查，不得按已退役 T09–T42 的增强要求拒绝通过；
- 默认只审核，不修改产品代码；
- 通过时写报告、把状态设为 `PASS`、创建 `review(LXX): pass`（T08 使用 T08）提交，并在该审核提交创建对应 `checkpoint-*-pass` 带说明标签；
- 不通过时写报告、把状态设为 `CHANGES_REQUIRED`、创建 `review(...): changes required`，不得创建或移动通过标签。

## 6. 复审修复与恢复

- `CHANGES_REQUIRED` 后 Luna 只修复当前审核区间，提交 `fix(T08-review): <摘要>` 或 `fix(LXX-review): <摘要>`，重新验证并送审；
- 中断恢复先查看 Git、状态表、进度日志和审核状态，保留成果，从最小未完成里程碑继续；
- 回退到通过点需要用户明确授权；审核标签只提供锚点，不授权代理自行回退。

可提交：源代码、测试、锁文件、构建配置、脱敏测试夹具、规格、ADR、状态/进度和审核报告。

不得提交：真实学生/教学资料、实际工作区、SQLite 运行库、搜索索引、备份、API Key、`.env`、证书、日志、临时文件、依赖目录、构建产物或安装包。
