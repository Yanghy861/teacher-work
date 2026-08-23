# 教师工作台 V1.2 实施决策

本文件自 2026-08-23 起约束 V1.2 增量实施。V1.1 已在 `checkpoint-V1.1-pass` 完成并冻结；V1.2 只执行 `v1.2-tasks/V12-01`–`V12-05`，不得回改 L01–L12 或 V11-01–V11-05 的完成状态。

## 1. 产品主线

V1.2 只整理课程、课次、学生、点名和实际教学进度，不重做备课内核：

```text
课程树表达计划
实际上课与点名表达事实
Current Lesson 只给默认下一步
课程和学生是否继续始终由老师确认
```

产品真相以仓库根目录 `教师工作台_V1_2_课程与学生信息架构重构_产品与实施方案.md` 为准；参考图只提供布局关系。

## 2. 三种课次上下文

- Current Lesson 持久化在 `course_progress`，表示默认下一次处理的课次；每门活动课程最多一个，允许清空。
- Viewed Lesson 只存在 Renderer，点击查看不改变 Current Lesson。
- Prep Lesson 继续由 `LessonPrepContext.lessonId` 决定，提前备课不改变 Current Lesson。
- 已确认上过的课次不得成为 Current Lesson；同一内容再上一节时创建或复制新课次，不新增 session 模型。

## 3. 课程进度和边界

- `taught_confirmed_at` 是“本课已上”的唯一事实；任意课次可独立确认，不要求前序课次先发生。
- Renderer 展示系统建议并提交老师已确认的 `keep/clear/set` 决定；Service 不后台猜测下一课。
- 重复确认必须返回 `already_confirmed`，不覆盖原时间，不再次改变 Current Lesson。
- 确认 Current Lesson 只建议同阶段排序靠后的下一节未确认课次；阶段末尾不跨阶段自动推进。
- `expectedCurrentLessonId` 防止过期页面覆盖新状态；确认与进度决定必须在单一事务中完成。
- 结束课程只写 `ended_at` 并保留指针和历史；重新开启只清除 `ended_at`。开始下一阶段必须由老师明确确认。

## 4. 学生关系与点名

- `course_students.ended_at IS NULL` 表示在读；退出与重新加入只修改该字段，不删除历史点名、课程或学习记录。
- 一对一课程最多一位在读学生；V1.2 不保存多次加入/退出区间历史。
- `scheduled_at` 存 UTC ISO 8601；“今天”使用 Windows 本地日界转换出的 UTC 起止范围查询。
- 点名只有 `present/leave/absent`；保存完整名单，首次保存重新核对当前在读学生集合，历史修改严格匹配既有快照。
- 点名与“本课已上”互不触发、互不替代；无排课时间也可点名或确认已上。

## 5. UI 与复用边界

- 我的课程采用“全局导航｜课程列表｜课程详情”，详情只保留课次、学生、Viewed Lesson 资料。
- 学生页只提供列表、在读/历史课程和 `note_kind=manual` 学习记录；不暴露学生文件、附件、成绩或画像。
- 创建课程使用 Modal，课程与可选学生关联在同一 Main/Service 事务中完成。
- 复用 NodeService、CoreDataService、ManagedFileService、DraftService、LessonPrepContext、Search、Parser、AI、Backup；不改 V1.1 外部资料、素材、Skill、ContextBuilder、Gateway 和草稿核心语义。

## 6. 验证和交付

- V12-01–V12-04：相关测试、`npm run typecheck`、`npm run lint`；按风险补 build 或本地 smoke。
- V12-05：`npm test`、typecheck、lint、build、`git diff --check`、代表性本地 Windows 流程。
- V1.2 及后续小版本不运行 `package:portable`，不生成 portable、installer 或对外交付包。
- 只有 V12-05 全部验收通过并获得产品负责人最终体验确认后，才创建 `checkpoint-V1.2-pass`。

## 7. Later

排课日历、提醒通知、迟到分钟、出勤率/报表、课程百分比、学生画像/成绩、学生文件 UI、学习记录附件、复杂共享、复杂 enrollment 历史、多 session、文件复用、Workflow/Agent、新 AI 流程和企业级验证矩阵均不属于 V1.2。
