# V13-01 · 快速建课数据契约与原子编排服务

**前置：** `checkpoint-V1.2-pass`；冻结的 V1.3 产品方案；`V1_3_DECISIONS.md`。

**结果：** schema v13、共享契约、Main / Service 单事务和安全 IPC 可以一次创建完整课程框架；本任务不实现向导 UI。

## 最小范围

- schema v12→v13：为 `lesson_sessions` 增加可空 `duration_minutes` 与正数约束；旧数据无损。
- 扩展课次 session 摘要和更新时间能力，使日期与时长都能读取、创建、修改和清空。
- 在 shared 层定义 `CreateCourseSetupRequest`、结果和运行时校验；只增加一个 `core:create-course-setup` 白名单 IPC。
- Preload 只暴露类型化 `createCourseSetup()`，Renderer 不获得通用 invoke、SQLite 或 Node 能力。
- 建立 `CourseSetupService`（或等价单一编排服务），在一个事务内完成：
  - Main 最终校验；
  - 新学生创建；
  - 课程及关系创建；
  - 阶段、1–100 课次按顺序创建；
  - 对日期或时长非空的课次写入 session；
  - 初始化 Active Period 与第 1 课 Current Lesson。
- 任何一步失败整笔回滚；不确认已上、不写点名。
- 继续复用 NodeService、CoreDataService 和 V1.2 进度语义，不暴露零散 batch IPC。

## 必证边界

- existing / new 学生混合、空课程、一对一 0/1/2 人、重复 existing ID、重复 new name。
- new name trim/空值/100/101 字符；existing ID 在事务执行时已失效。
- 课次 1/100/101、空标题、非法 UTC、非法时长。
- `scheduledAt = null` 且 `durationMinutes = 90` 会持久化 session；两者均空时不创建空扩展行。
- 写入中途失败时，学生、课程、关系、阶段、课次、session、progress 均不残留。
- 第 1 课成为 Current，全部新课仍未确认已上。

## 验证

- 运行迁移、Core / Service / IPC / Preload 相关测试。
- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- 按 schema 与事务风险补 `npm run build`。
