# Phase 0.5 Spike 结果

本文件只记录已实际运行的 Spike 证据；没有真实样本或真实 Office/WPS 操作时，不写“通过”。

## Spike A：文档解析

状态：`DONE`

### 样本与可复现方法

- 样本目录：`D:\teacher_work-samples\T04-20260820`（仓库外，只读）。
- `sample-manifest.json` 声明 40 份样本；重新计算 40 个文件 SHA-256，manifest hash mismatch 为 0。
- 格式分布：PPTX 10、DOCX 14、PDF 14（文本层 9、扫描无文本层 5）、XLSX 2；样本覆盖中文数学资料、表格、图片较多文件和大文件，最大样本约 44 MB。
- 运行命令：

  ```powershell
  node spikes/document-parser/run-spike.mjs `
    --samples D:\teacher_work-samples\T04-20260820 `
    --adapter D:\teacher_work\spikes\document-parser\officeparser-adapter.mjs `
    --adapter-label officeparser-7.3.0 `
    --output D:\teacher_work\spikes\document-parser\results\officeparser-7.3.0.json
  ```

- 机器报告：`spikes/document-parser/results/officeparser-7.3.0.json`（被 `.gitignore` 忽略，不提交样本或报告）。报告只保存匿名样本 ID、格式、大小、状态、位置计数、耗时、RSS 和固定诊断信号，不保存文件名、路径或正文。
- Adapter：`spikes/document-parser/officeparser-adapter.mjs`，通过自有 `parse(filePath) -> { text, chunks, parseStatus }` 契约包装第三方 AST；显式 `ocr: false`，扫描 PDF 不走 OCR。

### 候选库核对

- 采用候选：`officeparser@7.3.0`。本地 package manifest 标注 MIT、Node `>=18.0.0`，源码仓库为 `https://github.com/harshankur/officeParser`；npm 包声明支持 DOCX、PPTX、XLSX、PDF。
- 依赖与打包风险：直接依赖为 `@xmldom/xmldom`、`fflate`、`file-type`、`pdfjs-dist@6.1.200`、`tesseract.js@7.0.0`；本次不启用 OCR 或 optional `@napi-rs/canvas`，但依赖树包含该 optional 平台包，正式打包仍需复核依赖许可、体积、原生包兼容性和 PDF.js/Tesseract 资源加载。
- Electron/Windows smoke：用 Electron `43.4.1` / Node `24.18.1` 主进程加载同一 Adapter，分别解析 PPTX、文本 PDF、XLSX，3 项均 `indexed` 并正常退出；运行环境同时打印既有 GPU 子进程错误，但不影响本次无窗口解析进程退出码 0，不能把该 GPU 环境噪声归因于 Parser。

### 真实结果

| 格式 | 样本 | indexed | no_text | parse_failed | text chars | chunks | elapsed |
|---|---:|---:|---:|---:|---:|---:|---:|
| PPTX | 10 | 10 | 0 | 0 | 12,702 | 1,123 | 1,502.02 ms |
| DOCX | 14 | 14 | 0 | 0 | 60,308 | 2,941 | 659.86 ms |
| PDF | 14 | 9 | 5 | 0 | 140,017 | 7,992 | 2,244.22 ms |
| XLSX | 2 | 2 | 0 | 0 | 6,635 | 456 | 41.05 ms |
| 合计 | 40 | 35 | 5 | 0 | 219,662 | 12,512 | 4,322.93 ms |

