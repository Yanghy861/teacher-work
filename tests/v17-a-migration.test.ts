import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import {
  getAppliedMigrationVersions,
  runMigrations,
  workspaceMigrations,
  type SqliteDatabase,
} from '../src/main/db/migrations'

const roots: string[] = []
const databases: SqliteDatabase[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function createDatabase(): SqliteDatabase {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-v17a-mig-'))
  roots.push(root)
  const database = new Database(join(root, 'workspace.db')) as SqliteDatabase
  databases.push(database)
  database.pragma('foreign_keys = ON')
  return database
}

interface NoteSeed {
  readonly id: string
  readonly noteKind: string
  readonly draftStatus: string | null
  readonly body: string
  readonly occurredOn?: string
  readonly deleted?: boolean
}

function seedNotes(database: SqliteDatabase, notes: readonly NoteSeed[]): void {
  const insert = database.prepare(`
    INSERT INTO notes
      (id, student_id, lesson_id, body_md, created_at, updated_at, deleted_at,
       occurred_on, note_kind, ai_metadata_json, draft_status)
    VALUES (?, NULL, NULL, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
            ?, ?, ?, '{"kind":"lecture","promptVersion":"v11-03-v1","provider":"p","model":"m","sources":[],"inputChars":1,"maxChars":100,"maxTokens":100}',
            ?)
  `)
  for (const note of notes) {
    insert.run(
      note.id,
      note.body,
      note.deleted === true ? '2026-02-01T00:00:00.000Z' : null,
      note.occurredOn ?? null,
      note.noteKind,
      note.draftStatus,
    )
  }
}

function readNotes(database: SqliteDatabase): Array<Record<string, unknown>> {
  return database
    .prepare(
      `SELECT id, student_id, lesson_id, body_md, created_at, updated_at, deleted_at,
              occurred_on, note_kind, ai_metadata_json, draft_status
         FROM notes
        ORDER BY id`,
    )
    .all() as Array<Record<string, unknown>>
}

describe('V17-A migration v17 (notes note_kind CHECK rebuild)', () => {
  it('applies v17 on top of a fresh workspace and stays idempotent', () => {
    const database = createDatabase()
    const version = runMigrations(database, workspaceMigrations)
    expect(version).toBe(17)
    expect(getAppliedMigrationVersions(database)).toContain(17)

    expect(runMigrations(database, workspaceMigrations)).toBe(17)
  })

  it('upgrades a v16 workspace losslessly: rows, old kinds, occurred_on and foreign keys survive', () => {
    const database = createDatabase()
    runMigrations(database, workspaceMigrations.filter((migration) => migration.version <= 16))
    seedNotes(database, [
      { id: 'n-manual', noteKind: 'manual', draftStatus: null, body: '手工记录' },
      { id: 'n-draft', noteKind: 'lecture', draftStatus: 'draft', body: '讲义草稿' },
      { id: 'n-saved', noteKind: 'homework', draftStatus: 'saved', body: '作业定稿', occurredOn: '2026-01-15' },
      { id: 'n-deleted', noteKind: 'example', draftStatus: 'draft', body: '已删除例题', deleted: true },
    ])
    const before = readNotes(database)
    expect(before).toHaveLength(4)

    expect(runMigrations(database, workspaceMigrations)).toBe(17)
    expect(readNotes(database)).toEqual(before)

    const violations = database.pragma('foreign_key_check') as unknown[]
    expect(violations).toEqual([])
  })

  it('keeps old note_kind lifecycle semantics and accepts manual_edit with no draft status', () => {
    const database = createDatabase()
    runMigrations(database, workspaceMigrations.filter((migration) => migration.version <= 16))
    runMigrations(database, workspaceMigrations)

    const insert = database.prepare(`
      INSERT INTO notes
        (id, student_id, lesson_id, body_md, created_at, updated_at, deleted_at,
         occurred_on, note_kind, ai_metadata_json, draft_status)
      VALUES (?, NULL, NULL, ?, '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z',
              NULL, NULL, ?, NULL, ?)
    `)
    expect(() => insert.run('n-manual-edit', '人工编辑保存为第 2 版', 'manual_edit', null)).not.toThrow()

    // manual_edit 与 manual 并列：不允许进入 draft/saved 生命周期
    expect(() => insert.run('n-manual-edit-draft', '人工编辑', 'manual_edit', 'draft')).toThrow()
    // 旧语义不变：manual 无 draft_status；AI note 必须有 draft/saved
    expect(() => insert.run('n-manual-ok', '手工记录', 'manual', null)).not.toThrow()
    expect(() => insert.run('n-manual-draft', '手工记录', 'manual', 'draft')).toThrow()
    expect(() => insert.run('n-lecture-null', '讲义', 'lecture', null)).toThrow()
    expect(() => insert.run('n-lecture-ok', '讲义', 'lecture', 'draft')).not.toThrow()
  })
})
