# T15 · managed 文件导入、复制、打开与显示

**前置：** T14、T07 的故障结论。  
**目标：** 可靠地把普通文件纳入工作台或复制到节点，并允许用系统/Office/WPS 打开。

## 实现范围

- FileService 实现 `addManagedFile`、`copyFileIntoNode`、`openFile`、`revealFile`；
- 每个新业务文件生成新 file ID 和对象目录，绝不能用源树路径作为物理路径；
- 复制采用同目录 tmp → 完成 → 校验大小/可读性/Hash → 原子 rename → 数据库事务；
- 明确处理 rename 后、数据库提交前崩溃产生的孤儿，先记录可检测标记，完整清理由 T41 完成；
- Hash/大文件工作不得长时间占用 Electron Main；复制进度/失败可取消且不会伪装成功；
- open/reveal 只接受已登记 file ID，Main 自己解析路径，不接受 Renderer 传入任意绝对路径；
- 软删除文件记录时先保留物理对象，以支持回收站恢复。

## 不做

不做去重、断点续传、Office 内嵌编辑、搜索解析或自动永久清理。

## 验收

- 正常复制后文件内容/Hash 一致、记录与对象一一对应；
- 在 T07 定义的故障点强杀，不留下“available 但半文件”的状态；
- DB 失败、磁盘满、目标占用、同名文件、用户取消均有测试；
- Renderer 无法借 open/reveal 打开未登记路径。

