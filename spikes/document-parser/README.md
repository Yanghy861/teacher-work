# T04 Spike A：文档解析实验工具

`run-spike.mjs` 是与业务代码隔离的样本驱动实验工具。它要求调用者提供外部脱敏样本目录和一个候选 Adapter，不把任何解析正文、文件名或路径写入报告；机器报告只保留匿名样本编号、候选标签、格式、大小、状态、chunk/位置计数、耗时、进程 RSS 峰值和安全诊断信号（警告代码、节点类型计数、固定查询命中计数）。

## 样本门槛

运行解析前，工具会拒绝不满足以下条件的样本集：

- 30～100 份样本；
- 至少包含 `.pptx`、`.docx`、`.pdf`、`.xlsx`；
- PDF 样本应由样本提供者明确覆盖文本层和扫描/无文本层；
- 样本应覆盖中文、数学公式、表格、图片较多和较大文件等验收维度。

样本目录必须位于仓库外的临时或用户明确提供的脱敏目录；不得把真实教学资料复制进仓库。

## Adapter 契约

候选模块导出 `async parse(filePath)`，返回自有结构，不让业务层依赖第三方 AST：

```js
{
  text: string,
  chunks: [{ text, positionType, positionValue, heading }],
  parseStatus: 'indexed' | 'no_text' | 'parse_failed'
}
```

## 重跑命令

```powershell
node spikes/document-parser/run-spike.mjs `
  --samples D:\path\to\sanitized-samples `
  --adapter D:\path\to\adapter.mjs `
  --adapter-label officeparser-7.3.0 `
  --output D:\path\outside\repo\document-parser-run.json
```

输出目录应在仓库外；如果未提供 `--output`，机器报告只输出到 stdout。工具遇到样本门槛不足时返回退出码 `2`、报告状态 `blocked`，不会生成“通过”结论。
