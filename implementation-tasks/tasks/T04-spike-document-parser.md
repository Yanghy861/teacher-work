# T04 · Spike A：真实文档解析

**前置：** T01–T03；30～100 份脱敏真实样本。  
**目标：** 在写正式解析器前，用真实教学资料确定候选库的可用边界和替换策略。

## 实现范围

- 建立独立、可重复运行的解析实验工具；样本目录必须 gitignore，报告不得复制敏感正文；
- 样本覆盖 PowerPoint/WPS PPTX、DOCX、文本 PDF、扫描 PDF、XLSX，以及数学公式、表格、图片较多和较大的文件；
- 以统一候选结果结构记录 text/chunks/position/status，但 Spike 代码不得直接成为业务耦合；
- 对 officeParser 等候选及必要的格式专用候选测量：成功率、中文保真、slide/page/sheet/heading 位置、公式/表格降级、耗时、峰值内存；
- 明确区分 `indexed` 候选结果、`no_text` 和 `parse_failed`；
- 核对许可证、维护状态、Electron/Windows 打包风险；
- 把数据和结论写入 `docs/spike-results.md` 的 Spike A 章节，并保留机器可读汇总。

## 不做

不实现生产 SearchService、OCR、完整预览或 AI 理解；不因单个成功样本就宣布候选可用。

## 验收

- 实际运行样本数与格式分布清楚，失败文件有匿名编号和原因分类；
- 报告明确每种格式采用/拒绝/待补样本的候选及生产 Adapter 风险；
- 没有足够真实样本时，只提交工具与说明，并将 T04 标 `BLOCKED`，不得标 `DONE`。

