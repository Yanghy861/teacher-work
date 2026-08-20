# T29 · PPTX Parser

**前置：** T22、T24、T04/T08 的 PPTX 决策。  
**目标：** 以幻灯片为可解释位置提取 PowerPoint/WPS PPTX 正文。

## 实现范围

- 在统一 Adapter 后实现选定 PPTX parser；
- 提取每张幻灯片可读取文字，chunk 保存 1-based slide number；
- 处理讲者备注是否纳入搜索必须服从 Spike ADR，并在来源中明确区分；
- 对只有图片且无文字的演示文稿返回 `no_text`；损坏/加密/解析异常返回 `parse_failed`；
- 大 PPTX 在 worker 中解析，记录耗时/内存并保证单项失败不阻塞；
- 用 PowerPoint/WPS、多文本框、表格、公式/SmartArt 降级样本做回归。

## 不做

动画、完整 SmartArt 语义、幻灯片渲染器、OCR、AI 修改 PPT。

## 验收

- 搜索结果指向正确文件和 slide number；
- 幻灯片顺序稳定，修改后旧 slide 文本能被替换；
- 图片型 PPTX 与损坏 PPTX 状态严格区分；
- 真实样本达到 T04/T08 约定阈值。

