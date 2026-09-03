# V17-D · 题库自动选题与双版输出（D30/D31）

**状态：** `DONE`（2026-09-03）

## 范围

- draft-panel 参考区新增"参考题库（AI 自动选题）"开关：未安装题库（`QuestionBankSummary.installed === false`）置灰提示"先在题库页导入 .tqbank"；开启时可选目标题数（默认 5，1..20）与"同时生成学生版"；
- 方案确认卡扩展（过目步）：显示检索条件（AI 计划原样：tag/年级/难度/题数）+ 候选题列表（题号/题干预览/难度/含图标记，数据来自方案阶段已执行的阶段一+二）；两项反馈：**"调整后重新选题"**（自然语言如"再难一点/去掉尺规作图"，追加进 requirement 重新出计划）与**逐题剔除**（勾掉不要的题，剔除集合固化进确认请求）；确认生成按剔除后候选集执行；
- 生成执行：确认请求带 `bankPlan` + `dualVersion`；选题写作复用 V1.6 流式链路（思考秒表 + 逐字上屏照常）；教师版 prompt 增选题规则（只能从候选中选、不得杜撰改编、每题讲解处标注 [选自题库：tag/难度]、答案与解析集中文末区块）；
- 预算交互：候选块字符数计入参考占用（"题库候选 N 题 · M 字"）；总预算超 30,000 字沿用 D25 确认弹窗（列名含"题库候选 N 道（部分纳入 M 道）"）；
- 收件箱双版并列（教师版/学生版徽标）；发布：`publishLessonDraftVersion` 命名分支扩展——学生版 `讲义 · 第 N 版 · 学生版.md`；学生版纯题面（含 `$…$` 公式，阅读器 KaTeX 沿用）。

## 不做

- 不做自动组卷/错题本/题库写路径；不做含图题进上下文（候选标注"含图"，老师手动经既有 copyToLesson）；
- 不做学生版本地规则剥离；不做 function-calling 工具循环；不做题库多快照换版机制。

## 验收

- 编排中继测试（fake QuestionBankService + fake provider）：计划→检索→候选注入→剔除→生成请求序、双版两次请求与 studentNoteId 关联、发布命名；
- 静态渲染钉测：开关（未安装置灰）、过目卡（计划/候选/剔除/调整按钮）、双版徽标；
- 既有生成流回归全绿（不带 bankPlan 的请求行为与 V1.6 完全一致）；
- typecheck、lint；完成后更新 STATUS/GOAL_PROGRESS 并提交 `v1.7(V17-D): <摘要>`。

## 完成记录（2026-09-03）

- **合同**：`GenerateDraftRequest.bankQuestionIds?`（剔除后的候选题 ID 集，1..60 守卫）；`DraftNoteMetadata.variant?: 'teacher' | 'student'`（双版留痕，缺省单版）。
- **shared**：`src/shared/draft-bank-preview.ts` 集中 `bankPlanToSearchRequest` / `renderQuestionForContext` / `buildBankCandidateBlock` / `fitBankCandidateCount` / `DRAFT_BANK_CANDIDATE_MULTIPLIER`；Main 候选注入与 Renderer 过目步共用（所见即所发），draft-service 删除本地副本并 re-export 兼容。
- **Main**：`buildBankCandidates(plan, budgetChars, confirmedQuestionIds?)`——剔除集直接取代检索；空集抛“候选题已被全部剔除”；dualVersion 两 note 分别 variant='teacher'/'student'；`publishLessonDraftVersion` 学生版 `讲义 · 第 N 版 · 学生版.md` 独立版本链（版本号只数同模式文件）。
- **Renderer**：参考区题库开关（未安装置灰“先在题库页导入 .tqbank”）、目标题数 1–20 默认 5、学生版开关；startImprovePlan 串行 runBankSelection（ai:request-text 计划 → question-bank:search-questions 检索 → 逐题 getQuestion）；方案确认卡过目分区（计划原样展示/候选列表/逐题剔除/自然语言调整重检索追加 requirement）；confirmPlanAndGenerate 固化 bankPlan+bankQuestionIds+dualVersion 并清选题状态；D25 预算弹窗加题库候选行；修改记录/标题/收件箱教师版学生版徽标。零新 IPC。
- **不做确认**：未做含图题进上下文（候选仅标“含图”）、未做本地学生版剥离、未做 function-calling 工具循环——与设计基准一致。
- **测试**：`tests/v17-d-bank-selection.test.ts` 11 例新增；既有生成流/发布回归全绿；全量 76 files / 360 tests、typecheck、lint 通过。
