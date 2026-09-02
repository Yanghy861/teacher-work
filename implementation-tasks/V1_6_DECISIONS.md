# V1.6 决策记录（AI 修改逻辑重做）

产品负责人于 2026-09-02 会话中逐项确认。诊断证据与实施细节以 `docs/v1.6-ai-modification-rewrite-plan.md` 为准。

## D21 · thinking 模式保留与预算放大

- DeepSeek V4 系列默认开启 thinking（思维链计入 `max_tokens` 输出预算，返回于独立 `reasoning_content` 字段）；产品负责人明确**不关闭** thinking——课件生成的推理质量优先，接受成本与延迟（"贵点就贵点"）。
- 修复方式改为放大预算：`DRAFT_DEFAULT_MAX_TOKENS` 2,000 → 16,000（合同上限 32,000 不变）、`DRAFT_DEFAULT_MAX_CHARS` 12,000 → 30,000（合同上限 100,000 不变）、网关默认超时 15s → 120s。
- 应用不展示思维链原文（老师只要结果）；`reasoning_content` 仅用于流式进度计数。
- 不做 thinking 开关 / `reasoning_effort` 分档；如需"快慢两档"另行立项。

## D22 · 流式输出与静默超时

- 生成、方案生成与确认生成改为流式：老师可见"AI 思考中（已思考 N 字）"进度与正文逐字上屏，自行判断是否卡死；"点下去一点反应都没有"不再出现。
- 超时语义改为**静默超时**：连续 30 秒无任何 chunk 才报超时，总时长不设上限；取消按钮复用现有 `ai.cancel`。
- 新增 Main→Renderer 推送通道 `ai:stream-event`（载荷双向守卫）；最终 note 内容仍以 invoke 返回的完整结果为准。
- 非流式路径（设置面板测试连接等）保留。

## D23 · AI 修改仅面向应用内生成的文件

- AI 修改的对象只能是工作台生成的 Markdown 课件版本（讲义/教案/作业及其修改节点）；外部导入的 docx/pptx/pdf 不得作为修改对象。
- 外部 Office 文档的修改由老师用 Office/WPS/网页版完成，应用现有"在系统应用中打开"即此定位，不打通其 AI 修改链路。
- 课次尚无应用内版本时，修改入口引导"先用 AI 生成第一版课件"。

## D24 · MinerU 云端文档解析（显式 opt-in）

- 产品负责人批准教学资料上 MinerU 云端 API（`mineru.net/api/v4`，vlm 模式、中文、OCR + 公式 LaTeX + 表格）：数学公式、扫描件、题目照片是现有 officeparser 纯文本抽取的盲区，MinerU 结果 `full.md` 显著提升 AI 上下文质量。
- 凭据走应用内设置卡"文档增强解析（MinerU）"：用户自带 token，safeStorage 多槽独立存储（`teacher-workbench-mineru-key.bin`），与 AI Key 同等安全待遇（不进日志/备份/Git，不回显）。
- 上传对象 = managed 副本；外部根目录只读资料不提供任何上传入口；每文件"增强解析"为显式动作，非自动后台行为。
- 解析结果入库后文件 `index_status = 'mineru_ready'`（migration v16 扩展 files 表 CHECK，事务内重建）；生成/修改上下文经既有 chunks 通道自动受益。
- 解压复用 officeparser 依赖树中的 fflate，不新增运行时依赖；下载域白名单；轮询限 30 分钟。

## D25 · 参考预算 30,000 字、上限 10 份、超量明确提示

- 上下文默认预算 12,000 字 → 30,000 字；补充参考文件最多 10 份（合同 `DRAFT_MAX_REFERENCE_FILES = 10`，`sources` 总长合同守卫 1..32）。
- 选择区实时显示每份字符数与累计占用（"参考已占用 N / 30,000 字"）；超 10 份禁止继续勾选。
- 预算耗尽时**明确列出未纳入文件名**并需老师确认，替代静默截断；基线优先占用预算的现有语义保留；Main 侧 `buildContext` 截断兜底照旧（双层保险）。

## D26 · V1.6 非目标

- Anthropic 格式接入（provider 枚举 + DB CHECK 重建 + `/v1/messages` 分支 + 设置 UI）后续版本单独立项；
- docx/Office 导出后续版本立项；
- vision 直读图片（`image_url` 内容块）暂缓——MinerU 已覆盖图片/扫描 OCR，待使用反馈再评估；
- 不做外部 office 文件的 AI 修改通路、thinking 开关、搜索分词策略调整、批量增强解析队列与"合成来源"元数据演进。
