# V12-05 · V1.2 全量回归与版本验收

**前置：** V12-01–V12-04 全部 `DONE`。

**结果：** 证明 V1.2 课程/学生/点名/进度主流程可用，V1.1 备课内核和 V1 安全能力未退化。

## 自动质量门

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`

不得运行 `package:portable`，不得生成 portable、installer 或对外交付包。

## 代表性本地 Windows 流程

```text
新建学生和班课 → 创建阶段与多课次 → 第一课成为 Current
→ 设置今日/跨午夜课次时间 → 今日待点名正确
→ 保存/修改点名且不推进 → 名单变化拒绝旧弹窗保存
→ 第 9 课先于第 8 课点名并确认 → 两课记录独立
→ 提前准备非 Current 课次 → Current 不变
→ 确认非 Current 保持指针 → 确认 Current 接受下一课建议
→ 阶段末不跨阶段 → 暂停后重开仍保持 → 手工开始下一阶段
→ 班课学生退出且历史点名保留 → 结束并重开课程
→ 课程树、资料、草稿、manual 记录、搜索与备份数据均未丢失
```

## 安全回归

- Renderer 仍只使用类型化、运行时校验的白名单 IPC，不接触 SQLite、Node、任意路径或 Key。
- 进度、点名与课程学生写操作均由 Main/Service 事务约束；过期状态和跨课程引用被拒绝。
- 外部原件、managed 原资料、API Key、运行数据库、索引和备份不进入 Git，也不被 AI 草稿或保存成果覆盖。

完成证据写入 `docs/v1.2-acceptance.md`。自动门、Windows 代表性流程和产品负责人最终体验均通过后，才在最终提交创建 `checkpoint-V1.2-pass`；不 push。
