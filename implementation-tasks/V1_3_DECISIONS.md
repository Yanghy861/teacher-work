# 教师工作台 V1.3「快速建课」冻结实施决策

**冻结日期：** 2026-08-24

**固定基线：** `checkpoint-V1.2-pass`

**产品主规格：** `教师工作台_V1_3_快速建课_产品与实施方案.md`

本文件只记录实施时不可再自行改变的裁决。界面图用于布局和交互关系；与主规格或本文件冲突时，以文字为准。

## D01 · V1.3 是批量初始化编排层

- 不重做 `Student`、`Course`、`course_students`、`Period`、`Lesson`、`lesson_sessions` 或 `course_progress` 的领域语义。
- Renderer 可以完成名单、课次、日历、例外和摘要预览；最终写入只通过一个严格白名单 `createCourseSetup()`。
- 新学生、课程、关系、阶段、课次、session 和 Current Lesson 必须在一个 Main / Service 事务内完成，任一步失败整笔回滚。
- 不把批量学生、批量课次、批量排课分别暴露成 Renderer IPC。

## D02 · 学生档案和课程没有强制先后顺序

- 已有学生可以直接关联；名单中的新学生可在快速建课事务里创建并关联。
- 班课和一对一都允许暂时没有学生；一对一任何时刻最多一位在读学生。
- 空课程可以建课和备课；无在读学生时不得保存点名，并沿用 V1.2 的明确空名单提示。
- 已有“新建学生”“仅创建课程”和后续增删学生入口全部保留。

## D03 · 学生解析只做精确匹配

- Renderer 对姓名逐行 trim、忽略空行并对本次精确同名去重。
- 活动学生精确匹配 0 位时可新建；1 位时直接关联；多位时必须人工选择已有学生或明确新建同名学生。
- 不做模糊自动合并，不自动恢复或关联软删除学生。
- 只要还有重名待确认，第一步“下一步”必须禁用。
- Main 在事务开始后重新校验 new name 与 existing student ID，不信任几分钟前的 Renderer 预览。

## D04 · 一次最多创建 100 节课

- 快速建课必须创建一个阶段和 `1–100` 节课。
- 空课次数量与教学计划有效非空主题使用同一上限。
- 第 101 项开始整次拒绝，不截断；提示固定为“`一次最多创建 100 节课，请拆分阶段。`”。
- 空课次实际标题写入“未命名”，编号仍按阶段内 `sort_order` 动态显示。

## D05 · 排课只有三种正式模式

- `regular`：按规律排课，只支持每周、每两周。
- `free_dates`：在月历中多选不连续日期。
- `unscheduled`：暂不排课。
- 删除“不重复”；V1.3 不持久化 recurrence / series 规则。
- Renderer 提交每个 lesson 最终、显式的 `scheduledAt`，Main 不重算周期。

## D06 · 日历按本地日期计算，落库使用 UTC

- 每周 / 每两周和自由日期均按 Windows 本地日历生成，再逐项转换为 UTC ISO 8601。
- 不允许用 UTC 毫秒简单增加 `7 * 24h` 代替本地周递增。
- 规律排课排除一个日期时，不删除课次，后续课次顺延映射到下一个有效日期。
- V1.3 首版一个日期只对应一节课；同日多课进入 Later。

## D07 · 自由日期与课次数量不一致必须显式处理

- 空课次模式下，默认允许选中日期数同步课次数；覆盖原数量前必须确认。
- 教学计划模式下，日期按顺序匹配主题；日期较少时必须继续选日期或明确保留剩余未排课课次。
- 不得为了匹配日期而静默删除、截断或重排教学主题。

## D08 · 课程时长持久化在 lesson_sessions

- schema v13 为 `lesson_sessions` 增加可空 `duration_minutes`，值非空时必须为正整数。
- 不增加 course 级默认时长字段。
- session 的创建 / 更新条件固定为 `scheduledAt !== null || durationMinutes !== null`。
- `scheduled_at = NULL` 且 `duration_minutes = 90` 是合法状态；“暂不排课”不丢失时长。
- 现有 V1.2 数据无损迁移，旧 session 的时长保持 `NULL`。

## D09 · 排课、Current Lesson 和实际上课彼此独立

- 创建成功后第 1 课成为 Current Lesson，阶段成为 Active Period。
- 所有新课次 `taught_confirmed_at` 为空，不写点名，不推进到下一课，不结束课程。
- `scheduled_at` 只表示计划时间；是否已经上课继续由 V1.2 确认流程决定。

## D10 · 确认页和成功结果必须覆盖非 happy path

- 全部已排显示 `N/N 节已排`。
- 部分已排显示 `M/N 节已排 · N-M 节未排`。
- 完全未排显示“暂未安排上课时间”和 `0/N 节已排 · N 节未排`。
- 创建成功关闭向导、选中新课程并显示非阻断式成功提示；不再追加成功 Modal。
- 创建失败保持全部输入，返回可定位步骤的错误，允许修改后重试。

## D11 · Main 最终校验是安全边界

- `new.name` trim 后长度为 `1–100` 个 Unicode 字符；existing student 必须仍存在且未软删除。
- existing ID 不得重复；new name 按 trim 后精确值去重。
- 课程、阶段、lesson 标题 trim 后必须非空；lessons 为 `1–100`。
- `scheduledAt` 必须为有效 UTC ISO 8601；`durationMinutes` 必须为正整数或 `null`。
- 继续复用 V1.2 的父子关系、课程模式、一对一人数和 Current Lesson 合法性约束。

## D12 · 兼容与范围边界

- 保留现有逐项创建、阶段 / 课次维护、学生增删、设置时间和 Current Lesson 调整能力。
- 不改 LessonPrepContext、DraftService、ManagedFileService、Search、Parser、AI 或 Backup 的产品语义。
- 不新增独立月 / 周日历页、节假日库、提醒、通知、签到、成绩分析、拖拽排课、永久 recurrence、多 session、学生画像、联系方式或新 AI 工作流。
- V1.3 不运行 portable / installer packaging，不创建对外交付包。
