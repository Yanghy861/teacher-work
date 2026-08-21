# Sol 审核状态

状态只使用：

- `PENDING`：尚未到达审核点；
- `AWAITING_REVIEW`：Luna 已完成该段并停止，等待 Sol；
- `CHANGES_REQUIRED`：Sol 发现阻塞问题，Luna 只能修复当前审核区间后再次送审；
- `PASS`：Sol 已审核通过，可以进入下一段。

Luna 只能把 `PENDING`/`CHANGES_REQUIRED` 改为 `AWAITING_REVIEW` 并填写候选提交；只有独立 Sol 会话可以写 `PASS` 或 `CHANGES_REQUIRED`。旧 T15/T20/T24/T32/T33/T38/T40/T42 审核点随 T09–T42 一并退役；当前审核链只有 T08、L04、L07、L10、L12。

| 审核点 | 审核区间 | 状态 | 候选提交 SHA | 通过标签 | Sol 报告/备注 |
|---|---|---|---|---|---|
| T03 | T01–T03 | PASS | bfad00596e2b8ce5e0958829169d0141f99528e9 | checkpoint-T03-pass | `docs/reviews/T03-sol-review.md` 第二次复审通过 |
| T08 | T04–T08 + Lean 范围裁决 | PASS | fe44b795830bdbcf96f17cc53a86402c1f9f0cd3 | checkpoint-T08-pass | `docs/reviews/T08-sol-review.md` 独立复审通过；上一轮三个 P1、一个 P2 均关闭，Lean 硬安全边界保留 |
| L04 | L01–L04 | PASS | b09467d110d9b6ea662e0eb111475e362f702548 | checkpoint-L04-pass | `docs/reviews/L04-sol-review.md` 独立审核通过；`review(L04): pass` 已提交 |
| L07 | L05–L07 | PASS | f110614d96e85095640b2eb8b2414a7a5a0ca92e | checkpoint-L07-pass | `docs/reviews/L07-sol-review.md` 独立复审通过；初审 P1 已关闭 |
| L10 | L08–L10 | PENDING | | | AI 备课阶段 |
| L12 | L11–L12 | PENDING | | | 备份、Windows 交付与最终验收 |
