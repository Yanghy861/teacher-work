# L12 · Windows 交付与 Lean V1 总闸门

**前置：** L11。
**结果：** 产出一种可在真实 Windows 上安装或直接运行的 Lean V1；完成后等待最终 Sol 审核。

## 最小范围与验收

- 在 installer 与便携版中选择实现更简单、当前机器可验证的一种；不要求自动升级器或多版本升级矩阵。
- 验证首次启动、选择/创建工作区、正常退出和再次打开；若有卸载器，卸载不得删除工作区。
- 完成四条 smoke：管理资料、搜索资料、AI fake-provider 备课、备份恢复。
- 审计 Renderer 安全设置、生产依赖、调试开关、Key/真实资料未进入包。
- 运行完整测试、typecheck、lint、production build/packaging；形成 `docs/v1-acceptance.md`，明确 Later 和已知限制。
- 只有核心流程不可运行、存在数据损坏/路径越界/秘密泄漏或交付物无法启动时才阻塞；非核心体验缺口进入 Later。
