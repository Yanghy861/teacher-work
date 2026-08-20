# T23 · SearchNormalizer、TokenExtractor 与 FTS 落地

**前置：** T21、T22、T05、T08。  
**目标：** 把 Spike B 的真实决策做成可测试的索引/查询内核。

## 实现范围

- 实现版本化 SearchNormalizer；索引和查询使用同一规则，并保留原始正文用于展示；
- 按 ADR 落地 FTS5 trigram 及必要的额外 token/短词字段；只有 Spike 证明需要时才启用 TokenExtractor；
- 提取英文/数字标识、题号、可稳定识别的数学表达式，规则必须有版本和回归测试；
- 实现安全的 query builder，正确处理引号、FTS 运算符、空查询和恶意超长输入；
- 标题/文件名精确或前缀匹配作为明确 fallback，与正文 ranking 分开计权；
- 建立批量 upsert/remove 的幂等索引原语，并保存 content_hash；
- 固化 T05 benchmark 为自动回归基线，阈值要合理且不依赖机器绝对速度。

## 不做

向量/语义搜索、分布式搜索、大型分词服务、React 页面。

## 验收

- 固定 11 类查询及其变体/负例通过预期召回与排名；
- 原文 snippet 不被 Normalizer 改写；
- 特殊字符不会造成 FTS 语法错误或注入；
- 索引同一 hash 两次无重复 chunk，换 hash 后旧内容不再命中。

