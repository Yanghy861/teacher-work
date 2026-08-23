# V12-01 · Core、课程生命周期与点名持久化

**前置：** `checkpoint-V1.1-pass`；冻结的 V1.2 产品方案；`V1_2_DECISIONS.md`。

**结果：** schema v12 与 Main/Service/IPC 增量完整表达课程进度、课次时间、实际上课、点名和学生在读关系，Renderer 仍不直接接触 SQLite。

## 最小范围

- 为 `course_students` 增加 `ended_at`；新增 `course_progress`、`lesson_sessions`、`lesson_attendance` 与必要索引，旧数据无损迁移。
- `CoreOverview` 一次返回课程进度与课次 session 摘要；不新增逐行 IPC。
- 增加课程进度服务：确认/撤销本课已上、设置/清空 Current Lesson、开始阶段、结束/重开课程。
- 确认与 `keep/clear/set` 决定使用单一事务和 `expectedCurrentLessonId`；重复确认幂等返回 `already_confirmed`。
- 增加学生独立创建、事务化创建课程与可选学生关联、退出/重新加入、一对一在读限制。
- 增加薄 AttendanceService 和三个严格白名单 IPC：更新时间、读取点名、整份保存点名。
- 时间只接受 UTC ISO 8601；首次点名保存重查当前在读名单，历史修改严格匹配快照。
- 节点移动/软删除后清理或拒绝失效进度指针；结束课程拒绝普通推进。

## 验证

- schema v11→v12 旧课程、学生、资料、草稿无损；重复打开幂等。
- 跨课程/跨阶段目标、已确认课次、过期 expected pointer、非法时间与非法点名状态被拒绝。
- 任意课次可独立点名/确认；保存点名不推进；阶段末课不跨阶段；重复确认不改时间或进度。
- 学生退出不删除历史点名/记录，重新加入不改旧快照；首次保存期间名单变化整笔回滚。
- 运行 V12-01 相关测试、typecheck、lint；按风险补 production build。
