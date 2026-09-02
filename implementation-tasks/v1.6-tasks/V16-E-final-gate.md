# V16-E · V1.6 最终回归与版本验收

**状态：** `IN_PROGRESS`（2026-09-02 自动门与隔离冒烟完成；DeepSeek/MinerU 真实自测与最终体验确认待产品负责人）

## 范围

- 全量测试、typecheck、lint、production build、`git diff --check`；
- 中继式流式验收（D15 先例）：fake 流式 provider 覆盖 SSE 解析、reasoning 进度、取消、静默超时、done 组装；
- Windows 隔离冒烟（独立 app-data + `--user-data-dir`，参照 V156-E 样板）；
- 真实 DeepSeek 自测清单（产品负责人）：测试连接通过、单文件修改两步流（方案 + 确认 + 对比 + 发布）、整课重做、30,000 字多文件参考（≤10 份）生成、流式观感与取消；
- 真实 MinerU 自测清单（产品负责人）：设置卡配置 token、真实文件增强解析、生成引用含 LaTeX 公式内容；
- 修改收口体验点：外部 docx 置灰提示、无版本课次引导；
- 验收记录写入 `docs/v1.6-acceptance.md`。

## 不做

- 不运行 portable/installer，不生成对外交付包，不自动 push；
- 不改写任何已完成版本的历史状态、验收记录与通过标签；
- 未获得产品负责人最终体验确认前不得创建 `checkpoint-V1.6-pass`。

## 验收

- 全部自动门通过 + 两轮真实自测通过 + 产品负责人最终体验确认；
- 最终确认提交上创建 `checkpoint-V1.6-pass`（标签说明注明基线 `checkpoint-V1.5.6-pass`）。

## 完成记录（2026-09-02，自动部分）

- 自动门：全量 70 files / 301 tests（300 passed / 1 skipped）、typecheck 0 错误、lint 通过、production build 通过、`git diff --check` 干净；未运行 portable/installer、未 push；
- 中继式流式验收：`tests/ai-stream-ipc.test.ts` 5 例（SSE 解析 → `ai:stream-event` 推送 → 渲染状态机 → done 与 invoke 一致性；含静默超时与取消）；
- 隔离 Windows 冒烟：独立 `TEACHER_WORKBENCH_L01_SMOKE_APP_DATA` + `--user-data-dir` 启动 production Electron，4 进程两次采样存活，`workspace.db` / `search.db`（含 WAL/SHM）创建成功，stderr 无错误；冒烟库验证 `schema_migrations` 应用至 v16、files CHECK 含 `mineru_ready`、search schemaVersion=2；进程与临时目录已清理，未接触正式工作区与任何凭据；
- 验收文档 `docs/v1.6-acceptance.md`：实施内容表、自动门数字、中继式流式验收、冒烟记录、安全边界复核、DeepSeek/MinerU 真实自测清单与费用估算（DeepSeek 一轮约 ¥1–3，超 ¥3 先告知；MinerU 通常免费额度内）；
- 待办：产品负责人完成两份真实自测清单并最终体验确认后，创建 `checkpoint-V1.6-pass`（在此之前不得创建）。

**Git：** 本地提交 `v1.6(V16-E): record automated gates and smoke results`。

## 真实自测反馈记录（2026-09-02 第一轮，产品负责人）

### 反馈 A：流式输出"不像逐字上屏"（已记录，待产品负责人选改进方向）

- 现象："AI 思考中…（已思考 N 字）"长时间停留，正文似乎最后一次性出现。
- 机制走读结论：流式链路为真增量——`requestStreamText` 逐 chunk `reader.read()`、逐行解析、逐 `delta` 推送（`reasoning` 计数 / `text` 追加），渲染端 `onStreamEvent` 逐事件更新 `textPreview`；"已思考 N 字"计数本身就是流事件驱动的直接证据；`ai-stream-ipc.test.ts` 中继验收已覆盖。
- 观感成因（最可能）：deepseek-reasoner 类模型的思考阶段占据几乎全部时长，该阶段按 D22 决议只允许显示计数（reasoning 原文不展示）；正文在思考结束后数秒内快速流完，视觉上接近一次性出现。
- 候选改进（UX 决策，非缺陷，需产品负责人选择）：A1 思考阶段显示已思考时长（秒表）；A2 正文"打字机"节流（观感更强但人为拉长总时长）；A3 切换 `deepseek-chat`（无长思考阶段，设置改模型名即可）。
- **裁决（2026-09-02）：产品负责人选择 A1**，已实现：`draft-panel` 流式面板新增本地秒表（`streamState.startedAt` + 每秒 interval），思考行改为"AI 思考中…（已思考 N 字，已耗时 M 秒）"——推理模型数十秒无事件期间秒数仍每秒推进，给出"仍在推进"的实感；A2/A3 不做。门禁复跑全绿（304 tests、typecheck、lint、build、diff check）。

### 反馈 B：`\[...\]` 显示公式渲染失败（真缺陷，当日已修复）

