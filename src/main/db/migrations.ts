import type Database from 'better-sqlite3'

export type SqliteDatabase = Database.Database

export interface Migration {
  readonly version: number
  readonly name: string
  readonly up: (database: SqliteDatabase) => void
}

export const workspaceMigrations: readonly Migration[] = [
  {
    version: 1,
    name: 'create_workspace_metadata',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS workspace_meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        )
      `)
    },
  },
  {
    version: 2,
    name: 'create_core_data_tree',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS nodes (
          id TEXT PRIMARY KEY NOT NULL,
          parent_id TEXT REFERENCES nodes(id) ON DELETE RESTRICT,
          kind TEXT NOT NULL CHECK (kind IN ('course', 'period', 'lesson')),
          title TEXT NOT NULL CHECK (length(trim(title)) > 0),
          course_mode TEXT CHECK (course_mode IN ('class', 'one_to_one') OR course_mode IS NULL),
          sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
          content_md TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_nodes_parent_sort
          ON nodes (parent_id, sort_order, created_at, id);
        CREATE INDEX IF NOT EXISTS idx_nodes_deleted
          ON nodes (deleted_at);

        CREATE TABLE IF NOT EXISTS students (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS course_students (
          course_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          PRIMARY KEY (course_id, student_id)
        );

        CREATE INDEX IF NOT EXISTS idx_course_students_student
          ON course_students (student_id, course_id);

        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY NOT NULL,
          student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          lesson_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
          body_md TEXT NOT NULL CHECK (length(trim(body_md)) > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_notes_student_created
          ON notes (student_id, created_at, id);
      `)
    },
  },
  {
    version: 3,
    name: 'create_managed_files',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY NOT NULL,
          original_name TEXT NOT NULL CHECK (length(trim(original_name)) > 0),
          size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
          mime_type TEXT NOT NULL,
          origin_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_files_active_created
          ON files (deleted_at, created_at, id);
        CREATE INDEX IF NOT EXISTS idx_files_origin
          ON files (origin_file_id);

        CREATE TABLE IF NOT EXISTS lesson_files (
          file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          lesson_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          PRIMARY KEY (file_id, lesson_id)
        );

        CREATE INDEX IF NOT EXISTS idx_lesson_files_lesson
          ON lesson_files (lesson_id, created_at, file_id);

        CREATE TABLE IF NOT EXISTS student_files (
          file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          PRIMARY KEY (file_id, student_id)
        );

        CREATE INDEX IF NOT EXISTS idx_student_files_student
          ON student_files (student_id, created_at, file_id);
      `)
    },
  },
  {
    version: 4,
    name: 'add_managed_file_refresh_metadata',
    up: (database) => {
      database.exec(`
        ALTER TABLE files ADD COLUMN mtime_ms REAL;
        ALTER TABLE files ADD COLUMN content_hash TEXT;
      `)
    },
  },
  {
    version: 5,
    name: 'add_managed_file_index_state',
    up: (database) => {
      database.exec(`
        ALTER TABLE files ADD COLUMN indexed_hash TEXT;
        ALTER TABLE files ADD COLUMN index_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (index_status IN ('pending', 'indexed', 'no_text', 'parse_failed'));
        CREATE INDEX IF NOT EXISTS idx_files_index_status
          ON files (index_status, deleted_at, id);
      `)
    },
  },
  {
    version: 6,
    name: 'create_ai_settings',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS ai_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          provider TEXT NOT NULL CHECK (provider IN ('openai-compatible')),
          model TEXT NOT NULL CHECK (length(trim(model)) > 0),
          endpoint TEXT NOT NULL CHECK (length(trim(endpoint)) > 0),
          updated_at TEXT NOT NULL
        );

      `)
    },
  },
]

export function runMigrations(
  database: SqliteDatabase,
  migrations: readonly Migration[] = workspaceMigrations,
): number {
  validateMigrations(migrations)
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)

  const appliedVersions = new Set(
    database
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .pluck()
      .all() as number[],
  )
  const applyMigration = database.transaction((migration: Migration) => {
    migration.up(database)
    database
      .prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      )
      .run(migration.version, migration.name, new Date().toISOString())
  })

  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      applyMigration.immediate(migration)
    }
  }

  return getSchemaVersion(database)
}

export function getSchemaVersion(database: SqliteDatabase): number {
  const result = database
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
    .get() as { version: number }
  return result.version
}

export function getAppliedMigrationVersions(database: SqliteDatabase): number[] {
  return database
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .pluck()
    .all() as number[]
}

function validateMigrations(migrations: readonly Migration[]): void {
  const versions = new Set<number>()
  let previousVersion = 0

  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new Error(`Migration version must be a positive integer: ${migration.version}`)
    }
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`)
    }
    if (migration.version <= previousVersion) {
      throw new Error('Migrations must be provided in strictly increasing version order')
    }
    if (!migration.name.trim()) {
      throw new Error(`Migration ${migration.version} must have a name`)
    }
    versions.add(migration.version)
    previousVersion = migration.version
  }
}
