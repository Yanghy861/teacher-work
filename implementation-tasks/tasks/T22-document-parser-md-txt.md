# T22 · 统一 DocumentParser + Markdown/TXT

**前置：** T21、T04、T08。  
**目标：** 先用简单格式跑通自有解析契约，生产业务不依赖第三方私有结构。

## 实现范围

- 定义稳定 `DocumentParser` Adapter：输入登记文件/受控路径，输出 chunks、positionType/value、heading、parseStatus 和诊断；
- 明确区分成功有文本、`no_text`、`parse_failed`；错误诊断不得包含整份敏感正文；
- 实现 UTF-8/常见 BOM 的 TXT parser，无法可靠解码时返回明确失败；
- 实现 Markdown parser，按标题层级切 chunk 并保留 heading path；正文展示保留原文；
- 统一 chunk 大小/空白归一化策略，同时避免切断明显标题语义；
- 建立 parser registry，未知/旧式 DOC/PPT/XLS 返回 unsupported，而非伪装成功；
- 为常见图片格式提供 metadata-only Adapter：正文状态为 `no_text`，只让文件名/元数据进入搜索，绝不生成描述或 OCR；
- 使用小型无敏感 fixture 做单元测试，并用 T04 真实样本做非提交式回归。

## 不做

PDF/DOCX/PPTX/XLSX、OCR、渲染预览、搜索 ranking。

## 验收

- 同一文件重复解析得到稳定 chunk 顺序和位置；
- 空 TXT/只有图片引用的 MD 与损坏文件状态可区分；
- parser 结果不含第三方 AST，序列化后可安全跨 worker 边界；
- 原规格测试 20 的基础状态语义有覆盖。
