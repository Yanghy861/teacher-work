# V14-03 · V1.4 全量回归与版本验收

**前置：** V14-01–V14-02 全部 `DONE`。

## 自动质量门

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`

不得运行 `package:portable`，不得生成 portable、installer 或对外交付包。

## 代表性流程

```text
导入有效 .tqbank → 搜索和组合筛选 → 分页浏览
→ 默认完整列表 → 点击题目 → 宽屏右侧 / 窄屏下方详情
→ 展开答案 / 解析 → 导入素材库 → 加入课程具体课次
→ 更换或移除题库快照 → 已复制文件仍可打开
→ 无效包导入失败且旧快照继续可用
→ V1.3 快速建课、课程、学生、备课和搜索无回归
```

## 最终证据

- 形成 `docs/v1.4-acceptance.md`；
- 真实快照 smoke 仅通过环境变量引用本地文件，不把路径或内容固化进普通测试；
- 产品负责人最终体验确认前不得创建 `checkpoint-V1.4-pass`；
- 不自动 push。