- 峰值 RSS：487,915,520 bytes；最大单文件为 `sample-033`，约 1,260.50 ms、97,327 chars、6,374 chunks。
- 位置：PPTX 产生 slide 位置，文本 PDF 产生 page 位置，XLSX 产生 sheet 位置；DOCX 样本当前主要回退为 `docx` 位置，未稳定产生 heading path，是采用 Adapter 的已知风险，后续生产 Adapter 必须补 heading 派生或明确降级。
- 扫描 PDF：5/5 为 `no_text`，text chars/chunks 均为 0；没有启用 OCR，也没有误报为 `indexed`。
- 结构/降级信号：累计 CJK 字符 97,386、数学符号 730；AST 节点包含 212 slide、290 page、3 sheet、584 cell、7 table、310 image、263 heading。固定诊断查询命中：`有理数` 232、`一元二次` 143、`函数` 42、`几何` 26、`圆` 72；`AMC8`、`P16`、`|x|`、`∠ABC`、`△ABC`、`x²` 在本批次没有命中，不能据此宣称搜索能力通过，交由 T05 真实语料 benchmark 验证。
- 警告分类：5 条 `EMPTY_CHUNK_GENERATED`（与无文本扫描 PDF 对应）、3 条 `WHITESPACE_NODE_SKIPPED`、1 条 `BUFFER_TYPE_MISMATCH`；没有 `parse_failed`。

### Spike A 决策

- **采用为当前候选 Adapter：** `officeparser@7.3.0` 可在真实 40 份样本上完成四种格式解析，并能为 PPTX/PDF/XLSX 提供可用位置；生产层只能依赖自有契约，不得保存第三方 AST。
- **生产约束：** 保留 `indexed` / `no_text` / `parse_failed`；默认关闭 OCR；把警告变成可审计分类；DOCX heading path 不能假定存在，需后续 Adapter 层补齐或返回明确的文档级位置；大 PDF 需在 Worker 中解析并设置资源上限。
- **暂不宣称完全通过的内容：** 数学表达式保真、DOCX heading 位置、复杂表格/公式降级质量和大规模搜索召回仍需 T05 及后续格式/搜索任务验证。

## Spike B：中文/数学混合搜索

状态：`DONE`

### 样本、方法与可复现命令

- 语料直接复用 Spike A 的 40 份真实样本和 `officeparser@7.3.0` Adapter；重新提取得到 12,512 个非空 chunk，超过 T05 要求的 10,000，未加入合成教学正文。
- 运行命令：

  ```powershell
  node spikes/chinese-search/run-benchmark.mjs `
    --samples D:\teacher_work-samples\T04-20260820 `
    --adapter D:\teacher_work\spikes\document-parser\officeparser-adapter.mjs `
    --truth D:\teacher_work\spikes\chinese-search\ground-truth.json `
    --output D:\teacher_work\spikes\chinese-search\results\officeparser-7.3.0.json
  ```

- 真值文件：`spikes/chinese-search/ground-truth.json`，人工复核的最小真值只保存匿名 `sample-xxx:chunk-xxxx` ID；6 个正例查询列出真实出现的样本/代表片段，5 个固定术语和 2 个额外查询标为语料负例。
- 机器报告：`spikes/chinese-search/results/officeparser-7.3.0.json`（被 `.gitignore` 忽略）。报告不保存正文、原始文件名或路径；原文只在临时 SQLite 文件中用于建索引，报告完成后删除。

### 实测对比

- 索引构建：164.545 ms；临时 SQLite 体积 5,197,824 bytes；规范化 Token 数 40,741；Normalizer 的大小写、全角/半角、平方/立方、常见数学符号等价检查 6/6 通过，展示原文未被改写。

| 变体 | 冷首查 ms | 热 P50 ms | 热 P95 ms | 固定正例命中 | 负例误召片段 |
|---|---:|---:|---:|---:|---:|
| raw FTS5 trigram | 1.147 | 0.050 | 0.194 | 2/6 | 0 |
| FTS5 trigram + SearchNormalizer | 0.866 | 0.050 | 0.211 | 3/6 | 0 |
| 应用层 TokenExtractor | 0.986 | 0.015 | 0.613 | 6/6 | 30 |
| 短词 fallback（仅 ≤2 字符） | 0.088 | 0.005 | 0.169 | 3/6 | 0 |
| 标题/文件名精确匹配 | 0.205 | 0.046 | 0.056 | 0/6 | 0 |

- 标题/文件名路径另做匿名控制查询 `sample-001`：精确匹配命中同一匿名样本；固定内容查询不应依赖该字段。
- 每个固定查询的 top-k 实际排名、期望 sample/chunk、`recallAtK`、片段召回、判定和负例误召均写入机器报告；`AMC8`、`P16`、`|x|`、`∠ABC`、`△ABC` 在这批真实语料中没有出现，因此按真值文件记录为负例，不能把“无结果”误报成格式召回通过。

