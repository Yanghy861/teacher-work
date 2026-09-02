# V16-E · V1.6 最终回归与版本验收

**状态：** `TODO`

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
