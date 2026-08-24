# V15-02 · 课次课件浏览与备课动作分离

**前置：** V15-01 `DONE`。

## 范围

- 课程详情分区统一为“课次目录 / 学生 / 课件”；
- 单击课次只选择 Viewed Lesson；移除双击直接进入备课；
- 双击课次与明确“查看课件”按钮进入同一课件分区；
- 课件区显示课程 / 阶段 / 课次上下文，并支持上一课、下一课和指定课次切换；
- 复用 LessonFilesSection / LessonMaterialReader 展示本课文件、引用图片和空状态；
- “开始备课 / 继续备课”保持独立可见，不因打开课件自动触发；
- 已结束课程和学生历史课程仍可浏览已有课件；不提前加入文件整理或新数据能力。

## 验证

- 课次单击、双击、按钮、键盘可达与 Current Lesson 不变的 UI 测试；
- 课件区跨课次切换、文件刷新、空状态和明确备课入口测试；
- 课程直达与学生转入两条代表性 Renderer 流程；
- typecheck、lint、build、`git diff --check`；
- 隔离 Electron UI smoke，不运行 portable / installer。
