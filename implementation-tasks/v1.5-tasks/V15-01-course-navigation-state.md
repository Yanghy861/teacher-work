# V15-01 · 课程导航目标与双向返回

**前置：** `checkpoint-V1.4-pass`、V1.5 产品主规格、`V1_5_DECISIONS.md`，以及当前已存在的课次资料阅读能力。

## 范围

- 建立类型化 Renderer 课程导航目标：course、可选 lesson、课程分区和可选来源 student；
- 左侧“我的课程”改为“课程”，同步空状态、返回按钮和相关文案；
- 学生页在读/历史课程进入统一课程页，并保留返回原学生的上下文；
- 从课程课件进入备课时保存返回目标；“返回课程”恢复原课程、课次和分区；
- 直接打开全局备课/草稿箱时不伪造课程来源；
- 不修改数据库、Service、IPC、Current Lesson 或 Prep Lesson 事实语义。

## 验证

- App / CourseDashboard / StudentsPage / DraftPanel 导航相关测试；
- 学生 → 课程 → 返回学生、课程课件 → 备课 → 返回课程的 Renderer 测试；
- typecheck、lint、`git diff --check`，按风险补 build；
- 不运行 portable / installer。
