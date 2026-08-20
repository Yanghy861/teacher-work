# T08 Sol 独立复审报告

- 审核时间：2026-08-20 22:28 +08:00
- 审核区间：T04–T08 的有效 Spike/安全成果 + Lean V1 后续范围裁决
- 基线：`checkpoint-T03-pass`（`f2c187d4a59d86b4a4bacb42237516155ac9adf5`）
- 候选提交：`fe44b795830bdbcf96f17cc53a86402c1f9f0cd3`
- 送审提交：`c2fc84f`（`review(T08): request Sol review`）
- 结论：`PASS`

## Findings

P0–P3：无。未发现需要 Luna 在 T04–T08 区间继续修复的阻塞问题。

## 范围与可复现性

- 审核开始时位于 `main`，工作区干净；`checkpoint-T03-pass` 与候选均可解析，基线是候选的祖先，merge-base 精确等于基线。
- `checkpoint-T03-pass..候选` 共 11 个提交；候选后的 `c2fc84f` 只修改 `GOAL_PROGRESS.md` 与 `SOL_REVIEW_STATUS.md`，未混入产品实现。
- 候选范围的 `git diff --check` 通过；跟踪树未包含真实教学样本、机器报告、运行数据库、索引、日志、秘密、依赖目录或构建产物。外部样本和复审生成的机器报告均处于 Git 忽略范围。
- `SOL_REVIEW_STATUS.md` 在复审前只有一个 `AWAITING_REVIEW` 行；活动后续任务精确为 L01–L12，旧 T09–T42 明确退役。

## 上一轮问题关闭情况

| 上一轮 finding | 复审结论 | 独立证据 |
|---|---|---|
| P1：损坏 Office 文件被误判为 `no_text` | 已关闭 | `officeparser@7.5.1` 已精确固定；非 ZIP DOCX、截断 OOXML、缺必需部件三个夹具分别返回 `ZIP_NO_ENTRIES_FOUND`、`ZIP_TRUNCATED`、`REQUIRED_PART_MISSING`，3/3 均为 `parse_failed` |
| P1：旧 T06 要求三个 WPS 极端场景 | 按产品负责人正式范围裁决关闭 | 当前 T06、主规格 0.2、Lean 决策均将正确性改为启动/焦点返回/重新打开/手动刷新核对，watcher 仅可选加速；不再承诺自动恢复、大文件和保存中退出的实时事件语义 |
| P1：PDF.js high advisory 未处置 | 已关闭 | 实际依赖树为 `officeparser@7.5.1 → pdfjs-dist@6.2.108 overridden`；官方 registry audit 为 0 项漏洞；恶意 PDF canary 未执行 |
| P2：19/19 gate 只检查文字 | 已关闭 | gate 升为 23 项并实际执行损坏输入/恶意 PDF fixture probe 与零 watcher 刷新探针，同时校验精确依赖、lock、security disposition 和 ADR 状态；本复审也未把 gate 当作唯一证据 |

