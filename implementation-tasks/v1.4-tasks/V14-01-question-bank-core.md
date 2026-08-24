# V14-01 · 题库快照、只读服务与安全 IPC

**前置：** `checkpoint-V1.3-pass`、V1.4 产品主规格、`V1_4_DECISIONS.md`。

## 范围

- `.tqbank` 完整快照导出器；
- staging 校验与原子替换；
- readonly + query-only package info、filters、search、detail；
- 单题 Markdown 复制服务；
- 类型化契约、Preload 和白名单 IPC；
- Main 生命周期接入，不实现题库 UI。

## 验证

- 题库 service / IPC 专项测试；
- typecheck、lint、build、`git diff --check`；
- 不读取或提交真实题库内容，不运行 portable / installer。
