# V16-D · MinerU 文档解析集成

**状态：** `TODO`

## 范围

- Migration v16：`files.index_status` CHECK 追加 `'mineru_ready'`（事务内 12 步法重建 files 表，`PRAGMA foreign_keys=OFF` 后恢复）；专项迁移测试：外键无损、旧值语义不变、幂等；
- `secure-storage.ts` 泛化多槽（`teacher-workbench-<slot>-key.bin`，slot ∈ {ai, mineru}；现有 ai 槽路径不迁移不改名）；
- 新增 `MineruSettingsService`（复制 ai-settings-service 模式）与设置 IPC `mineru:get-settings` / `mineru:update-settings` / `mineru:clear-token` / `mineru:test-connection`（判活：GET `/api/v4/extract-results/batch/<不存在ID>`，非 A0202/A0211 即通过）；
- 设置面板新增"文档增强解析（MinerU）"卡：token 密码框（不回显、留空保持）+ 保存 + 测试连接 + 删除，文案注明加密存储、不进日志/备份；
- 新增 `MineruService`（Main 侧）：`enhanceFile(fileId)`（active、≤200MB、token 已配置校验 → 上传链接 → PUT 上传 → 建批量任务 `vlm`/`ch`/OCR+公式+表格 → 受理即返回）；后台轮询（5s 间隔、30 分钟上限、超时按 `parse_failed` 语义；定时器随服务 close 清理）；结果：下载 zip → fflate 安全解压（条目路径不得逃逸临时目录）→ `full.md` 走既有 SearchService 入库管道（chunks + `index_status='mineru_ready'`）→ `files.onContentChanged` 刷新；
- 任务 IPC：`mineru:enhance-file`、`mineru:get-status`（拉取式 `{state: 'queued'|'running'|'done'|'failed', message?}`）；下载域白名单（实现时以真实响应核实记录）；token 仅注入请求头；
- Renderer：素材库/课次资料文件右键菜单"增强解析（MinerU）"（token 未配置置灰 + 引导设置；office/pdf/图片可用；已 mineru_ready 提示；进行中显示状态）；
- 上下文自动受益验证：`mineru_ready` 文件经 `getFileChunks` 进入生成请求，公式 LaTeX 参与，KaTeX 渲染沿用既有链路。

## 不做

- 外部根目录只读资料不提供任何上传入口；
- 不新增运行时依赖（解压用 officeparser 依赖树内的 fflate）；
- 不做自动后台增强、批量队列 UI、搜索分词策略调整；
- 不做 vision 直读图片与 Anthropic provider。

## 验收

- 相关测试（迁移专项 + Service fake HTTP + IPC 守卫）、typecheck、lint、production build；
- 开发验证：以 `~\.config\mineru\` 既有有效 token 对真实 docx/扫描 PDF/题目照片各一份完成端到端解析（token 不打印不入库不入日志，留痕只记响应码与文件名）；
- 完成后更新 STATUS/GOAL_PROGRESS 并创建 `v1.6(V16-D): <摘要>` 本地提交。
