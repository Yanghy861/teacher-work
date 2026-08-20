# Lean V1 Phase 1 · L04 管资料验收

## 验收结论

L01–L03 已经能支持“建结构、导入资料、复制隔离、外部编辑后刷新”的单机日常流程。L04 的代表性验收在隔离临时 workspace 中完成，未使用真实教学资料。

流程为：

```text
一对一课程
  ├─ 2026 春·六下 → 分数基础 → 课次副本 A
  └─ 2028 秋·八上 → 二次函数 → 课次副本 B
学生 L04 学生
  └─ 源资料导入 → 两个课次独立副本
```

对副本 A 的内容进行外部文件写入后，执行 Main 侧 `refreshAll()`，检测到 A 的 Hash 变化；副本 B、源 managed 对象和原始 source 文件内容保持不变。随后软删除 A、确认 active 列表不再提供它、从包含 deleted 的 overview 看到它，再恢复并成功受控打开。测试同时确认两个课次 link 仍然存在。

## 证据与边界

- `tests/phase1-acceptance.test.ts` 使用真实 `initializeWorkspace`、SQLite migration、`CoreDataService` 和 `ManagedFileService`，覆盖两个不连续阶段、两个课次副本、学生实体、外部修改刷新、隔离、软删除和恢复。
- L02/L03 回归测试继续覆盖 managed 对象 UUID 布局、临时文件加原子重命名、未登记 ID/路径越界、Renderer/Main 文件 IPC 白名单、Preload runtime guard 和内容变化事件。
- Windows 真实 Electron UI smoke 已在同一 Windows 11 25H2/build 26200 环境完成：真实窗口保持 `sandbox: true`、`contextIsolation: true`，通过 native picker 导入脱敏 fixture，资料列表显示“已核对”，并验证加入当前课次/学生生成独立副本；应用正常关闭，未传入 `--no-sandbox`，测试 fixture 和临时 workspace 已清理。
- L04 不新增 external roots、生产 watcher、拖拽树、磁盘满矩阵、逐边界强杀或 1000+ 节点压力要求；这些按 Lean V1 决策留在 Later 或后续交付验证。

## 验证命令

```text
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
```

结果：全量测试、typecheck、lint、production build 和 diff check 均通过；测试文件为 13 个，测试为 34 项。

L04 完成后按协议以 `lean(L04): phase1 acceptance` 提交，然后将候选 SHA 写入 `SOL_REVIEW_STATUS.md`、标记 `AWAITING_REVIEW` 并创建送审元数据提交；Luna 不进入 L05。