### Level 1 / Level 2 决策

- **Level 1 采用：** 正文和查询统一使用版本化 SearchNormalizer，再使用 FTS5 `trigram`；三字符及以上连续中文、英文/数字和已规范化数学表达式走 FTS。结果显示它对 `有理数`、`一元二次`、`x²` 有稳定命中且负例误召为 0，但对二字/单字中文词不够，因此保留短词 fallback。
- **Level 2 有条件采用：** 短词查询（规范化后不超过 2 个字符）走应用层短词索引；TokenExtractor 只作为候选召回层，不接受当前“单字中文 token 直接返回”的宽松结果作为最终命中。当前宽松 TokenExtractor 虽命中 6/6 正例，却产生 30 个负例误召，生产层必须加规范化正文二次校验/精确数学 token 校验后才能启用。
- **标题/文件名：** 作为独立的精确字段匹配，不能混入正文 FTS 排名；展示仍读取原始正文/位置。
- **Later / 未解决：** 本批样本没有覆盖 `AMC8` 等固定术语的正例；复杂公式、题号和图片文字不因本 Spike 自动 OCR；若 Level 1 + 经过二次校验的 Level 2 在后续真实资料仍不足，再记录 V1.1 的 tokenizer/本地搜索方案评估，不引入向量库、Elasticsearch、Meilisearch 或大型 NLP 服务。

## Spike C：Office/WPS 保存事件

状态：`DONE`

### 环境、范围与可复现报告

- 实测应用：WPS Office `12.1.0.28043`，Windows 11 25H2 / build `26200`；本机未检测到 Microsoft Office，因此不对 Microsoft Office 的行为作结论。
- 实验文件：由 WPS 在工作区临时目录中创建的 DOCX、PPTX、XLSX 文件，不使用真实教学资料。对每种格式执行了打开未改、普通保存、连续 `Ctrl+S`、内容变化后保存、另存为/关闭流程；同一 WPS 应用完成多轮可复现实验。
- watcher：`chokidar@4.0.3`，实验器为 `spikes/office-watcher/run-experiment.mjs`。报告只保存匿名 `file-xxx`、扩展名、事件、size、mtime、可读性、Hash 前缀和决策，不保存路径、文件名或正文。
- 机器报告（均被 `.gitignore` 忽略）：`wps-12.1.0.28043-all-formats.json`、`wps-12.1.0.28043-xlsx-followup.json`、`wps-12.1.0.28043-xlsx-post-fix.json`、`wps-12.1.0.28043-final-scan.json`。

### 原始事件与应用特征

- WPS 主文件出现 `add`/`change`，保存或关闭时出现 `unlink`；DOCX/PPTX 还出现 Office 锁文件，临时 `.tmp` 文件会经历 `add`/`change`/`unlink`，且部分中间状态不可读。
- Chokidar 在 Windows 本轮没有给出独立的原生 `rename` 事件；重命名/替换应按 `unlink` + `add` 的组合归一化，不能把单一事件名当作跨平台契约。
- 修正版 XLSX 报告使用了显式参数 `debounceMs=300`、`stableSamples=3`、`stableIntervalMs=100`、`taskDurationMs=900`、`readRetryMs=100`、`readRetries=3`；报告记录了 `mtimeMs` 和关闭等待后的 `finalSnapshots`。
- 前一轮 XLSX 事件风暴中，同一匿名 `file_id` 的多个 `change` 合并为同一任务；保存发生在模拟任务执行期间时，报告为 1 次 `task_recheck`、`savesObservedDuringTask=1`，没有并发重复任务。修正版收尾轮次另外验证了关闭任务和最终快照字段。

### 观察到的决策

