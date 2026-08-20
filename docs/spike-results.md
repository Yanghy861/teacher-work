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

状态：`PENDING`（T05 尚未开始）。

## Spike C：Office/WPS 保存事件

状态：`PENDING`（T06 尚未开始）。

## Spike D：强杀与恢复

状态：`PENDING`（T07 尚未开始）。
