import { randomUUID } from 'node:crypto'

import type {
  CourseMode,
  NodeKind,
  NodeRecord,
} from '../../shared/core-contracts'
import type { SqliteDatabase } from '../db/migrations'

export type NodeServiceErrorCode =
  | 'INVALID_TITLE'
  | 'INVALID_NODE_KIND'
  | 'NODE_NOT_FOUND'
  | 'INVALID_PARENT'
  | 'NODE_CYCLE'
  | 'NODE_DELETED'
  | 'PARENT_DELETED'
  | 'INVALID_SORT_ORDER'

export class NodeServiceError extends Error {
  readonly code: NodeServiceErrorCode

  constructor(code: NodeServiceErrorCode, message: string) {
    super(message)
    this.name = 'NodeServiceError'
    this.code = code
  }
}

export interface NodeServiceOptions {
  readonly idFactory?: () => string
  readonly now?: () => string
}

export interface CreateNodeInput {
  readonly kind: NodeKind
  readonly title: string
  readonly parentId?: string | null
  readonly courseMode?: CourseMode
  readonly contentMd?: string
}

interface NodeRow {
  readonly id: string
  readonly parent_id: string | null
  readonly kind: NodeKind
  readonly title: string
  readonly course_mode: CourseMode | null
  readonly sort_order: number
  readonly content_md: string
  readonly created_at: string
  readonly updated_at: string
  readonly deleted_at: string | null
}

export class NodeService {
  private readonly idFactory: () => string
  private readonly now: () => string

  constructor(
    private readonly database: SqliteDatabase,
    options: NodeServiceOptions = {},
  ) {
    this.idFactory = options.idFactory ?? randomUUID
    this.now = options.now ?? (() => new Date().toISOString())
  }

  createCourse(title: string, mode: CourseMode): NodeRecord {
    return this.createNode({ kind: 'course', title, courseMode: mode })
  }

  createPeriod(courseId: string, title: string): NodeRecord {
    return this.createNode({ kind: 'period', title, parentId: courseId })
  }

  createLesson(periodId: string, title: string): NodeRecord {
    return this.createNode({ kind: 'lesson', title, parentId: periodId })
  }

