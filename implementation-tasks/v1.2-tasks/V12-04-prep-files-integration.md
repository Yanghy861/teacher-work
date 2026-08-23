# V12-04 · 课次资料与 V1.1 备课接入

**前置：** V12-03 `DONE`；V1.1 的 LessonPrepContext、DraftService、ManagedFileService 与外部/素材入口保持冻结。

**结果：** Viewed Lesson 资料边界清楚，任意课次可开始/继续 V1.1 备课且不改变 Current Lesson。

## 最小范围

- 课程详情“资料”只显示 Viewed Lesson 的 `lesson_files`；无 Viewed Lesson 显示明确空状态。
- 课程卡对 Current Lesson 最近待处理草稿显示“继续备课”，否则“开始备课”；其他课次可从详情单独备课。
- Prep Lesson 文案与“保存到本次课次”一致指向 LessonPrepContext.lessonId。
- 保持 V1.1 外部资料、素材、Skill、本次要求、AI 三动作、草稿箱、同区预览编辑和保存核心逻辑不变。
- 收掉新的学生文件前端入口；保留 `student_files`、历史数据、搜索、备份和恢复兼容。
- 不改 Current Lesson 作为提前备课、打开草稿或保存成果的副作用。

## 验证

- Current 第 8 课、Viewed/Prep 第 9 课时，添加资料、生成和保存均绑定第 9 课，Current 仍为第 8 课。
- 课程卡只按 Current Lesson 草稿决定开始/继续，其他草稿仍可从全局或相应课次进入。
- 外部/素材 managed 独立副本、原资料保护、Parser/Search/AI/Backup 边界未退化。
- 学生页不暴露学生文件，但既有 student_files 数据与备份恢复不丢失。
- 运行 V12-04 相关测试、typecheck、lint，并按风险补 build 或本地 smoke。
