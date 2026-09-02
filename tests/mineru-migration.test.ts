import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { getAppliedMigrationVersions, runMigrations, workspaceMigrations, type SqliteDatabase } from '../src/main/db/migrations'
import { initializeSearchSchema, migrateSearchSchema, SEARCH_SCHEMA_VERSION } from '../src/main/search/search-database'

const roots: string[] = []
const databases: SqliteDatabase[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function createDatabase(): SqliteDatabase {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-v16d-mig-'))
  roots.push(root)
  const database = new Database(join(root, 'workspace.db')) as SqliteDatabase
  databases.push(database)
  return database
}

/** 构造一个 v15 形态的 files 表并填入代表性行，模拟既有工作区升级前状态。 */
function seedV15Files(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE files (
      id TEXT PRIMARY KEY NOT NULL,
      original_name TEXT NOT NULL CHECK (length(trim(original_name)) > 0),
      size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
      mime_type TEXT NOT NULL,
      origin_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      mtime_ms REAL,
      content_hash TEXT,
      indexed_hash TEXT,
      index_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (index_status IN ('pending', 'indexed', 'no_text', 'parse_failed'))
    );
    INSERT INTO files (id, original_name, size_bytes, mime_type, created_at, updated_at, index_status)
      VALUES ('f-doc', '讲义.docx', 100, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '2026-01-01', '2026-01-01', 'indexed');
    INSERT INTO files (id, original_name, size_bytes, mime_type, created_at, updated_at, index_status)
      VALUES ('f-img', '题目.png', 50, 'image/png', '2026-01-02', '2026-01-02', 'no_text');
  `)
}

describe('V16-D migration v16 (files index_status CHECK rebuild)', () => {
  it('applies v16 on top of a fresh workspace and keeps idempotent', () => {
    const database = createDatabase()
    const version = runMigrations(database, workspaceMigrations)
    expect(version).toBe(16)
    expect(getAppliedMigrationVersions(database)).toContain(16)

    // 再次运行不重复应用、不报错（幂等）
    expect(runMigrations(database, workspaceMigrations)).toBe(16)
  })

  it('upgrades a v15-shaped workspace losslessly: rows, old status values, and foreign keys survive', () => {
    const database = createDatabase()
    seedV15Files(database)
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations (version, name, applied_at)
      SELECT version, name, applied_at FROM (
        SELECT 1 AS version, 'create_workspace_metadata' AS name, '2026-01-01' AS applied_at UNION ALL
        SELECT 2, 'create_core_data_tree', '2026-01-01' UNION ALL
        SELECT 3, 'create_managed_files', '2026-01-01' UNION ALL
        SELECT 4, 'add_managed_file_refresh_metadata', '2026-01-01' UNION ALL
        SELECT 5, 'add_managed_file_index_state', '2026-01-01' UNION ALL
        SELECT 6, 'create_ai_settings', '2026-01-01' UNION ALL
        SELECT 7, 'add_note_draft_metadata', '2026-01-01' UNION ALL
        SELECT 8, 'create_external_library_root', '2026-01-01' UNION ALL
        SELECT 9, 'allow_lesson_drafts_without_student', '2026-01-01' UNION ALL
        SELECT 10, 'create_prompt_skills', '2026-01-01' UNION ALL
        SELECT 11, 'add_draft_lifecycle', '2026-01-01' UNION ALL
        SELECT 12, 'add_course_progress_and_attendance', '2026-01-01' UNION ALL
        SELECT 13, 'add_lesson_session_duration', '2026-01-01' UNION ALL
        SELECT 14, 'add_historical_course_date_metadata', '2026-01-01' UNION ALL
        SELECT 15, 'create_material_library_tree', '2026-01-01'
      );
    `)

    expect(runMigrations(database, workspaceMigrations)).toBe(16)

    const rows = database
      .prepare('SELECT id, index_status FROM files ORDER BY id')
      .all() as Array<{ id: string; index_status: string }>
    expect(rows).toEqual([
      { id: 'f-doc', index_status: 'indexed' },
      { id: 'f-img', index_status: 'no_text' },
    ])

    // 旧值语义不变：CHECK 之外的非法值仍被拒绝
    expect(() =>
      database
        .prepare("INSERT INTO files (id, original_name, size_bytes, mime_type, created_at, updated_at, index_status) VALUES ('x', 'x', 1, 'text/plain', 't', 't', 'bogus')")
        .run(),
    ).toThrow()
    // 新值 mineru_ready 可写入（仅由 MinerU 流程使用）
    database
      .prepare("UPDATE files SET index_status = 'mineru_ready' WHERE id = 'f-doc'")
      .run()
    expect(
      (database.prepare("SELECT index_status FROM files WHERE id = 'f-doc'").get() as { index_status: string }).index_status,
    ).toBe('mineru_ready')
  })

  it('preserves foreign key relationships through the table rebuild', () => {
    const database = createDatabase()
    runMigrations(database, workspaceMigrations)
    database.exec(`
      INSERT INTO nodes (id, kind, title, created_at, updated_at) VALUES ('lesson-1', 'lesson', '第 1 讲', 't', 't');
      INSERT INTO files (id, original_name, size_bytes, mime_type, created_at, updated_at) VALUES ('f-1', 'a.pdf', 1, 'application/pdf', 't', 't');
      INSERT INTO lesson_files (file_id, lesson_id, created_at) VALUES ('f-1', 'lesson-1', 't');
    `)

    const violations = database.pragma('foreign_key_check') as unknown[]
    expect(violations).toEqual([])

    // 级联删除关系仍然有效
    database.prepare("DELETE FROM files WHERE id = 'f-1'").run()
    expect(
      (database.prepare("SELECT COUNT(*) AS count FROM lesson_files WHERE file_id = 'f-1'").get() as { count: number }).count,
    ).toBe(0)
  })

  it('keeps child link rows when upgrading a populated v15 workspace to v16 (regression, 2026-09-02)', () => {
    // 事故复盘：v15 真实工作区（lesson_files 286 行）升级到 v16 时，迁移事务内的
    // PRAGMA foreign_keys=OFF 是 no-op，DROP TABLE files 级联清空了 lesson_files。
    // 本测试用带关联行的 v15 库重放升级，钉死关联行必须逐条幸存。
    const database = createDatabase()
    seedV15Files(database)
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations (version, name, applied_at)
        SELECT version, name, applied_at FROM (
          SELECT 1 AS version, 'create_workspace_metadata' AS name, '2026-01-01' AS applied_at UNION ALL
          SELECT 2, 'create_core_data_tree', '2026-01-01' UNION ALL
          SELECT 3, 'create_managed_files', '2026-01-01' UNION ALL
          SELECT 4, 'add_managed_file_refresh_metadata', '2026-01-01' UNION ALL
          SELECT 5, 'add_managed_file_index_state', '2026-01-01' UNION ALL
          SELECT 6, 'create_ai_settings', '2026-01-01' UNION ALL
          SELECT 7, 'add_note_draft_metadata', '2026-01-01' UNION ALL
          SELECT 8, 'create_external_library_root', '2026-01-01' UNION ALL
          SELECT 9, 'allow_lesson_drafts_without_student', '2026-01-01' UNION ALL
          SELECT 10, 'create_prompt_skills', '2026-01-01' UNION ALL
          SELECT 11, 'add_draft_lifecycle', '2026-01-01' UNION ALL
          SELECT 12, 'add_course_progress_and_attendance', '2026-01-01' UNION ALL
          SELECT 13, 'add_lesson_session_duration', '2026-01-01' UNION ALL
          SELECT 14, 'add_historical_course_date_metadata', '2026-01-01' UNION ALL
          SELECT 15, 'create_material_library_tree', '2026-01-01'
        );

      CREATE TABLE nodes (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('course', 'period', 'lesson')),
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        parent_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      INSERT INTO nodes (id, kind, title, created_at, updated_at) VALUES
        ('lesson-fk', 'lesson', '第 1 讲', 't', 't');

      CREATE TABLE lesson_files (
        file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        lesson_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        PRIMARY KEY (file_id, lesson_id)
      );
      INSERT INTO lesson_files (file_id, lesson_id, created_at) VALUES
        ('f-doc', 'lesson-fk', 't'), ('f-img', 'lesson-fk', 't');
    `)

    expect(runMigrations(database, workspaceMigrations)).toBe(16)

    // 关联行逐条幸存（旧实现此数为 0）
    const links = database
      .prepare('SELECT file_id, lesson_id, created_at FROM lesson_files ORDER BY file_id')
      .all() as Array<{ file_id: string; lesson_id: string; created_at: string }>
    expect(links).toEqual([
      { file_id: 'f-doc', lesson_id: 'lesson-fk', created_at: 't' },
      { file_id: 'f-img', lesson_id: 'lesson-fk', created_at: 't' },
    ])
    expect(database.pragma('foreign_key_check')).toEqual([])
    // files 表重建后 CHECK 含 mineru_ready 且旧值语义不变
    expect(
      (database.prepare("SELECT index_status FROM files WHERE id = 'f-img'").get() as { index_status: string }).index_status,
    ).toBe('no_text')
    database.prepare("UPDATE files SET index_status = 'mineru_ready' WHERE id = 'f-img'").run()
    // 级联删除在重建后的表上仍然有效（外键在迁移完成后恢复）
    database.prepare("DELETE FROM files WHERE id = 'f-doc'").run()
    expect(
      (database.prepare("SELECT COUNT(*) AS count FROM lesson_files WHERE file_id = 'f-doc'").get() as { count: number }).count,
    ).toBe(0)
  })
})

/** 构造一个 v1 形态的 search.db（不含 mineru_ready 的旧 CHECK），模拟既有用户的搜索索引库。 */
function seedV1SearchSchema(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE search_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    INSERT INTO search_meta (key, value) VALUES ('schemaVersion', '1'), ('normalizerVersion', '1');

    CREATE TABLE search_documents (
      document_id TEXT PRIMARY KEY NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('file', 'node', 'note')),
      source_id TEXT NOT NULL,
      file_id TEXT,
      title TEXT NOT NULL,
      title_normalized TEXT NOT NULL,
      filename TEXT,
      filename_normalized TEXT,
      path TEXT,
      content_hash TEXT,
      index_status TEXT NOT NULL CHECK (index_status IN ('pending', 'indexed', 'no_text', 'parse_failed')),
      UNIQUE (source_type, source_id)
    );

    CREATE TABLE search_document_scopes (
      document_id TEXT NOT NULL REFERENCES search_documents(document_id) ON DELETE CASCADE,
      scope_node_id TEXT NOT NULL,
      PRIMARY KEY (document_id, scope_node_id)
    );

    CREATE TABLE search_chunks (
      chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL REFERENCES search_documents(document_id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      position_type TEXT,
      position_value TEXT,
      position_value_type TEXT,
      original_text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      UNIQUE (document_id, ordinal)
    );

    INSERT INTO search_documents
      (document_id, source_type, source_id, file_id, title, title_normalized, filename, filename_normalized, path, content_hash, index_status)
    VALUES
      ('doc-1', 'file', 'f-doc', 'f-doc', '讲义', '讲义', '讲义.docx', '讲义.docx', NULL, 'hash-1', 'indexed');

    INSERT INTO search_document_scopes (document_id, scope_node_id) VALUES ('doc-1', 'lesson-1');
    INSERT INTO search_chunks (document_id, ordinal, original_text, normalized_text) VALUES ('doc-1', 0, '旧索引片段', '旧索引片段');
  `)
}