  createNode(input: CreateNodeInput): NodeRecord {
    const title = normalizeTitle(input.title)
    if (!isNodeKind(input.kind)) {
      throw new NodeServiceError('INVALID_NODE_KIND', '节点类型无效。')
    }
    if (input.kind !== 'course' && input.courseMode !== undefined) {
      throw new NodeServiceError('INVALID_NODE_KIND', '只有课程节点可以设置课程类型。')
    }

    return this.transaction(() => {
      const parentId = input.parentId ?? null
      this.assertParentForKind(input.kind, parentId)
      const id = this.idFactory()
      const now = this.now()
      const sortOrder = this.nextSortOrder(parentId)
      this.database
        .prepare(
          `INSERT INTO nodes
             (id, parent_id, kind, title, course_mode, sort_order, content_md,
              created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          id,
          parentId,
          input.kind,
          title,
          input.courseMode ?? null,
          sortOrder,
          input.contentMd ?? '',
          now,
          now,
        )
      return this.requireNode(id)
    })
  }

  getNode(nodeId: string, includeDeleted = false): NodeRecord | undefined {
    const row = this.database
      .prepare(
        `SELECT id, parent_id, kind, title, course_mode, sort_order, content_md,
                created_at, updated_at, deleted_at
           FROM nodes
          WHERE id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`,
      )
      .get(nodeId) as NodeRow | undefined
    return row === undefined ? undefined : mapNode(row)
  }

  listNodes(options: { readonly includeDeleted?: boolean } = {}): NodeRecord[] {
    const rows = this.database
      .prepare(
        `SELECT id, parent_id, kind, title, course_mode, sort_order, content_md,
                created_at, updated_at, deleted_at
           FROM nodes
          ${options.includeDeleted ? '' : 'WHERE deleted_at IS NULL'}
          ORDER BY parent_id IS NOT NULL, parent_id, sort_order, created_at, id`,
      )
      .all() as NodeRow[]
    return rows.map(mapNode)
  }

  renameNode(nodeId: string, title: string): NodeRecord {
    const normalizedTitle = normalizeTitle(title)
    return this.transaction(() => {
      this.requireActiveNode(nodeId)
      const updatedAt = this.now()
      this.database
        .prepare('UPDATE nodes SET title = ?, updated_at = ? WHERE id = ?')
        .run(normalizedTitle, updatedAt, nodeId)
      return this.requireNode(nodeId)
    })
  }

  moveNode(nodeId: string, parentId: string | null): NodeRecord {
    return this.transaction(() => {
      const node = this.requireActiveNodeRow(nodeId)
      this.assertNoCycle(nodeId, parentId)
      this.assertParentForKind(node.kind, parentId)
      const updatedAt = this.now()
      this.database
        .prepare('UPDATE nodes SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?')
        .run(parentId, this.nextSortOrder(parentId), updatedAt, nodeId)
      return this.requireNode(nodeId)
    })
  }

  reorderNode(nodeId: string, requestedSortOrder: number): NodeRecord {
    if (!Number.isInteger(requestedSortOrder) || requestedSortOrder < 0) {
      throw new NodeServiceError('INVALID_SORT_ORDER', '排序位置必须是非负整数。')
    }

    return this.transaction(() => {
      const node = this.requireActiveNodeRow(nodeId)
      const siblings = this.database
        .prepare(
          `SELECT id
             FROM nodes
            WHERE deleted_at IS NULL
              AND parent_id IS ?
            ORDER BY sort_order, created_at, id`,
        )
        .all(node.parent_id) as Array<{ id: string }>
      const siblingIds = siblings.map((sibling) => sibling.id).filter((id) => id !== nodeId)
      const insertionIndex = Math.min(requestedSortOrder, siblingIds.length)
      siblingIds.splice(insertionIndex, 0, nodeId)
      const updatedAt = this.now()
      const updateSortOrder = this.database.prepare(
        'UPDATE nodes SET sort_order = ?, updated_at = ? WHERE id = ?',
      )
      siblingIds.forEach((id, index) => updateSortOrder.run(index, updatedAt, id))
      return this.requireNode(nodeId)
    })
  }

  softDeleteNode(nodeId: string): NodeRecord {
    return this.transaction(() => {
      this.requireActiveNode(nodeId)
      const ids = this.collectSubtreeIds(nodeId)
      const deletedAt = this.now()
      const statement = this.database.prepare(
        'UPDATE nodes SET deleted_at = ?, updated_at = ? WHERE id = ?',
      )
      ids.forEach((id) => statement.run(deletedAt, deletedAt, id))
      return this.requireNode(nodeId, true)
    })
  }

  restoreNode(nodeId: string): NodeRecord {
    return this.transaction(() => {
      const node = this.requireNodeRow(nodeId)
      this.assertActiveAncestors(node.parent_id)
      const ids = this.collectSubtreeIds(nodeId)
      const updatedAt = this.now()
      const statement = this.database.prepare(
        'UPDATE nodes SET deleted_at = NULL, updated_at = ? WHERE id = ?',
      )
      ids.forEach((id) => statement.run(updatedAt, id))
      return this.requireNode(nodeId)
    })
  }

  private assertParentForKind(kind: NodeKind, parentId: string | null): void {
    if (kind === 'course') {
      if (parentId !== null) {
        throw new NodeServiceError('INVALID_PARENT', '课程必须位于根层级。')
      }
      return
    }

    const parent = parentId === null ? undefined : this.requireNodeRow(parentId)
    if (parent === undefined || parent.deleted_at !== null) {
      throw new NodeServiceError('INVALID_PARENT', '目标父节点不存在或已删除。')
    }
    const expectedKind = kind === 'period' ? 'course' : 'period'
    if (parent.kind !== expectedKind) {
      throw new NodeServiceError(
        'INVALID_PARENT',
        kind === 'period' ? '阶段必须位于课程下。' : '课次必须位于阶段下。',
      )
    }
  }

  private assertNoCycle(nodeId: string, parentId: string | null): void {
    const parents = new Map<string, string | null>()
    const rows = this.database
      .prepare('SELECT id, parent_id FROM nodes')
      .all() as Array<{ id: string; parent_id: string | null }>
    rows.forEach((row) => parents.set(row.id, row.parent_id))

    const visited = new Set<string>()
    let current = parentId
    while (current !== null) {
      if (current === nodeId) {
        throw new NodeServiceError('NODE_CYCLE', '不能把节点移动到自己的子树中。')
      }
      if (visited.has(current)) {
        throw new NodeServiceError('NODE_CYCLE', '节点父级关系已形成循环。')
      }
      visited.add(current)
      current = parents.get(current) ?? null
    }
  }

  private assertActiveAncestors(parentId: string | null): void {
    let current = parentId
    while (current !== null) {
      const row = this.requireNodeRow(current)
      if (row.deleted_at !== null) {
        throw new NodeServiceError('PARENT_DELETED', '父节点仍处于删除状态，不能恢复子节点。')
      }
      current = row.parent_id
    }
  }

  private collectSubtreeIds(nodeId: string): string[] {
    const rows = this.database
      .prepare('SELECT id, parent_id FROM nodes')
      .all() as Array<{ id: string; parent_id: string | null }>
    const children = new Map<string, string[]>()
    rows.forEach((row) => {
      if (row.parent_id === null) {
        return
      }
      const list = children.get(row.parent_id) ?? []
      list.push(row.id)
      children.set(row.parent_id, list)
    })

    const result: string[] = []
    const pending = [nodeId]
    while (pending.length > 0) {
      const current = pending.pop()!
      result.push(current)
      pending.push(...(children.get(current) ?? []))
    }
    return result
  }

  private nextSortOrder(parentId: string | null): number {
    const row = this.database
      .prepare(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
           FROM nodes
          WHERE deleted_at IS NULL
            AND parent_id IS ?`,
      )
      .get(parentId) as { next_sort_order: number }
    return row.next_sort_order
  }

  private requireActiveNode(nodeId: string): NodeRecord {
    const row = this.requireNodeRow(nodeId)
    if (row.deleted_at !== null) {
      throw new NodeServiceError('NODE_DELETED', '节点已删除，请先恢复后再操作。')
    }
    return mapNode(row)
  }

  private requireActiveNodeRow(nodeId: string): NodeRow {
    const row = this.requireNodeRow(nodeId)
    if (row.deleted_at !== null) {
      throw new NodeServiceError('NODE_DELETED', '节点已删除，请先恢复后再操作。')
    }
    return row
  }

  private requireNode(nodeId: string, includeDeleted = false): NodeRecord {
    const node = this.getNode(nodeId, includeDeleted)
    if (node === undefined) {
      throw new NodeServiceError('NODE_NOT_FOUND', '节点不存在。')
    }
    return node
  }

  private requireNodeRow(nodeId: string): NodeRow {
    const row = this.database
      .prepare(
        `SELECT id, parent_id, kind, title, course_mode, sort_order, content_md,
                created_at, updated_at, deleted_at
           FROM nodes
          WHERE id = ?`,
      )
      .get(nodeId) as NodeRow | undefined
    if (row === undefined) {
      throw new NodeServiceError('NODE_NOT_FOUND', '节点不存在。')
    }
    return row
  }

  private transaction<T>(callback: () => T): T {
    return this.database.transaction(callback).immediate()
  }
}

function normalizeTitle(title: string): string {
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new NodeServiceError('INVALID_TITLE', '标题不能为空。')
  }
  return title.trim()
}

function mapNode(row: NodeRow): NodeRecord {
  return {
    id: row.id,
    parentId: row.parent_id,
    kind: row.kind,
    title: row.title,
    courseMode: row.course_mode,
    sortOrder: row.sort_order,
    contentMd: row.content_md,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

function isNodeKind(value: unknown): value is NodeKind {
  return value === 'course' || value === 'period' || value === 'lesson'
}
