# 规格与任务追踪

## 能力覆盖

| 规格能力 | 任务 |
|---|---|
| Electron/React/TS、工作区分离、Migration、IPC | T01–T03 |
| 四项工程风险 Spike | T04–T08 |
| nodes、树、课程、一对一阶段、回收站 | T09–T12、T20 |
| 学生、记录、课程关联、附件 | T13、T19 |
| managed/external 文件、素材隔离、Office/WPS 变化检测 | T14–T20 |
| search.db、中文/数学混合检索、后台索引、进度与恢复 | T21–T32 |
| PDF/DOCX/PPTX/MD/TXT/XLSX 解析 | T22、T27–T30 |
| 安全 Key、AI Gateway、ContextBuilder、可恢复备课 | T33–T38 |
| 一致性备份、新工作区恢复、完整性检查 | T39–T41 |
| Windows 打包、升级、完整 V1 DoD | T42 |

## 原规格第 22 节自动/集成测试映射

| # | 验证主题 | 主责任任务 |
|---:|---|---|
| 1 | moveNode 不丢子节点 | T10 |
| 2 | 软删除后恢复 | T10、T20 |
| 3 | 不连续的一对一阶段 | T12 |
| 4–6 | 素材副本及 A/B 班隔离 | T16、T20 |
| 7 | 复制中断不留半文件 | T07、T15 |
| 8–9 | external missing 与根目录重定位 | T17 |
| 10 | managed PPTX 修改后重索引 | T18、T31 |
| 11、17 | search.db 删除重建且业务无损 | T31、T32 |
| 12 | 索引强杀后继续 | T07、T31、T32 |
| 13–14 | AI 已完成步骤保留、失败仅重试当前步 | T36–T38 |
| 15 | 备份恢复核心数据一致 | T40、T41 |
| 16 | 备份无 API Key | T33、T39、T41 |
| 18 | 树移动/重命名不移动 managed 物理文件 | T14、T20 |
| 19 | 中文/英文/题号/数学表达式 | T05、T23、T32 |
| 20 | no_text 与 parse_failed | T22、T26–T30 |
| 21 | 大规模索引不阻塞 Main | T24、T32 |
| 22 | watcher 事件风暴只产生一次必要索引 | T18、T31 |
| 23 | 进度恢复，processing 回 pending | T21、T31、T32 |
| 24 | 未全部完成时已就绪内容可搜 | T26、T32 |
| 25 | ContextBuilder 不发送未选中的整份大文档 | T35 |
| 26 | source manifest + content_hash | T35、T37 |
| 27 | SQLite 一致性快照并恢复到新工作区 | T39、T40 |
| 28 | 备份排除 search.db、缓存和 API Key | T39、T41 |

