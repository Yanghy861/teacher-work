# V1532-A · 素材库逻辑目录模型与迁移

**状态：** 待产品负责人确认，不进入当前活动链

**前置：** V1.5.3.1 / V1531-B 完成；`docs/v1.5.3.2-material-library-plan.md` 获得确认。

## 目标

把“素材库”从托管文件平铺清单变成与磁盘对象路径解耦的、由老师维护的逻辑目录树。外部资料真实目录、课程/学生关联和 managed 文件对象路径继续保持原有事实。

## 范围

- 新增素材库文件夹和文件归属的数据模型；
- 冻结单父级规则：一份素材库原件最多属于一个逻辑文件夹；
- 保留文件夹名称、父子关系、同级排序、创建/更新时间和软删除状态；
- 为现有数据执行一次性整理：未关联课程/学生的活动原件进入“待整理”，已关联副本不进入素材库树；
- 保留已有 `files`、`lesson_files`、`student_files`、`origin_file_id` 语义；
- 明确“全部素材 / 最近使用 / 待整理 / 搜索”是系统入口，不与老师自建文件夹混为一谈。

## 必须先冻结的模型决策

- 推荐将“待整理”实现为 `folder_id IS NULL` 的虚拟系统入口，而不是可被重命名或删除的普通文件夹；
- `material_folder_items.file_id` 必须唯一，防止一份素材同时出现在多个目录；
- 删除文件夹只允许删除空文件夹；素材不会被级联删除；
- 删除素材仍复用现有 `files.deleted_at`，不增加第二套文件删除状态；
- 移动素材只更新逻辑归属，不移动 managed 文件对象目录。

若产品负责人不接受“待整理为空目录归属”的推荐方案，必须在进入 V1532-A 前明确替代语义，不在实现中自行猜测。

## 候选数据结构

```text
material_folders
  id TEXT PRIMARY KEY
  parent_id TEXT NULL REFERENCES material_folders(id)
  name TEXT NOT NULL
  sort_order INTEGER NOT NULL
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL
  deleted_at TEXT NULL

material_folder_items
  folder_id TEXT NULL REFERENCES material_folders(id)
  file_id TEXT PRIMARY KEY REFERENCES files(id)
  created_at TEXT NOT NULL
```

具体字段约束、索引、迁移版本号和“待整理”的最终表示必须在本任务开始前写入实现决策记录。

## 迁移规则

1. `files.deleted_at IS NULL` 且没有 `lesson_files` / `student_files` 关联的文件，归入“待整理”；
2. 已关联课程或学生的文件不建立素材库目录归属；
3. 已删除文件保留原删除状态，不恢复为活动素材；
4. 迁移可重复执行，不得重复插入目录归属；
5. 迁移失败必须回滚数据库事务，不改动 managed 文件实体；
6. 不根据外部资料真实路径生成素材库文件夹；
7. 不根据 MIME 类型生成“文档 / 图片 / 其他”文件夹。

## 不做

- 不移动或重命名磁盘上的 managed 文件；
- 不修改外部资料原文件或外部目录；
- 不新增全文索引、云同步、实时 watcher；
- 不改变课程、学生、课次或 AI notes 数据语义；
- 不实现多父级标签、快捷方式或同一素材的多目录投影。

## 验收

- 新旧数据库迁移后 `integrity_check=ok`；
- 现有素材只出现一次，课程副本和学生附件不进入素材库树；
- 重启后目录归属、排序和删除状态保持；
- 删除空文件夹可恢复/验证，删除非空文件夹被拒绝且素材不丢失；
- 迁移失败不会留下半条目录关系或半成品文件。

## 验证命令

- 迁移/模型专项测试；
- `npm run typecheck`；
- `npm run lint`；
- `npm run build`；
- `git diff --check`。

不运行 portable/installer，不提交真实教学资料、运行数据库或备份。
