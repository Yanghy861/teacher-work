# T27 · PDF 文本层 Parser

**前置：** T22、T24、T04/T08 的 PDF 决策。  
**目标：** 可搜索有文本层 PDF，并可靠标记扫描/无文本 PDF。

## 实现范围

- 在 DocumentParser Adapter 后实现选定 PDF 候选；
- 按页提取正文，每个 chunk 保存稳定 page number；
- 对有页面但无可提取文字的扫描 PDF 返回 `no_text`；损坏、加密不可读或解析器异常返回 `parse_failed` 与安全诊断；
- 处理中文、页眉页脚、异常空白和超大页文本的最小清理，不伪造 OCR 内容；
- 大文件解析运行于 worker，可取消，限制异常内存使用；
- 使用安全 fixture + T04 真实样本回归，记录已知公式/表格降级。

## 不做

OCR、完整 PDF 编辑、公式重建、保证从系统 Viewer 精确跳页。

## 验收

- 关键词结果返回正确 PDF 与页码、原文片段；
- 文本 PDF/扫描 PDF/空白 PDF/损坏 PDF 状态严格区分；
- 单个坏 PDF 不阻塞队列；
- 真实回归结果不低于 Spike 决策阈值。

