# V16-B · AI 修改范围收口与参考预算 UX

**状态：** `DONE`（2026-09-02；门禁与产物见下）

## 范围

- 修改对象收口（D23）：单文件修改候选仅列应用内生成的 Markdown 文件（课件版本、修改节点）；外部 office/pdf 不出现于"修改这份"目标，入口置灰并提示"仅支持修改工作台生成的讲义/教案/作业；外部 Office 文档请用系统应用打开修改"；
- 无应用内版本的课次，"修改这份 / 整课重做"入口引导"先用 AI 生成第一版课件"；"AI 新建备课"入口保持现状；
- 参考预算（D25）：新常量 `DRAFT_MAX_REFERENCE_FILES = 10`、`DRAFT_MAX_SOURCE_FILES = 32`，`isGenerateDraftRequest` 增加 sources 长度守卫；
- 选择区实时显示每份字符数与累计"参考已占用 N / 30,000 字"；超 10 份禁止继续勾选；
- 方案阶段与确认生成共用同一预算纯函数模块（基线优先占用、参考按选择顺序分配）：预算耗尽时明确列出未纳入文件名并需老师确认，替代静默截断；
- 合同测试：sources 长度上限接受/拒绝、预算模块边界。

## 不做

- 不新增 IPC 通道；`buildContext` Main 侧截断兜底行为不变；
- 不做外部 office 文件 AI 修改通路、多文件"合成来源"元数据演进；
- 不改 `modification` 结构化键与发布/版本语义。

## 验收

- 相关测试、typecheck、lint，按风险补充 production build；
- 外部 docx 不再可被选为修改对象；超限列名提示可复现（预算模块纯函数测试钉死）；
- 完成后更新 STATUS/GOAL_PROGRESS 并创建 `v1.6(V16-B): <摘要>` 本地提交。

## 完成记录（2026-09-02）

- 合同：`draft-contracts.ts` 新增 `DRAFT_MAX_REFERENCE_FILES = 10`、`DRAFT_MAX_SOURCE_FILES = 32`；`isGenerateDraftRequest` 的 `sources` 长度守卫由 `1..100` 改为 `1..DRAFT_MAX_SOURCE_FILES`。
- 预算纯函数：新建 `src/shared/draft-reference-budget.ts`——`planDraftBudget(baseline, references, maxChars)`（基线优先占用、参考按选择顺序分配、部分纳入同时入 included/excluded 并给出 `baselineTruncated`）、`formatExcludedReferenceNames`、`canSelectMoreReferences`。
- D23 收口：`lesson-prep-context.ts` 新增 `isAppGeneratedCoursewareFile`（`text/markdown` 且匹配发布命名 ` · 第 N 版.md`，复用既有 `lessonVersionPattern`）；draft-panel 单文件候选改为 `modifiableCurrentFiles`（仅应用内版本）、`selectTargetFile`/模式初始化/`changePrepMode` 同步收口，外部 office/pdf/导入 md 不再出现在“修改这份”目标；`lesson-files-section.tsx` 入口按钮以 `isAppGeneratedCoursewareFile` 判定，不可修改时 title 提示“仅支持修改工作台生成的讲义/教案/作业；外部 Office 文档请用系统应用打开修改”；无应用内版本课次显示“先用 AI 生成第一版课件”引导（入口条 + 工作台双处），mode 初始化收敛为 'new'。
- D25 预算 UX：选择区经 `readContent` 逐份统计字符数（`referenceCharCounts`），每份候选显示“N 字”徽标，参考区显示“N / 10 份”与“参考已占用 X / 30,000 字（含修改对象共 Y 字）”，超限标橙；勾选第 11 份被拒绝并提示；`startImprovePlan` 与 `confirmPlanAndGenerate` 共用 `confirmReferenceBudget`——预算耗尽/未完整纳入/无法预读（office 等非 text）时弹出确认对话框，明确列出未纳入文件名，确认后本次签名缓存不再重复弹（选择变化即失效）；取消则中止并提示删减。旧 `scopeTruncated` 静默角标移除（对比基线恢复路径保留其内部截断语义）。
- 测试：新增 `tests/v1.6-scope-budget.test.ts`（4：收口判定、候选/入口 pin、字符数与 10 份上限 pin、双流程预算确认 pin）与 `tests/draft-reference-budget.test.ts`（6：常量、基线优先+溢出列名、部分纳入、基线耗尽、空跳过+上限、sources 32/33 合同）；重定向 3 处旧文案 pin（v1.2-prep-files-ui 1 处、v1.5.3.1-scope-flow 2 处，按“pin 随新意图重定向”先例）。
- 门禁：全量 64 files / 278 passed / 1 skipped（V16-A 基线 265 + 13，含重定向）、typecheck 0 错误、lint 通过、production build 通过、`git diff --check` 干净。
