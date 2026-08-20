import Database from 'better-sqlite3'

import type { SqliteDatabase } from './migrations'

export interface SqliteBackupMetadata {
  readonly totalPages: number
  readonly remainingPages: number
}

export class WorkspaceDatabase {
  readonly databasePath: string
  private readonly connection: SqliteDatabase

  constructor(databasePath: string) {
    this.databasePath = databasePath
    this.connection = new Database(databasePath, { timeout: 5000 })
    this.connection.pragma('journal_mode = WAL')
    this.connection.pragma('synchronous = NORMAL')
    this.connection.pragma('foreign_keys = ON')
    this.connection.pragma('busy_timeout = 5000')
  }

  get raw(): SqliteDatabase {
    return this.connection
  }

  get isOpen(): boolean {
    return this.connection.open
  }

  close(): void {
    if (this.connection.open) {
      this.connection.close()
    }
  }

  backup(destinationPath: string): Promise<SqliteBackupMetadata> {
    if (!this.connection.open) {
      return Promise.reject(new Error('Workspace database is already closed'))
    }
    return this.connection.backup(destinationPath)
  }
}

export function openWorkspaceDatabase(databasePath: string): WorkspaceDatabase {
  return new WorkspaceDatabase(databasePath)
}
