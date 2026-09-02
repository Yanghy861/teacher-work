# V16-D · MinerU 文档解析集成

**状态：** `DONE`（2026-09-02）

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

## 完成记录（2026-09-02）

**实现：**

- Migration v16 `extend_files_index_status_for_mineru`：files 表 12 步法重建，CHECK 追加 `mineru_ready`；
- **测试驱动的关键修复**：`search_documents.index_status` 的 CHECK 同样不含 `mineru_ready`（旧 schemaVersion 1）——Service 测试首轮暴露 `SQLITE_CONSTRAINT_CHECK`。新增 search schema v2（`SEARCH_SCHEMA_VERSION = 2`）：`openSearchDatabase` 先读 `search_meta.schemaVersion` 再按 12 步法仅重建 `search_documents`（子表 scopes/chunks/FTS 与数据原样保留，FK-off + `foreign_key_check`）；新库 DDL 直接含 `mineru_ready`；
- `secure-storage.ts` 多槽化：`createElectronSecureStorage(slot)`，mineru 槽路径 `teacher-workbench-mineru-key.bin`，ai 槽保持旧名 `teacher-workbench-ai-key.bin`（不迁移不改名）；
- `MineruSettingsService`（token 仅 safeStorage，无 DB 行）+ IPC `mineru:get-settings/update-settings/clear-token/test-connection`（判活 GET `/api/v4/extract-results/batch/<探测ID>`：401/403 → 无效 token、402 → 配额、其余通过）；
- `MineruService.enhanceFile`：active/≤200MB/office-pdf-图片 校验 → upload-urls → 域白名单 PUT 上传 → extract 任务（vlm/ch/OCR+公式+表格）→ 轮询（5s/30min，超时按 `parse_failed` 入库；`close()` 清理定时器）→ zip 下载（下载域白名单 mineru.net/*.aliyuncs.com）→ fflate 内存解压 + 条目路径锚定防穿越 → `full.md` 经既有 SearchService 管道入库（`index_status='mineru_ready'`）；token 仅注入 Authorization 头；
- `mineru:enhance-file` / `mineru:get-status` 拉取式状态；设置卡（token 密码框不回显、留空保持、测试连接、删除）；素材库文件右键"增强解析（MinerU）"（未配置 token 置灰引导设置）+ 课次资料阅读器"增强解析"按钮（进行中禁用并显示状态）。

**测试（新增 3 文件 16 例，全部通过）：**

- `tests/mineru-migration.test.ts`（5）：workspace v16 幂等 / v15→v16 无损升级（旧值语义不变、非法值拒绝、mineru_ready 可写）/ 外键与级联保留；search v1→v2 无损升级（文档/chunks/scopes 保留、FK 完整、级联仍有效）/ 新库幂等；
- `tests/mineru-service.test.ts`（6，fake fetcher + fflate zipSync）：全管道（请求序 upload-urls → PUT → extract/task → extract-results，token 仅在 Authorization 头，files 表 `mineru_ready` + chunks 入 search.db）/ 非增强类型、超 200MB、缺 token 拒绝 / running 持续轮询至 done / 云端 failed 透传 err_msg / 下载域白名单拒绝 / 重复提交阻断；
- `tests/static-render-v156-d.test.ts`（沿用 V156-D 先例）：设置卡（token 字段无 value 回显、测试连接、加密存储说明）、右键菜单（增强解析项、未配置 token 置灰）、阅读器按钮（进行中状态）字符串钉测；
- 历史版本测试的 schema 版本钉测按既有惯例随 migration v16 同步（workspace-foundation / v1.1 / v1.2 / v1.3 各版本号 pin 15→16，roll-back 测试的失败迁移改用 version 17）——验收标准本身未改写。

**门禁：** 全量 70 files / 301 tests（300 通过、1 跳过 = 受控 real-smoke）；typecheck 0 错误；eslint 0 问题；production build 通过；`git diff --check` 干净。

**真实自测（V16-E 统一执行）：** 本任务真实 MinerU 端到端验证按 D26/V16-E 统一进行（真实 token 留给产品负责人自测；自动化侧以 fake HTTP 全路径覆盖）。

**Git：** 本地提交 `v1.6(V16-D): integrate mineru document parsing`。

## 事故补记：migration v16 级联清空关联表（2026-09-02 当日发现、当日修复）

**事故：** 产品负责人真实工作区于 2026-09-02 19:51 打开应用触发 migration v16 时，"教学内容工作台"各课次资料列表全部变空。

**根因：** `runMigrations` 将迁移 `up` 包在 better-sqlite3 事务中执行；SQLite 规定 `PRAGMA foreign_keys` 在事务内为静默 no-op，因此 migration v16 SQL 内的 `PRAGMA foreign_keys=OFF` 无效。`DROP TABLE files`（12 步法重建第 9 步）触发隐式 `ON DELETE CASCADE`，把 `lesson_files`（286 行）清空，并把 `files.origin_file_id` 的 1 处引用 SET NULL。`student_files` / `material_folder_items` 本为 0 行，无实际损失。文件本体（285 份活动 managed 文件）、课次/学生/文件夹、AI 笔记全部完好（对象副本复制发生在建表之前，且 DROP 只删元数据行）。原 v15 外键专项测试（seed 无关联行）未能覆盖此路径。

**数据恢复（当日完成）：**
- 发现前已抢建完整备份（`%APPDATA%\TeacherWorkspace-recovery-backup-20260902\`，411MB，含 data/files/search 全量）；
- 关键证据：v16 改动当时仅写入 WAL、尚未 checkpoint 进主文件，备份中的 `workspace.db` 主文件保留 v15 终态——`lesson_files` 286 行与原始 `created_at` 完整；与 search.db scopes（858 条 file→course/period/lesson 链）交叉核对完全一致（快照 286 条全部 ⊆ scopes；引用的 file/lesson 在当前库全部存在）；
- 以 ATTACH 快照方式将 286 条 `lesson_files` 原样写回 + 1 条 `origin_file_id` 还原，事务内执行，`foreign_key_check` 通过；恢复后各课次资料计数与快照逐课次一致（期中复习（2）40 份等）；
- 备份与迁移前快照（`pre-migration-workspace.db`）保留于备份目录备查。

**代码修复（先红后绿验证）：**
- `runMigrations` 框架级 FK 守卫：迁移事务开启**之前**（事务外）`PRAGMA foreign_keys=OFF`，全部迁移完成后恢复 ON 并强制 `foreign_key_check`，有违例则抛错中止启动；try/finally 确保任何路径下外键恢复；
- migration v16 移除 SQL 内无效的两条 PRAGMA（注释保留事故复盘）；
- 新增回归测试 `keeps child link rows when upgrading a populated v15 workspace to v16`：带 2 条 lesson_files 的 v15 库升级后关联行逐条幸存、旧值语义不变、重建后级联仍有效；stash 修复运行该测试确认旧实现下失败（关联被清空）、修复后通过；
- 门禁复跑：全量 70 files / 302 tests（301 通过、1 跳过）、typecheck 0 错误、lint 通过、production build 通过、`git diff --check` 干净。

**Git：** 本地提交 `v1.6(V16-D): fix migration v16 cascade and restore link rows`。
