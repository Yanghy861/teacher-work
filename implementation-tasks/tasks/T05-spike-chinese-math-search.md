# T05 · Spike B：中文/数学混合搜索

**前置：** T04 的真实提取结果；至少 10,000 个 chunk 的语料。  
**目标：** 用可重复实验选择 V1 的 FTS5、Normalizer、短词与 TokenExtractor 组合，而不是凭直觉拍板。

## 实现范围

- 建立独立搜索 benchmark，正文保留原文，另生成规范化/Token 字段；
- 比较 FTS5 trigram、SearchNormalizer、标题/文件名精确匹配、短词 fallback、应用层 TokenExtractor；
- Normalizer 实验至少覆盖大小写、全角半角、常见数学 Unicode 等价形式，同时不得破坏展示原文；
- 固定测试 `有理数`、`一元二次`、`函数`、`几何`、`圆`、`AMC8`、`P16`、`|x|`、`∠ABC`、`△ABC`、`x²`，并加入负例；
- 记录 top-k 召回、误召、索引耗时、数据库体积、冷/热查询延迟；人工标注最小真值集，不能只看“有结果”；
- 把 Level 1/Level 2 采用条件、查询规则和未解决项写入 `docs/spike-results.md` 的 Spike B 章节。

## 不做

不引入向量库、Elasticsearch、Meilisearch、大型 NLP 服务；不实现正式搜索 UI。

## 验收

- benchmark 一条命令可重跑并生成机器可读结果；
- 对每个固定查询都有预期文档/片段、实际排名和判定；
- 报告给出明确生产决策或明确失败证据；真实语料不足时标 `BLOCKED`。

