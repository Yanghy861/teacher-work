# V15-01 · 教学内容导航目标与双向入口

**前置：** `checkpoint-V1.4-pass`、V1.5 产品主规格、`V1_5_DECISIONS.md`，以及当前已存在的课次资料阅读能力。

## 范围

- 建立类型化 Renderer 教学内容目标：course、lesson、section 和可选来源 student；
- 左侧“我的课程”改为“课程”，移除独立“备课”，新增“教学内容”；
- 原全局草稿箱入口迁入“教学内容 / 草稿箱”，不迁移或复制草稿数据；
- 课程课次单击只选择 Viewed Lesson；双击和“查看教学内容”进入“课件”；
- 课程卡、课次和草稿中的明确备课动作进入“教学内容 / 备课”；
- 学生页在读/历史课程进入统一课程页，并保留返回原学生上下文；
- 直接打开“教学内容”恢复会话内最近有效目标；无有效目标时进入选择空状态；
- 返回课程或学生时恢复原选择；不修改 Current Lesson、数据库、Service 或 IPC。

## 验证

- App / CourseDashboard / CourseDetail / StudentsPage / DraftPanel 导航相关测试；
- 课程 → 课件、课程 → 备课、学生 → 课程 → 教学内容 → 返回学生、草稿 → 对应课次备课流程；
- 直接打开有最近位置和无最近位置两种 Renderer 流程；
- typecheck、lint、`git diff --check`，按风险补 build；
- 不运行 portable / installer。
