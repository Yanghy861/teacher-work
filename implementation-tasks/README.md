# 教师工作台 V1 / V1.1 · 实施入口

Lean V1 的 T01–T08 与 L01–L12 已完成，稳定基线为 `checkpoint-L12-pass`。旧 T09–T42 仅保留历史，不得继续执行。2026-08-22 起，当前活动版本为 V1.1，只执行 `v1.1-tasks/V11-01`–`V11-05`。

## 推荐用法

- V1.1 产品方案：[`../教师工作台_V1_1_产品与实施方案.md`](../教师工作台_V1_1_产品与实施方案.md)；
- V1.1 产品取舍与 Later：[`V1_1_DECISIONS.md`](V1_1_DECISIONS.md)；
- 单独执行一个 V1.1 里程碑：使用 [`V1_1_RUN_PROMPT.md`](V1_1_RUN_PROMPT.md)；
- V1 历史长期 Goal 与审核提示词继续保留用于追溯，不再作为活动执行入口；
- 唯一活动任务索引：[`TASK_INDEX.md`](TASK_INDEX.md)；
- 唯一状态表：[`STATUS.md`](STATUS.md)；
- Git 与审核标签：[`VERSION_CONTROL.md`](VERSION_CONTROL.md)。

## 已完成的 Lean V1

| 阶段 | 里程碑 | 审核结果 |
|---|---|---|
| 管资料 | L01–L04 | 课程/学生/课次、managed 文件、素材副本、刷新可用 |
| 找资料 | L05–L07 | 常见教学文档可解析、搜索、打开来源和简单重建 |
| AI 备课 | L08–L10 | 安全 Key、选资料、独立生成并保存三类草稿 |
| 备份交付 | L11–L12 | 空闲态备份恢复与 Windows 可运行交付 |

V1 的 Sol 审核点 T08、L04、L07、L10、L12 均已 PASS。

## 当前 V1.1 轻量实施

| 阶段 | 里程碑 | 结果 |
|---|---|---|
| 找到资料 | V11-01 | 单 external root 的安全 lazy 资料树 |
| 带入本课 | V11-02 | 从课次进入备课并复制独立资料 |
| 告诉 AI | V11-03 | Skill、本次要求与固定三动作 |
| 形成成果 | V11-04 | 草稿箱、同区预览编辑、保存到课次 |
| 交付 | V11-05 | V1 回归与 Windows portable 验收 |

V1.1 只有 V11-05 一个最终验收点。普通里程碑只跑相关测试、typecheck、lint；最终里程碑再跑全量测试、build、portable packaging 和代表性 Windows smoke。

## 继续不提前实现的能力

不要求多 external root、后台扫描/同步、watcher、外部资料全文索引、草稿版本树、Workflow/Agent、WPS 极端时序矩阵、索引精确断点续传、在线并发备份或完整升级矩阵。真实 API 冒烟只有用户愿意在本地应用临时配置 Key 时才做；没有 Key 可继续使用 fake provider 验收。
