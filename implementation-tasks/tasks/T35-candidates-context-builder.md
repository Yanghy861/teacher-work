# T35 · 候选资料确认与 ContextBuilder

**前置：** T25、T26、T34。  
**目标：** 让老师基于确定性本地搜索挑选可追溯片段，并生成受预算控制的模型上下文。

## 实现范围

- 在 lesson 页进入 AI 备课，自动带入当前课次 ID/标题/路径；老师填写本次特殊要求；
- 通过统一 SearchService 搜索当前课、素材库和 external，显示候选文件/片段/位置/状态；
- 老师可按片段或文件内明确片段勾选；不得默认把整份大文档送给模型；
- ContextBuilder 去明显重复，当前课优先，再按相关度排序，按可配置字符/token 预算截断；
- 每个上下文片段保留 file_id/source node、position、content_hash；输出稳定 source manifest；
- 源文件 stale/missing/hash 改变时在确认页提示，构建时再次校验；
- 上下文预览让老师知道会发送哪些来源，但不展示秘密或内部 token 技术细节。

## 不做

自动 RAG Agent、语义搜索、整份 150 页 PDF 直送、例题/作业生成。

## 验收

- 覆盖原规格测试 25、26 的 ContextBuilder 部分；
- 未勾选片段绝不出现在 Gateway 请求；超预算按确定规则截断并保留来源；
- 重复 chunk/hash 被去重，排序和 manifest 可重复测试；
- stale/hash 竞争条件不会把旧内容冒充新来源。

