import Database from 'better-sqlite3'

import type { WorkspacePaths } from '../workspace/workspace-paths'

export const SEARCH_SCHEMA_VERSION = 1

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
        index_status IN ('pending', 'indexed', 'no_text', 'parse_failed')
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
