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