- 初始/另存为/真实内容变化的稳定样本为 3 次，最终 Hash 变化时产生 `rebuild_required`；真实内容变化的每个保存轮次最终只产生一个该决定。
- 未改变内容的重复保存/锁文件事件出现过 `hash_unchanged`，决定为 `no_rebuild`；不可读或缺失的临时文件只产生 `retry_later`，不伪造重建。
- 独立收尾读取发现 WPS 在最后一个文件事件之后仍可能完成同大小的 ZIP 元数据写入，因此实验器在关闭 watcher、等待 pending task 和 debounce 完成后，对已见路径再做最终只读检查；这也是生产层必须保留稳定采样和最终 Hash 复核的依据。

### 场景覆盖与限制

| 场景 | WPS 证据 | 结论 |
|---|---|---|
| 普通保存、连续 `Ctrl+S`、打开未改 | DOCX/PPTX/XLSX 多轮 | 已观察；未变 Hash 不重建 |
| 另存为、真实内容变化后保存 | DOCX/PPTX/XLSX 实际 WPS UI 流程 | 已观察；变化最终只产生一次重建决定 |
| 事件风暴、锁文件、临时文件、关闭后清理 | 三种格式报告；XLSX 另有任务重检轮次 | 已观察；同文件任务合并 |
| 自动恢复式保存 | 本轮未能在不强制破坏 WPS 会话的条件下稳定触发 | 未宣称支持；留作后续真实环境专项验证 |
| 大文件保存 | 本轮只使用脱敏临时实验文件，未人为制造固定大小门槛 | 未宣称性能结论；不得把本 Spike 当作大文件容量验收 |
| 保存进行中退出 | 实测为保存后关闭；未把“关闭前恰好处于写入中”伪造成通过 | 未宣称该时序已覆盖 |

上述未覆盖场景是边界记录，不改变本 Spike 已满足的核心验收：真实应用多轮保存、真实内容变化的单次重建、Hash 去重以及事件风暴中的同文件任务合并。后续若产品要承诺自动恢复、大文件上限或保存中退出语义，必须重新执行对应真实场景并补充证据。

### 候选对照与推荐参数

| 候选 | 本 Spike 结论 |
|---|---|
| `chokidar@4.0.3` | 采用为当前 watcher 实验候选；提供统一 `add/change/unlink` 入口，但 Windows rename 仍需由应用层按事件组合归一化 |
| Node `fs.watch` | 保留为后续 A/B 候选；本轮未把平台后端差异直接作为生产契约，避免用未实测语义替代真实证据 |

- 只把文件标记为 dirty；使用可配置 debounce，建议初始范围 `300–500 ms`。
- 读取后至少做 3 次相同 `size + mtime + SHA-256` 的稳定采样，间隔建议 `100–150 ms`；文件不可读时按 `100–200 ms` 重试 3–5 次。
- Hash 只用于去重和最终确认，不保存正文；同一 `file_id` 同时只有一个任务，任务运行中再次保存只补一次必要重检。
- 不使用固定 2–3 秒作为唯一判据；最终条件是可读、连续稳定采样和 Hash 去重。

### Spike C 决策

- **采用候选：** 后续正式 Main/Worker watcher 可从 Chokidar `4.0.3` 开始，保留 `fs.watch` 作为替代候选和回归对照；正式实现必须继续输出匿名、可审计的 dirty/debounce/stable/readable/hash/task 状态。
- **不接入正式索引器：** 本 Spike 只证明保存事件归一化和任务调度边界，不创建索引、不读取 Renderer 文件系统，也不改变原始教学资料。
- **已知风险：** WPS 自动恢复、大文件容量和保存中退出仍无本轮证据；产品若依赖这些语义，必须在对应支持版本上补做专项测试，不能从本轮结果外推。

## Spike D：强杀与恢复

状态：`DONE`

### Harness、边界和报告

