# T08 Sol 独立审核报告

- 审核时间：2026-08-20 18:27 +08:00
- 审核区间：T04–T08
- 基线：`checkpoint-T03-pass`（`f2c187d4a59d86b4a4bacb42237516155ac9adf5`）
- 候选提交：`43e368d1f423fdaf60a586dd6da94d219fced719`
- 送审提交：`3f0465fc6025663b088b2fac9bcb4d3edcfc9ccc`
- 结论：`CHANGES_REQUIRED`

## 范围与可复现性

- 候选提交存在，`checkpoint-T03-pass` 是候选提交的祖先；候选提交又是当前送审提交的祖先。
- 送审提交只修改 `implementation-tasks/GOAL_PROGRESS.md` 与 `implementation-tasks/SOL_REVIEW_STATUS.md`，未混入产品实现。
- 审核开始时位于 `main`，工作区干净；候选范围没有提交真实教学样本、机器报告、SQLite、日志、秘密、`node_modules` 或构建产物。
- T04 的 40 份样本仍位于仓库外目录；独立重算结果为 40/40 存在、SHA-256 mismatch 0。

## 独立验证结果

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm test -- --run`：通过，7 个测试文件、17 项测试。
- `npm run build`：通过，Main、Preload、Renderer 均生成 production 产物。
- `npm ls --depth=0`：通过；顶层解析为 `officeparser@7.3.0` 与 `chokidar@4.0.3`。
- `node spikes/decision-gate/verify-gate.mjs --require-done`：脚本返回 19/19，但该结果存在下文所述的证据校验缺口，不能作为放行依据。
- 独立重跑 T04：40 份样本，35 `indexed`、5 `no_text`、12,512 chunks、219,662 chars；结果与送审记录一致。
- 独立重跑 T05：40 份样本、12,512 chunks，Normalizer 6/6；各变体命中/误召与送审记录一致。
- 独立重跑 T07：16/16 场景通过、16/16 子进程为 `SIGKILL`、恢复失败 0。
- 独立检查四份 T06 机器报告：报告包含原始事件、决策和部分 final snapshot，但没有 scenario/action 标识，无法把每段事件序列对应到任务要求的具体 UI 操作。
- `npm audit --json --registry=https://registry.npmjs.org`：未通过；报告 `officeparser`/`pdfjs-dist` 关联 1 项 high advisory，详见问题 3。

## 必须修复的问题

### P1 · `officeparser@7.3.0` 会把损坏 Office 文件误判为合法空文档

当前 Adapter 只根据输出文本/chunks 是否为空返回 `indexed` 或 `no_text`，没有先验证 OOXML ZIP/必需部件，也没有把第三方解析器的损坏输入行为转换为 `parse_failed`。独立探针创建一个内容为普通文本、扩展名为 `.docx` 的损坏输入并调用当前 `parse()`，实际得到：

```json
{
  "text": "",
  "chunks": [],
  "parseStatus": "no_text",
  "diagnostics": {
    "parserType": "docx",
    "warningCodes": ["EMPTY_CHUNK_GENERATED"]
  }
}
```

