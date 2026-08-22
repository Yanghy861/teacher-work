# V11-03 · Skill、本次要求与固定 Prompt

**前置：** V11-02。

**结果：** 老师可以选择简单 Skill、填写本次要求，并用固定动作生成三类内容。

## 最小范围

- 增加 Skill 的名称、Prompt 正文、创建/修改时间与软删除；在设置中提供简单新建、编辑、删除。
- 备课页提供可选 Skill 下拉框和可选“本次要求”文本框。
- 普通页面不展示字符/token 技术参数，继续使用受控默认预算。
- 扩展生成请求为：lesson、明确选中的 sources、可选 skill、可选 requirement、固定 DraftKind。
- Main 组合当前课次信息、资料、Skill、本次要求和固定任务；资料正文与指令分区。
- 草稿元数据记录必要的 Skill 快照、本次要求、来源、provider/model 和 prompt version，Skill 后续修改不改变历史草稿。
- 复用现有 AI Gateway、ContextBuilder、取消/错误处理和 `lecture/example/homework`；不重写 Gateway。
- 不实现 Workflow、节点、分支、循环、变量、Agent、Prompt Graph 或复杂 Skill 参数。

## 验证

- Skill 和本次要求均为空、只选 Skill、只填要求、两者同时使用的代表性组合正确进入 Prompt。
- 未选择的资料不发送，预算限制仍有效，班课无学生可以生成。
- API Key、Skill/资料边界和错误日志继续安全。
- 运行相关测试、typecheck、lint。
