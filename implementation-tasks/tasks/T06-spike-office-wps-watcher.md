# T06 · Spike C：Office/WPS 保存事件

**前置：** T01–T03；Windows 真机及实际支持的 Office/WPS。  
**目标：** 观察真实保存行为，确定 dirty、debounce、稳定检测和任务合并参数。

## 实现范围

- 建立 watcher 实验工具，优先测试 Chokidar，同时保留候选对照；
- 对 PPTX、DOCX、XLSX 执行普通保存、连续 Ctrl+S、另存为、自动恢复式保存、大文件保存、打开但未改、保存中退出；
- 记录 add/change/unlink/rename 等原始序列、size/mtime 变化、文件锁/可读性及最终 Hash；
- 实现并实验：事件仅标 dirty、可配置 debounce、多次 size+mtime 稳定采样、可读检查、Hash 去重、同 file_id 单任务合并；
- 验证任务执行中再次保存时，结束后只补一次必要检查；
- 结果写入 `docs/spike-results.md` 的 Spike C 章节，包括按应用/版本的事件特征和推荐参数范围。

## 不做

不接入正式索引器；不把固定等待 2～3 秒写成唯一判据；不声称未实测的软件可用。

## 验收

- 每种实际应用至少多轮可复现实验；
- 一次真实内容变化最终恰好产生一次“需要重建”决定，Hash 未变不重建；
- 事件风暴不会排出多份同文件任务；环境或人工保存流程不足时标 `BLOCKED`。

