import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ManagedFileService } from '../src/main/files/managed-file-service'
import {
  dispatchFileIpc,
  FILE_CHANNELS,
  registerFileIpc,
  type FileIpcDependencies,
} from '../src/main/ipc/file-ipc'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'
import {
  FILE_IPC_CHANNELS,
  IPC_ERROR_CODES,
  type IpcResponse,
} from '../src/shared/ipc-contracts'
import type { IpcLogger, IpcMainPort } from '../src/main/ipc/app-ipc'

class FakeIpcMain implements IpcMainPort {
  readonly handlers = new Map<string, (event: unknown, payload: unknown) => Promise<IpcResponse<unknown>>>()
  readonly removedChannels: string[] = []

  handle(
    channel: string,
    listener: (event: unknown, payload: unknown) => Promise<IpcResponse<unknown>>,
  ): void {
    this.handlers.set(channel, listener)
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel)
    this.removedChannels.push(channel)
  }
}

class TestLogger implements IpcLogger {
  readonly errors: unknown[] = []

  log(): void {
    // Channel whitelist behavior is asserted by the test.
  }

  error(_event: string, error: unknown): void {
    this.errors.push(error)
  }
}

const temporaryRoots: string[] = []
const workspaces: WorkspaceHandle[] = []

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    workspace.close()
  }
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function createDependencies(): {
  readonly workspace: WorkspaceHandle
  readonly service: ManagedFileService
  readonly sourcePath: string
  readonly dependencies: FileIpcDependencies
} {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-l02-ipc-'))
  temporaryRoots.push(root)
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  workspaces.push(workspace)
  const sourcePath = join(root, 'source.txt')
  writeFileSync(sourcePath, 'IPC source', 'utf8')
  const service = new ManagedFileService(workspace.database.raw, workspace.paths)
  const dependencies: FileIpcDependencies = {
    getFileService: () => service,
    chooseSourcePath: async () => sourcePath,
    openPath: async () => '',
    showInFolder: () => undefined,
    notifyContentChanged: () => undefined,
  }
  return { workspace, service, sourcePath, dependencies }
}

describe('L02 managed file IPC', () => {
  it('registers the whitelist and keeps picker paths inside Main', async () => {
    const { service, dependencies } = createDependencies()
    const ipcMain = new FakeIpcMain()
    const logger = new TestLogger()
    const unregister = registerFileIpc(ipcMain, dependencies, logger)

    expect([...ipcMain.handlers.keys()]).toEqual(FILE_CHANNELS)
    const imported = await dispatchFileIpc(FILE_IPC_CHANNELS.importFromPicker, {}, dependencies, logger)
    expect(imported).toMatchObject({ ok: true, data: { originalName: 'source.txt' } })
    expect(service.getOverview().files).toHaveLength(1)

    unregister()
    expect(ipcMain.handlers.size).toBe(0)
    expect(ipcMain.removedChannels).toEqual(FILE_CHANNELS)
  })

  it('rejects renderer paths and only opens a registered file ID', async () => {
    const { service, dependencies, sourcePath } = createDependencies()
    const logger = new TestLogger()
    let chooserCalls = 0
    let openedPath = ''
    let shownPath = ''
    const contentChangedEvents: unknown[] = []
    const guardedDependencies: FileIpcDependencies = {
      ...dependencies,
      chooseSourcePath: async () => {
        chooserCalls += 1
        return sourcePath
      },
      openPath: async (path) => {
        openedPath = path
        return ''
      },
      showInFolder: (path) => {
        shownPath = path
      },
      notifyContentChanged: (event) => {
        contentChangedEvents.push(event)
      },
    }

    const invalidImport = await dispatchFileIpc(
      FILE_IPC_CHANNELS.importFromPicker,
      { path: sourcePath },
      guardedDependencies,
      logger,
    )
    expect(invalidImport).toEqual({
      ok: false,
      error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD, message: '请求参数无效。' },
    })
    expect(chooserCalls).toBe(0)

    const record = service.importFile(sourcePath)
    const invalidOpen = await dispatchFileIpc(
      FILE_IPC_CHANNELS.openFile,
      { fileId: record.id, path: 'C:\\outside.txt' },
      guardedDependencies,
      logger,
    )
    expect(invalidOpen).toMatchObject({
      ok: false,
      error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD },
    })
    expect(openedPath).toBe('')

    const opened = await dispatchFileIpc(
      FILE_IPC_CHANNELS.openFile,
      { fileId: record.id },
      guardedDependencies,
      logger,
    )
    const shown = await dispatchFileIpc(
      FILE_IPC_CHANNELS.showFileInFolder,
      { fileId: record.id },
      guardedDependencies,
      logger,
    )
    expect(opened).toEqual({ ok: true, data: { accepted: true } })
    expect(shown).toEqual({ ok: true, data: { accepted: true } })
    expect(openedPath).toBe(service.getObjectContentPath(record.id))
    expect(shownPath).toBe(openedPath)

    writeFileSync(openedPath, 'external editor changed the file', 'utf8')
    await dispatchFileIpc(
      FILE_IPC_CHANNELS.openFile,
      { fileId: record.id },
      guardedDependencies,
      logger,
    )
    expect(contentChangedEvents).toHaveLength(1)
    expect(contentChangedEvents[0]).toMatchObject({ fileId: record.id, contentChanged: true })
  })

  it('maps an unregistered ID to a stable managed-file error', async () => {
    const { dependencies } = createDependencies()
    const response = await dispatchFileIpc(
      FILE_IPC_CHANNELS.openFile,
      { fileId: randomUUID() },
      dependencies,
      new TestLogger(),
    )

    expect(response).toMatchObject({
      ok: false,
      error: { code: IPC_ERROR_CODES.MANAGED_FILE_ERROR },
    })
  })
})
