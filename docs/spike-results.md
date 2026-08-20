# Phase 0.5 Spike 结果

本文件只记录已实际运行的 Spike 证据；没有真实样本或真实 Office/WPS 操作时，不写“通过”。

## Spike A：文档解析

状态：`BLOCKED`

### 当前证据

- 当前 `D:\teacher_work` checkout 没有脱敏真实 `.pptx`、`.docx`、`.pdf` 或 `.xlsx` 样本；现有 Markdown 仅为仓库规格、任务和代码文档。
- 因此尚未运行候选解析库，不能报告中文保真、slide/page/sheet 位置、公式/表格降级、耗时、峰值内存或 Electron/Windows 打包兼容性。
- 未选择生产解析库，也未把任何第三方解析库接入业务代码。

### 可复现实验入口

- 工具：`spikes/document-parser/run-spike.mjs`
- 说明与 Adapter 契约：`spikes/document-parser/README.md`
- 工具会强制检查 30～100 份样本及 `.pptx`、`.docx`、`.pdf`、`.xlsx` 格式覆盖；报告只保存匿名元数据和状态，不保存正文、文件名或路径。

### 最小解阻动作

请提供一个仓库外的脱敏样本目录，包含 30～100 份实际教学文档，至少覆盖 PowerPoint/WPS PPTX、DOCX、文本 PDF、扫描 PDF、XLSX，并覆盖中文、数学公式、表格、图片较多和较大文件。随后提供或允许安装候选 Adapter 依赖，使用 README 中的命令运行实验并补充机器报告与人工结论。

Spike B、C、D 和 T08 依赖本阻塞解除；在此之前不得把 T04 标为 `DONE`，不得进入 T05 或 T08。
