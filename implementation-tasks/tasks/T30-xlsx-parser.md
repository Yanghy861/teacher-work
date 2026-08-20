# T30 · XLSX Parser

**前置：** T22、T24、T04/T08 的 XLSX 决策。  
**目标：** 可搜索工作表和单元格文字，并返回可理解的位置。

## 实现范围

- 在统一 Adapter 后实现选定 XLSX parser；
- 提取 sheet 名、字符串/数字/可读公式展示值；按 sheet 或受控行块形成 chunk；
- 保存 sheet + cell/range 位置，不把整个超大 sheet 塞入单一 chunk；
- 明确公式仅搜索存储表达式/缓存值中的哪一种，服从 ADR 并保持可解释；
- 空工作簿返回 `no_text`，损坏/加密/解析异常返回 `parse_failed`；
- worker 中设置行数、单元格大小和资源保护，避免恶意/异常文件耗尽内存；
- 用 Excel/WPS 真实样本回归。

## 不做

旧 XLS、重新计算复杂公式、Excel 渲染、宏执行、图表 OCR。

## 验收

- 固定关键词能返回正确 sheet 和 cell/range；
- 多 sheet、空 sheet、合并单元格、公式、损坏文件有测试；
- 解析过程绝不执行宏或外部链接；
- 真实样本达到 Spike 约定阈值。

