# T18 · managed 文件稳定变化检测

**前置：** T06、T15。  
**目标：** 把 Spike C 的真实结论做成可复用 FileChangeService，为后续增量索引提供单一稳定信号。

## 实现范围

- 只监听 managed 对象目录；外部原件本任务不做实时监听；
- 原始 watcher 事件仅将 file ID 标 dirty，不直接 Hash、解析或索引；
- 实现按 Spike 决策配置的 debounce、size+mtime 多次稳定采样、可读检查、Hash 计算与去重；
- 同 file ID 同时至多一个稳定检查任务；任务期间再变化只在结束后补一次检查；
- Hash 未变清除 dirty；Hash 变化更新 files 元数据并发布一个稳定的 `contentChanged` 领域事件；
- 程序自己复制/rename 引发的事件不得产生重复业务变化；
- 观察状态和错误可查询，但不把技术事件词暴露给普通 UI。

## 不做

不接入正式 SearchService（T31）、不以固定 sleep 作为唯一稳定策略。

## 验收

- 使用 T06 记录的 Office/WPS 事件序列做回放测试和真机复测；
- 连续事件最终最多产生一次必要 contentChanged，Hash 不变产生零次；
- 大文件保存期间不会读取半文件或把临时不可读判为永久错误；
- 覆盖原规格测试 22 的监听部分。

