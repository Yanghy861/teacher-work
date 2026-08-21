import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { dispatchSearchIpc, SEARCH_CHANNELS, registerSearchIpc, type SearchIpcDependencies } from '../src/main/ipc/search-ipc'
import type { IpcLogger, IpcMainPort } from '../src/main/ipc/app-ipc'
import { openSearchDatabase } from '../src/main/search/search-database'
import { SearchService } from '../src/main/search/search-service'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'
import { IPC_ERROR_CODES, SEARCH_IPC_CHANNELS, type IpcResponse } from '../src/shared/ipc-contracts'

class FakeIpcMain implements IpcMainPort {
  readonly handlers = new Map<string, (event: unknown, payload: unknown) => Promise<IpcResponse<unknown>>>()
  handle(channel: string, listener: (event: unknown, payload: unknown) => Promise<IpcResponse<unknown>>): void {
    this.handlers.set(channel, listener)
  }
  removeHandler(channel: string): void {
    this.handlers.delete(channel)
  }
}

class TestLogger implements IpcLogger {
  log(): void {}
  error(): void {}
}

const roots: string[] = []
const workspaces: WorkspaceHandle[] = []
const searchDatabases: Array<{ close(): void }> = []

afterEach(() => {
  for (const searchDatabase of searchDatabases.splice(0)) searchDatabase.close()
  for (const workspace of workspaces.splice(0)) workspace.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(): { workspace: WorkspaceHandle; service: SearchService; dependencies: SearchIpcDependencies } {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-l07-ipc-'))
  roots.push(root)
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  workspaces.push(workspace)
  const searchDb = openSearchDatabase(workspace.paths)
  searchDatabases.push(searchDb)
  const core = new CoreDataService(workspace.database.raw)
  const files = new ManagedFileService(workspace.database.raw, workspace.paths)
  const search = new SearchService(workspace.database.raw, searchDb.raw, workspace.paths)
  const course = core.nodes.createCourse('IPC 搜索', 'class')
  const sourcePath = join(root, 'ipc.txt')
  writeFileSync(sourcePath, 'IPC 正文', 'utf8')
  const file = files.importFile(sourcePath)
  search.indexFile({ id: file.id, originalName: file.originalName, chunks: [{ text: 'IPC 正文' }], status: 'indexed', contentHash: 'hash' })
  search.indexNode(course)
  return {
    workspace,
    service: search,
    dependencies: {
      getSearchService: () => search,
      rebuildSearchIndex: async () => ({ queuedFiles: 0, indexedFiles: 0, failedFiles: 0, status: search.getIndexStatusSummary() }),
    },
  }
}

describe('search IPC', () => {
  it('registers only search channels and rejects renderer paths', async () => {
    const { dependencies } = fixture()
    const logger = new TestLogger()
    const ipcMain = new FakeIpcMain()
    const unregister = registerSearchIpc(ipcMain, dependencies, logger)
    expect([...ipcMain.handlers.keys()]).toEqual(SEARCH_CHANNELS)

    const invalid = await dispatchSearchIpc(SEARCH_IPC_CHANNELS.query, { text: 'IPC', path: 'C:\\outside' }, dependencies, logger)
    expect(invalid).toEqual({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD, message: '请求参数无效。' } })
    const query = await dispatchSearchIpc(SEARCH_IPC_CHANNELS.query, { text: 'IPC' }, dependencies, logger)
    expect(query).toMatchObject({ ok: true })
    expect(query.ok && query.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ snippet: 'IPC 正文' }),
    ]))
    const status = await dispatchSearchIpc(SEARCH_IPC_CHANNELS.getStatus, {}, dependencies, logger)
    expect(status).toMatchObject({ ok: true, data: { total: 1, indexed: 1 } })
    const rebuild = await dispatchSearchIpc(SEARCH_IPC_CHANNELS.rebuild, {}, dependencies, logger)
    expect(rebuild).toMatchObject({ ok: true, data: { queuedFiles: 0 } })
    unregister()
    expect(ipcMain.handlers.size).toBe(0)
  })
})