`officeparser` 官方 7.5.1 发布说明明确记录损坏输入改为抛出类型化错误；本地行为与上游说明一致。PDF.js 官方安全公告把 `6.2.108` 列为 GHSA-hq66-cqwq-w95j 的修复版本。Chokidar 已有 v5，但 v4.0.3 仍是本候选精确固定、MIT、实测过的可选加速器；Lean V1 允许完全不接入 watcher，因此不要求为追新版本而阻塞。参考：[officeParser releases](https://github.com/harshankur/officeParser/releases)、[PDF.js advisory](https://github.com/advisories/GHSA-hq66-cqwq-w95j)、[Chokidar releases](https://github.com/paulmillr/chokidar/releases)。

## 独立复现结果

### 样本、解析与搜索

- 外部脱敏样本 manifest：40/40 文件存在，SHA-256 mismatch 0；格式为 DOCX 14、PDF 14、PPTX 10、XLSX 2。
- T04 重跑：40 份；35 `indexed`、5 `no_text`、0 `parse_failed`；12,797 chunks、222,881 text chars；峰值 RSS 475,181,056 bytes。结果与候选记录一致，三个 XML 编码 warning 没有被隐藏为失败结论。
- T05 重跑：40 份、12,797 chunks，chunk gate 通过，Normalizer 6/6；6 个正例与 7 个语料负例均有真值。Normalized FTS 命中 3 个正例；宽松 TokenExtractor 的 30 个负例误召仍被明确记录，未伪装为可直接采用的生产结果。
- Fixture/security probe：状态 `passed`；三个损坏 OOXML 夹具全部正确分类；实际 PDF.js 为 6.2.108；恶意 PDF 为 `no_text`，JavaScript canary=false。
- Electron 43.4.1 / Node 24.18.1 runtime smoke：PPTX、文本 PDF、XLSX 分别得到 151/303/124 chunks，均 `indexed`，PDF.js 6.2.108，进程退出码 0。

### 刷新与恢复

- 零 watcher 刷新探针：10/10 断言通过；startup、focus-return、reopen、manual-refresh 都能发现新 Hash；并发触发合并，同一已接受 Hash 不重复重建，`watcherRequiredForCorrectness=false`。
- 本机保留的匿名 WPS 报告覆盖 DOCX/PPTX/XLSX 的普通保存、重复保存、另存为和打开未改，并保留可读 final snapshot；这些只作为代表性真机支持证据，不承担正确性门禁。
- T07 重跑：16/16 场景通过；16/16 子进程在 checkpoint 后被强杀，恢复失败 0；固定临时 root 和报告路径约束仍有效。

### 工程、依赖与文档

- `node spikes/decision-gate/verify-gate.mjs --require-done`：23/23。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm test`：8 个测试文件、18 项测试全部通过。
- `npm run build`：Main、Preload、Renderer production build 全部生成。
- `npm ls officeparser pdfjs-dist chokidar --all`：依赖树有效，版本与 override 精确匹配。
- `npm.cmd audit --json --registry=https://registry.npmjs.org`：info/low/moderate/high/critical 全部为 0。
- implementation-tasks Markdown 相对链接检查：通过；12 个 Lean 任务文件齐全，审核链为 T08 → L04 → L07 → L10 → L12。

## Lean V1 范围审核

- 后续范围从旧 T09–T42 收缩为 L01–L12，不删除 T01–T08 已验证成果；四段仍覆盖管资料、找资料、AI 备课、备份与 Windows 交付。
- 简化项都有明确替代：刷新核对替代 watcher 正确性依赖；一个顺序 Worker/重启重扫替代持久化队列和精确续传；统一 Parser 替代四套格式项目；独立生成/保存草稿替代 AI Workflow；暂停写入后的备份替代在线并发快照。
- 不可放松边界仍同时出现在 AGENTS、Lean 决策、全局约束、任务追踪与阶段闸门中：原资料不覆盖；Renderer/Main/秘密隔离；managed 安全路径与临时写入/原子重命名；长解析/Hash/索引不阻塞 Main；Key 不明文落盘/进日志/进备份；AI 只保存草稿。
- L04、L07、L10、L12 均要求全量检查和独立 Sol 审核；高风险边界没有因“简单优先”被整体豁免。

## 非阻塞观察与后续边界

- Electron parser smoke 期间 GPU helper 四次以 `-1073741515` 退出，但无 BrowserWindow 的 Main runtime 解析完整完成并以 0 退出。该现象不否定 T08 的 Parser/Electron ABI 证据；真实 UI/交付启动仍必须在 L04/L12 的 Windows smoke 中单独证明。
- T06 的本地 WPS 报告是匿名、Git 忽略的人机操作证据，不是可自动判定所有 Office 内部语义的矩阵。L03/L04 必须验证生产刷新路径本身，不能把旧 watcher 报告当成生产实现。
- DOCX heading、复杂公式/表格质量、扫描 PDF OCR 和 packaged PDF worker 仍按 ADR 作为已知限制/Later；它们没有被写成已经解决。

## 放行决定

候选满足当前 T04–T08 验收与 Lean V1 范围裁决，上一轮三个 P1 和一个 P2 均已关闭，且没有新的阻塞 finding。T08 审核状态可改为 `PASS`；本审核提交创建 `checkpoint-T08-pass` 后，Luna 可从 L01 开始，但不得越过 L04 审核点。
