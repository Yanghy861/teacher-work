# T18 · managed 文件刷新核对与稳定变化检测

**前置：** T06、T15。  
**目标：** 把 Spike C 的刷新核对结论做成可复用 FileChangeService，为后续增量索引提供单一稳定信号，正确性不依赖 watcher 是否漏报。

## 实现范围

- managed 文件在工作区启动后台核对、工作台从外部程序返回焦点、重新打开文件和手动刷新时进入核对；启动/焦点核对先做轻量 size+mtime 筛选，Hash 与稳定读取在后台执行；
- 只可选监听 managed 对象目录；external 原件本任务不做实时监听。原始 watcher 事件仅将 file ID 标 dirty，不直接 Hash、解析或索引；
- 所有触发统一进入按 Spike 决策配置的 debounce/合并、size+mtime 多次稳定采样、可读检查、Hash 计算与去重；
- 同 file ID 同时至多一个稳定检查任务；任务期间再变化只在结束后补一次检查；
- Hash 未变清除 dirty；Hash 变化更新 files 元数据并发布一个稳定的 `contentChanged` 领域事件；
- 程序自己复制/rename 引发的事件不得产生重复业务变化；
- 观察状态和错误可查询，但不把技术事件词暴露给普通 UI。

## 不做

不接入正式 SearchService（T31）、不以固定 sleep 作为唯一稳定策略。

## 验收

- 使用 T06 的刷新核对探针和已记录的代表性 Office/WPS 普通保存结果做回放测试；
- 完全不注入 watcher 事件时，外部修改仍能在焦点返回、重新打开或手动刷新后产生一次 contentChanged；
- 连续事件最终最多产生一次必要 contentChanged，Hash 不变产生零次；
- 短暂不可读或仍在写入时保留 dirty/待核对状态并有界重试，不把中间态判为永久错误；
- 覆盖原规格测试 22 的监听部分。