describe('V16-D search schema v2 (search_documents CHECK rebuild)', () => {
  it('upgrades a v1 search database losslessly and accepts mineru_ready', () => {
    const database = createDatabase()
    seedV1SearchSchema(database)

    migrateSearchSchema(database)
    initializeSearchSchema(database)

    const version = database
      .prepare("SELECT value FROM search_meta WHERE key = 'schemaVersion'")
      .get() as { value: string }
    expect(version.value).toBe(String(SEARCH_SCHEMA_VERSION))
    expect(SEARCH_SCHEMA_VERSION).toBe(2)

    // 文档、子表数据原样保留，外键完整
    const document = database
      .prepare("SELECT document_id, index_status FROM search_documents WHERE document_id = 'doc-1'")
      .get() as { document_id: string; index_status: string }
    expect(document).toEqual({ document_id: 'doc-1', index_status: 'indexed' })
    expect(
      (database.prepare("SELECT COUNT(*) AS count FROM search_chunks WHERE document_id = 'doc-1'").get() as { count: number }).count,
    ).toBe(1)
    expect(
      (database.prepare("SELECT COUNT(*) AS count FROM search_document_scopes WHERE document_id = 'doc-1'").get() as { count: number }).count,
    ).toBe(1)
    expect(database.pragma('foreign_key_check')).toEqual([])

    // 新值 mineru_ready 可写入；非法值仍被拒绝
    database
      .prepare("UPDATE search_documents SET index_status = 'mineru_ready' WHERE document_id = 'doc-1'")
      .run()
    expect(() =>
      database
        .prepare("UPDATE search_documents SET index_status = 'bogus' WHERE document_id = 'doc-1'")
        .run(),
    ).toThrow()

    // 子表级联删除在重建后的表上仍然有效
    database.prepare("DELETE FROM search_documents WHERE document_id = 'doc-1'").run()
    expect(
      (database.prepare("SELECT COUNT(*) AS count FROM search_chunks WHERE document_id = 'doc-1'").get() as { count: number }).count,
    ).toBe(0)
  })

  it('is a no-op for a fresh database and keeps idempotent', () => {
    const database = createDatabase()
    database.exec(`
      CREATE TABLE search_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `)
    migrateSearchSchema(database)
    initializeSearchSchema(database)
    // 再次运行不重复应用、不报错（幂等）
    migrateSearchSchema(database)
    initializeSearchSchema(database)
    const version = database
      .prepare("SELECT value FROM search_meta WHERE key = 'schemaVersion'")
      .get() as { value: string }
    expect(version.value).toBe(String(SEARCH_SCHEMA_VERSION))
    expect(database.pragma('foreign_key_check')).toEqual([])
  })
})
