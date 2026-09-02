import Database from 'better-sqlite3'

import type { WorkspacePaths } from '../workspace/workspace-paths'

/** v2：search_documents.index_status 的 CHECK 增加 'mineru_ready'（配合 workspace migration v16）。 */
export const SEARCH_SCHEMA_VERSION = 2

const SEARCH_INDEX_STATUS_CHECK = `index_status IN ('pending', 'indexed', 'no_text', 'parse_failed', 'mineru_ready')`

export interface SearchDatabase {
  readonly databasePath: string
  readonly raw: Database.Database
  close(): void
}

export function openSearchDatabase(paths: WorkspacePaths): SearchDatabase {
  const database = new Database(paths.searchDatabasePath, { timeout: 5000 })
  database.pragma('journal_mode = WAL')
  database.pragma('synchronous = NORMAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  try {
    // 先建 meta 表并读取版本：旧库必须先迁移，再执行 CREATE IF NOT EXISTS 全量 DDL
    // （否则 schemaVersion 会被 DDL 尾部的 upsert 覆盖为新版本，迁移判断失效）。
    database.exec(`
      CREATE TABLE IF NOT EXISTS search_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `)
    migrateSearchSchema(database)
    initializeSearchSchema(database)
    return {
      databasePath: paths.searchDatabasePath,
      raw: database,
      close: () => {
        if (database.open) {
          database.close()
        }
      },
    }
  } catch (error) {
    database.close()
    throw error
  }
}

/**
 * v1 → v2：search_documents 的 CHECK 约束不能 ALTER，按 12 步法仅重建该表。
 * 子表（search_document_scopes / search_chunks / FTS）不动，其 REFERENCES 'search_documents'
 * 在重建回原名后依旧有效（PRAGMA foreign_keys=OFF + foreign_key_check，同 workspace migration v16）。
 */
export function migrateSearchSchema(database: Database.Database): void {
  const row = database
    .prepare('SELECT value FROM search_meta WHERE key = ?')
    .get('schemaVersion') as { value: string } | undefined
  const currentVersion = row === undefined ? SEARCH_SCHEMA_VERSION : Number(row.value)
  if (!Number.isFinite(currentVersion) || currentVersion >= SEARCH_SCHEMA_VERSION) return

  database.exec(`
    PRAGMA foreign_keys = OFF;

    CREATE TABLE search_documents_v2 (
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
      index_status TEXT NOT NULL CHECK (${SEARCH_INDEX_STATUS_CHECK}),
      UNIQUE (source_type, source_id)
    );

    INSERT INTO search_documents_v2
      (document_id, source_type, source_id, file_id, title, title_normalized,
       filename, filename_normalized, path, content_hash, index_status)
    SELECT document_id, source_type, source_id, file_id, title, title_normalized,
           filename, filename_normalized, path, content_hash, index_status
      FROM search_documents;

    DROP TABLE search_documents;
    ALTER TABLE search_documents_v2 RENAME TO search_documents;

    CREATE INDEX IF NOT EXISTS idx_search_document_source
      ON search_documents (source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_search_document_title
      ON search_documents (title_normalized);

    PRAGMA foreign_key_check;
    PRAGMA foreign_keys = ON;
  `)

  database
    .prepare(
      'INSERT INTO search_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run('schemaVersion', String(SEARCH_SCHEMA_VERSION))
}

export function initializeSearchSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS search_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_documents (
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
      index_status TEXT NOT NULL CHECK (
        ${SEARCH_INDEX_STATUS_CHECK}
      ),
      UNIQUE (source_type, source_id)
    );

    CREATE TABLE IF NOT EXISTS search_document_scopes (
      document_id TEXT NOT NULL REFERENCES search_documents(document_id) ON DELETE CASCADE,
      scope_node_id TEXT NOT NULL,
      PRIMARY KEY (document_id, scope_node_id)
    );

    CREATE INDEX IF NOT EXISTS idx_search_document_source
      ON search_documents (source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_search_document_title
      ON search_documents (title_normalized);
    CREATE INDEX IF NOT EXISTS idx_search_document_scopes_node
      ON search_document_scopes (scope_node_id, document_id);

    CREATE TABLE IF NOT EXISTS search_chunks (
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

    CREATE INDEX IF NOT EXISTS idx_search_chunks_document
      ON search_chunks (document_id, ordinal);

    CREATE VIRTUAL TABLE IF NOT EXISTS search_chunks_fts USING fts5(
      normalized_text,
      tokenize = 'trigram'
    );

    INSERT INTO search_meta (key, value) VALUES
      ('schemaVersion', '${SEARCH_SCHEMA_VERSION}'),
      ('normalizerVersion', '1')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `)
}