- 现象：如 `\[ |a-b|+|b-c|-|a+c|=(b-a)+(c-b)-(-a-c)=2c \]` 的显示公式以裸文本 `[ ... ]` 漏出；`$$...$$` 正常——所以"有的能渲染有的不行"取决于定界符。
- 根因 1：`renderInline` 分支链有 `$$`、`\(...\)` 但**缺 `\[` 分支**，token 掉进最后的斜体分支被剥掉首尾字符、以纯文本漏出（既有测试从未覆盖 `\[`）。
- 根因 2：AI 常把 `\[` 与 `\]` 各占一行，段落逐行渲染拆散定界符无法配对。
- 修复：`lesson-material-reader.tsx` 新增 `\[` → `MathSpan(display)` 分支；`renderParagraphLines` 渲染前把跨行显示公式合并回单行（软换行本就以空格衔接，语义不变）。KaTeX 对该绝对值公式本身渲染无错（直测验证）。
- 回归测试：`tests/lesson-material-reader.test.ts` 新增 2 例（单行含 `|` 绝对值、跨行定界符），全量 70 files / 304 tests（303 通过、1 跳过）、typecheck、lint、production build、`git diff --check` 全绿。

### 反馈 C：希望 md 课件可直接编辑（超出 V1.6 冻结基准，需产品负责人确认新范围）

- 现状：AI 草稿保存前可在备课面板编辑；发布后的课件版本（"· 第 N 版.md"）在阅读器只读，修改只能走 AI 修改流。
- 提案（V1.7 候选）：阅读器对**应用内生成**的 md 课件版本提供"编辑"入口（编辑 + 预览切换），保存语义二选一——发布为第 N+1 版（推荐，沿用版本链、原子写入与"不覆盖既有成果"边界）或直接修改当前版本；外部导入资料维持只读。
- **裁决（2026-09-02）：产品负责人确认作为 V1.7 候选保留记录**，V1.6 内不实现；保存语义（第 N+1 版 vs 直接改当前版）留待 V1.7 立项时定。

**Git：** 本地提交 `v1.6(V16-E): fix display math rendering and record self-test feedback`。

## 真实自测反馈记录（2026-09-02 第二轮，产品负责人 · MinerU）

### 反馈 D：素材库右键找不到"增强解析"，且期望 MinerU"无感"（部分缺陷，当日修复）

- 现象：产品负责人按自测清单操作时"素材库的右键里没有增强解析"，并指出 MinerU 本质是"把文档传给 AI 的时候"用的，应当无感；其此前生成测试已确认参考文档流转基本无感。
- 定位：① 素材库文件右键菜单第二项一直存在（未配置 token 时灰显"增强解析（需配置 token）"，静态测试已钉）；② **缺陷**：课次资料阅读器的"增强解析"按钮在未配置 token 时整体隐藏——违背 V16-D 基准"token 未配置置灰 + 引导设置"，老师无从得知该能力存在。
- 修复：`lesson-material-reader.tsx` 对 office/pdf/图片文件始终渲染入口——未配置 token 灰显"增强解析（需配置 token）"并在 title 引导设置；配置后启用；进行中显示"增强解析中…"；done 后不再展示；md 等非适用文件不显示。`lesson-files-section` 改为始终传入 onEnhanceFile（不再按 token 隐藏）+ 新增 `mineruTokenConfigured` / `mineruBusy` props。static-render-v156-d 新增 4 场景钉测（灰显引导/启用/进行中/非适用与 done 隐藏）。门禁复跑全绿（70 files / 305 tests、typecheck、lint、build、diff check）。
- 架构澄清（对"无感"诉求的正面回答）：参考文档进入生成请求走的是**双层解析**——正常 docx/md/带文本层 pdf 由本机 DocumentParser 在导入时解析入搜索索引，生成引用全程无感（产品负责人生成测试已确认，MinerU 不参与）；MinerU 仅对扫描件/照片（本机解析无文本）与复杂公式场景提供增量增强。**完全自动上传云端**与冻结 D26（显式 opt-in 联网解析；AGENTS 明文禁止自动后台扫描/云同步）冲突，且云端解析需数十秒至数分钟、生成时自动触发会阻塞等待——故设计为"提前增强、之后无感"：增强完成的文件在后续生成中自动引用（该步无感）。
- **V1.7 候选（产品负责人方向"无感"）：** 生成/选择参考时发现文件为扫描件（无文本）→ 参考列表就地提示"该文件无法本机解析，点此用 MinerU 增强解析"，一键完成仍是显式同意；以及"完全静默自动增强"（需推翻 D26 隐私边界，仅记录，未立项）。
- **自测清单修订：** MinerU 手动流为按需能力——产品负责人无 token 或不需要扫描件解析时可跳过；其已确认的"参考文档正常流转生成"即核心验收项（无感路径）。如需验证扫描件能力：设置 → 文档增强解析（MinerU）→ 保存 token → 素材库右键或阅读器"增强解析"。

**Git：** 本地提交 `v1.6(V16-E): keep reader enhance entry visible with token guidance`。
