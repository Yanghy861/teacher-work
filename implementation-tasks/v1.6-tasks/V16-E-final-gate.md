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
