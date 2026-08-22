# V11-05 · V1.1 回归与 Windows 交付

**前置：** V11-01–V11-04 全部 DONE。

**结果：** 证明 V1.1 完整备课流程可用，且没有破坏已完成的 V1。

## 验收主流程

```text
我的课程 → 选择课次 → 开始备课
→ 从外部资料加入 PPTX/DOCX/PDF
→ 从素材库加入一份资料
→ 选择 Skill → 填写本次要求
→ 生成讲义 → 预览 → 原地编辑 → 保存修改
→ 重新生成并保留旧草稿
→ 生成例题和作业 → 保存到当前课次
→ 退出并重开 → 草稿与课次成果仍可用
```

## 轻量回归

- 代表性检查课程/学生/课次、managed 文件、素材复制、搜索、Parser、AI Gateway、备份恢复和 Windows portable 未退化。
- 检查外部路径不能逃逸、外部原件与素材不被课次修改影响、Renderer 无任意文件系统能力、Key 不进入日志/数据库/备份/Git。
- 不做大规模文件矩阵、第三方 Office 极端时序、压力测试或企业级故障注入。

## 自动质量门

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run package:portable`
- `git diff --check`
- 一条代表性 Windows packaged smoke

完成记录写入 `docs/v1.1-acceptance.md`。产品负责人完成一次真实但不敏感的流程体验并确认后，创建本地 `checkpoint-V1.1-pass`；不得自动 push。
