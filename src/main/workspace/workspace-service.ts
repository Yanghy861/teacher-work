import { randomUUID } from 'node:crypto'

import { getSchemaVersion, runMigrations, type Migration } from '../db/migrations'
import { openWorkspaceDatabase, type WorkspaceDatabase } from '../db/connection'
import {
  ensureWorkspaceDirectories,
  WorkspacePaths,
  type EnsureWorkspaceDirectoriesOptions,
} from './workspace-paths'

export interface WorkspaceIdentity {
  readonly workspaceId: string
  readonly schemaVersion: number
}

export interface InitializeWorkspaceOptions extends EnsureWorkspaceDirectoriesOptions {
  readonly migrations?: readonly Migration[]
  readonly idFactory?: () => string
}

export interface WorkspaceHandle {
  readonly paths: WorkspacePaths
  readonly database: WorkspaceDatabase
  readonly identity: WorkspaceIdentity
  close(): void
}

export function initializeWorkspace(
  root: string | WorkspacePaths,
  options: InitializeWorkspaceOptions = {},
): WorkspaceHandle {
  const paths = typeof root === 'string' ? WorkspacePaths.fromRoot(root) : root
  ensureWorkspaceDirectories(paths, options)

  const database = openWorkspaceDatabase(paths.databasePath)
  try {
    const schemaVersion = runMigrations(database.raw, options.migrations)
    const identity = ensureWorkspaceIdentity(database.raw, schemaVersion, options.idFactory)
    return {
      paths,
      database,
      identity,
      close: () => database.close(),
    }
  } catch (error) {
    database.close()
    throw error
  }
}

export function initializeDefaultWorkspace(
  appDataPath: string,
  appInstallPath: string,
  options: InitializeWorkspaceOptions = {},
): WorkspaceHandle {
  return initializeWorkspace(WorkspacePaths.fromDefaultLocation(appDataPath, appInstallPath), options)
}

function ensureWorkspaceIdentity(
  database: WorkspaceDatabase['raw'],
  schemaVersion: number,
  idFactory: (() => string) | undefined,
): WorkspaceIdentity {
  const createId = idFactory ?? randomUUID
  const transaction = database.transaction(() => {
    const existing = database
      .prepare('SELECT value FROM workspace_meta WHERE key = ?')
      .get('workspaceId') as { value: string } | undefined
    const workspaceId = existing?.value ?? createId()

    if (!workspaceId.trim()) {
      throw new Error('Workspace metadata contains an empty workspaceId')
    }

    database
      .prepare(
        `INSERT INTO workspace_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run('workspaceId', workspaceId)
    database
      .prepare(
        `INSERT INTO workspace_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run('schemaVersion', String(schemaVersion))

    return { workspaceId, schemaVersion }
  })

  return transaction.immediate()
}

export function readWorkspaceIdentity(database: WorkspaceDatabase['raw']): WorkspaceIdentity {
  const workspaceId = database
    .prepare('SELECT value FROM workspace_meta WHERE key = ?')
    .get('workspaceId') as { value: string } | undefined
  const schemaVersion = database
    .prepare('SELECT value FROM workspace_meta WHERE key = ?')
    .get('schemaVersion') as { value: string } | undefined

  if (!workspaceId?.value || !schemaVersion?.value) {
    throw new Error('Workspace identity metadata is incomplete')
  }

  const parsedSchemaVersion = Number(schemaVersion.value)
  if (!Number.isInteger(parsedSchemaVersion) || parsedSchemaVersion < 0) {
    throw new Error('Workspace metadata contains an invalid schemaVersion')
  }

  return { workspaceId: workspaceId.value, schemaVersion: parsedSchemaVersion }
}

export function getCurrentWorkspaceSchemaVersion(database: WorkspaceDatabase['raw']): number {
  return getSchemaVersion(database)
}
