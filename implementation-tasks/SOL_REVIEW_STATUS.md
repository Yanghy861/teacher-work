# Sol 审核状态

状态只使用：

- `PENDING`：尚未到达审核点；
- `AWAITING_REVIEW`：Luna 已完成该段并停止，等待 Sol；
- `CHANGES_REQUIRED`：Sol 发现问题，Luna 只能修复本审核区间后再次送审；
- `PASS`：Sol 已审核通过，可以进入下一段。

权限规则：Luna 只能把 `PENDING`/`CHANGES_REQUIRED` 改为 `AWAITING_REVIEW` 并填写候选提交；只有独立的 Sol 审核会话可以写 `PASS` 或 `CHANGES_REQUIRED`。Sol 审核默认只审查、不直接修改产品代码。所有提交与标签操作必须服从 `VERSION_CONTROL.md`。

| 审核点 | 审核区间 | 状态 | 候选提交 SHA | 通过标签 | Sol 报告/备注 |
|---|---|---|---|---|---|
| T03 | T01–T03 | PASS | bfad00596e2b8ce5e0958829169d0141f99528e9 | checkpoint-T03-pass | `docs/reviews/T03-sol-review.md` 第二次复审通过；完整 Node 内置模块守卫与独立遍历探针均通过 |
| T08 | T04–T08 | PENDING | | | |
| T15 | T09–T15 | PENDING | | | |
| T20 | T16–T20 | PENDING | | | |
| T24 | T21–T24 | PENDING | | | |
| T32 | T25–T32 | PENDING | | | |
| T33 | T33 | PENDING | | | |
| T38 | T34–T38 | PENDING | | | |
| T40 | T39–T40 | PENDING | | | |
| T42 | T41–T42 | PENDING | | | |