这使损坏、截断或缺少必需 OOXML 部件的文件与真正无正文的文档不可区分，直接违反 T04/ADR-001 冻结的 `indexed | no_text | parse_failed` 契约，也会让后续队列错误地把坏文件当成“成功但无正文”。上游 `officeparser` 的 [v7.5.1 发布说明](https://github.com/harshankur/officeParser/releases/tag/v7.5.1) 明确说明：自 7.3.0 的 streaming ZIP 改写后，损坏输入会解析为空 AST；7.5.1 才开始对非 ZIP、截断 ZIP、缺少必需部件分别抛出结构化错误。

相关位置：`spikes/document-parser/officeparser-adapter.mjs:113`、`docs/adr/ADR-001-document-parser.md:15`、`package.json:41`。

修复要求：选择并精确固定能可靠区分损坏输入的版本，或在自有 Adapter 前加入等价的严格 OOXML/PDF 输入验证；增加至少“非 ZIP 假 DOCX”“截断 OOXML”“ZIP 缺必需部件”的可复现夹具，断言最终状态为 `parse_failed` 而不是 `no_text`。随后重跑 T04、依赖其提取结果的 T05、Electron/Windows smoke 和 T08 gate，并同步更新 package lock、Spike 结果与 ADR。不得只把警告字符串硬编码成成功或吞掉异常。

### P1 · T06 明确缺少任务要求的三个真实 WPS 场景，却被标为 `DONE`

T06 实现范围要求在 PPTX、DOCX、XLSX 上执行普通保存、连续 Ctrl+S、另存为、自动恢复式保存、大文件保存、打开未改和保存中退出；验收又明确规定“环境或人工保存流程不足时标 `BLOCKED`”。送审证据却明确写明：

- 自动恢复式保存未稳定触发；
- 没有大文件保存容量实验；
- 只做了保存后关闭，没有覆盖保存进行中退出。

`docs/spike-results.md` 把这三项称为 known limitations 后仍宣布 T06 核心验收完成；`STATUS.md` 也将 T06 标为 `DONE`。这与任务文件的显式范围和阻塞规则冲突，不能由 T08 把“未执行”重新分类为“不阻塞”。同时，现有四份机器报告没有场景/action 边界，因此即使对已声称执行的普通保存、重复 Ctrl+S、另存为等操作，也无法从报告中独立定位“哪段事件对应哪次操作”并复核每次真实内容变化恰好一次重建。

相关位置：`implementation-tasks/tasks/T06-spike-office-wps-watcher.md:9`、`:21`–`:23`；`docs/spike-results.md:128`–`:132`；`implementation-tasks/STATUS.md:12`。

修复要求：先把 T06/T08 恢复为符合事实的未完成/阻塞状态；为实验器或配套记录增加匿名 scenario/action 标识、格式、轮次、开始/结束时间和期望结果，使原始事件与决策可归因。使用真实 WPS 补做任务列出的三类场景，并按 PPTX/DOCX/XLSX 记录多轮证据；若某场景在当前环境确实无法安全、可靠执行，则 T06 必须保持 `BLOCKED`，不得进入 T09。不得用合成文件事件或文字声明代替真实 WPS 操作。

### P1 · 冻结的 PDF 依赖栈存在未处置的 high advisory

`officeparser@7.3.0` 精确依赖 `pdfjs-dist@6.1.200`。独立运行官方 npm registry audit 返回 high severity，关联 [GHSA-hq66-cqwq-w95j / CVE-2026-16633](https://github.com/advisories/GHSA-hq66-cqwq-w95j)：受影响范围为 `>=5.6.83 <6.2.108`，修复版本为 `6.2.108`。当前 Spike/ADR 只记录许可、依赖体积与打包风险，没有记录该 advisory 的适用性、Node Worker 威胁模型或明确缓解措施；而 V1 会解析用户提供的本地 PDF，不能在 T08 把这条依赖栈直接冻结为生产候选。

当前调用确实设置了 `isEvalSupported: false`，但这不等同于 advisory 给出的 `enableScripting: false`/CSP 缓解，且送审证据没有证明 officeparser 的纯 Node 文本提取路径不进入受影响执行路径。因此本报告不臆测“必然可利用”，但按 T08 的关键证据规则，未完成的安全处置本身已阻塞放行。

相关位置：`package-lock.json:3953`–`:3964`（其中 `:3963` 固定 `pdfjs-dist: 6.1.200`）、`docs/adr/ADR-001-document-parser.md:44`。

修复要求：对该 advisory 做可审计的适用性分析和恶意 PDF 探针；优先采用包含修复版 PDF.js 的兼容候选。若只能通过 override、替换 PDF parser 或明确禁用相关脚本路径缓解，必须验证 Node/Electron/Windows、PDF worker 版本一致性、40 份样本和恶意夹具，并把决定、剩余风险与 audit 结果写入 ADR。不得直接执行 npm 建议的降级式 `audit fix`，也不得只写“Node 环境不受影响”而无证据。

### P2 · 19/19 gate 只验证文字和状态，能够在关键证据缺失时误报通过

`verify-gate.mjs` 的 Spike C 检查只要求结果文档包含 `run-experiment.mjs` 和 `chokidar@4.0.3`；“四项完成”检查只统计 `状态：DONE` 字符串；阶段状态又只匹配 `STATUS.md` 中的 `DONE`。因此即使同一文档明确写着三个 T06 必做场景未执行，gate 仍返回 19/19。它还把 ADR 的 `Status: Proposed for T08 Sol review` 当作固定通过标记，没有验证最终接受状态。

相关位置：`spikes/decision-gate/verify-gate.mjs:30`、`:33`、`:37`、`:46`–`:49`。

修复要求：让 gate 校验机器可读的最低证据，而不是审核者自己写下的 `DONE`；至少覆盖 T06 所有必做场景/格式/轮次、Adapter 损坏输入分类、依赖安全处置结果和 ADR 最终状态。gate 应在证据缺失时失败，即便 `STATUS.md` 被误写为 `DONE`。

## 已确认可保留的成果

- T04 的 40 份仓库外匿名样本、manifest 与正常文件解析统计可复现；无需丢弃样本或重做样本收集。
- T05 benchmark 可复现，Normalizer/FTS/短词/TokenExtractor 的实测数据和已记录限制可作为修复后重跑基线。
- T07 的 16 个真实强杀/恢复场景可复现，本次未发现阻塞性问题。
- Chokidar 实验器已有 dirty/debounce/stable/readable/Hash/单任务重检基础，可以在其上补场景可追溯性与缺失的真实 WPS 流程，无需推倒重写。

## 复审条件

Luna 只能修复 T04–T08 审核区间，不得进入 T09。修复后需：

1. 关闭以上三个 P1 和一个 P2，并把 T06/T08 状态、Spike 结果、四份 ADR、依赖锁与 gate 恢复为相互一致；
2. 重跑 40 份样本解析、至少 10,000 chunks 搜索 benchmark、补齐后的真实 WPS 场景、16/16 强杀恢复、typecheck、lint、全部测试、production build、Electron/Windows smoke 和官方 registry audit/安全处置探针；
3. 创建 `fix(T08-review): <摘要>` 本地提交；
4. 用新的候选 SHA 把 T08 改回 `AWAITING_REVIEW`，创建新的 `review(T08): request Sol review` 送审提交后停止。

本次不得创建 `checkpoint-T08-pass` 标签，不得进入 T09，不得 push。