- 实验器：`spikes/crash-recovery/run-harness.mjs`、`worker.mjs`、`common.mjs`；每个场景启动独立 Node 子进程，在明确 checkpoint 后由父进程调用操作系统进程终止，随后在新的父进程流程中执行恢复检查。
- 严格路径：实验 root 只能是工作区下固定的 `tmp/t07-crash-recovery`；每次执行创建新的 run/iteration/scenario 隔离目录，报告只能写入 `spikes/crash-recovery/results/`。越界 root 的负向测试被拒绝，未创建越界报告。
- 输入：只生成合成二进制、JSON、SQLite 和索引数据，不访问真实用户目录、真实教学资料或已有工作区。机器报告 `spikes/crash-recovery/results/t07-crash-recovery.json` 被 `.gitignore` 忽略，只保存匿名场景、断言、状态、尺寸和 Hash 前缀。
- 正式重复结果：`--repeat 2` 共 16 个场景，16/16 `passed`；16/16 子进程均 `SIGKILL`，恢复失败数为 0。所有“正式成功”断言都在恢复后重新读取/校验，而不是只检查 mock 调用次数。

### 故障点和恢复结果

| 故障点 | 强杀时刻 | 恢复检查与结果 |
|---|---|---|
| 复制到临时文件 | 临时文件只写入部分字节 | 识别并丢弃半成品，重新复制到同目录临时文件后校验并完成 rename；正式文件 size/Hash 完整，无残留临时文件 |
| 校验后、原子 rename 前 | 临时文件已完整但尚未成为正式文件 | 重新校验后提升完整临时文件；未把未完成写入当作成功 |
| SQLite 事务提交前 | `BEGIN IMMEDIATE` 和 insert 已执行，commit 未发生 | 重启 SQLite integrity check 为 `ok`，未提交行不存在；重试事务后才出现 `completed` |
| `processing` 已提交后 | 任务状态已持久化为 `processing` | 启动恢复将其置回 `pending`；已完成项目保持一次 run，未被重做；中断项目重试后只完成一次 |
| Hash 计算中 | 状态仍为 `computing`，Hash 尚未提交 | 不接受中间 Hash；重启重新计算并以完整文件 Hash 提交 `complete` |
| 解析临时输出中 | 解析输出 `.tmp` 只有部分 JSON | 删除部分输出，重新解析并原子写入可读正式结果 |
| 索引临时写入后 | 新索引 `.tmp` 不完整，旧正式索引仍存在 | 保留可读旧索引，删除半成品，再生成完整新索引；派生索引不成为业务真相 |
| 损坏输入队列 | 队列尚未处理 | 坏输入单项标记 `failed/INPUT_UNREADABLE`，后续可读输入继续完成，队列不被阻塞 |

### Windows 实测与限制

- 当前 Windows 11 25H2/build `26200` 上，Node 子进程强杀报告为 `SIGKILL`；同卷完整临时文件的 `rename` 在实验中成功，SQLite 在进程终止后可恢复并通过完整性检查。
- 本 Spike 没有持有 WPS/Office 外部句柄来制造文件占用，因此不能宣称所有 `EPERM`/`EBUSY` 文件锁场景都能立即 rename。生产实现必须对 Windows 占用错误使用有上限的重试/退避；仍失败时保留临时文件并让启动恢复处理，不覆盖正式文件。
- 本实验只覆盖同一 Windows 本地卷。跨卷、网络共享、杀毒软件或同步盘的 rename/flush 语义没有证据，不能外推为 V1 支持。
- Harness 自身不实现 token 级 AI 恢复，也不接入正式队列、解析器或索引器；它只验证中断边界、恢复状态和原子文件策略。

### Spike D 决策

- **文件顺序：** 正式实现先在目标对象目录写 `.tmp`，关闭句柄后做 size/可读/Hash 校验，再在同一卷原子 rename；只有 rename 成功且最终文件再次可读，才允许在事务中提交业务状态。启动时扫描 `.tmp` 和无业务记录的孤儿正式文件，恢复或隔离，不把半文件标成成功。
- **事务与任务：** SQLite 事务必须短且显式；未提交事务交给 SQLite 回滚，已提交的 `processing` 在启动时统一回到 `pending`，`completed` 不重做。长解析、Hash 和索引写入放入 Worker/后台任务，主进程只协调状态。
- **派生索引：** 搜索索引使用临时文件加原子替换，损坏或不完整时可删除重建；单项 parse/index 失败只记录该项失败并继续队列。
- **不提前接入生产：** 本 Spike 证明了故障点和恢复策略，但不创建正式业务表、文件服务或索引队列；T14–T31 再按本结果实现生产边界。
