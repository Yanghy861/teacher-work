import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ExternalLibraryService } from '../src/main/external/external-library-service'
import {
  dispatchExternalLibraryIpc,
  EXTERNAL_LIBRARY_CHANNELS,
  registerExternalLibraryIpc,
  type ExternalLibraryIpcDependencies,
} from '../src/main/ipc/external-library-ipc'
import type { IpcLogger, IpcMainPort } from '../src/main/ipc/app-ipc'
import {
  initializeWorkspace,
  type WorkspaceHandle,
} from '../src/main/workspace/workspace-service'
import {
  EXTERNAL_LIBRARY_IPC_CHANNELS,
  IPC_ERROR_CODES,
  type IpcResponse,
} from '../src/shared/ipc-contracts'

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
    // Unknown-channel behavior is asserted by the test.
  }

  error(_event: string, error: unknown): void {
    this.errors.push(error)
  }
}

const temporaryRoots: string[] = []
const workspaces: WorkspaceHandle[] = []

afterEach(() => {
  for (const workspace of workspaces.splice(0)) workspace.close()
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function createDependencies(): {
  readonly libraryRoot: string
  readonly service: ExternalLibraryService
  readonly dependencies: ExternalLibraryIpcDependencies
} {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-v11-ipc-'))
  temporaryRoots.push(root)
  const libraryRoot = join(root, '资料')
  mkdirSync(libraryRoot)
  writeFileSync(join(libraryRoot, '讲义.md'), '# 讲义', 'utf8')
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  workspaces.push(workspace)
  const service = new ExternalLibraryService(workspace.database.raw, {
    idFactory: () => 'external-root-ipc',
  })
  const dependencies: ExternalLibraryIpcDependencies = {
    getService: () => service,
    chooseRootPath: async () => libraryRoot,
    openPath: async () => '',
    showInFolder: () => undefined,
  }
  return { libraryRoot, service, dependencies }
}

describe('V11-01 external library IPC', () => {
  it('registers and unregisters only the external-library whitelist', () => {
    const { dependencies } = createDependencies()
    const ipcMain = new FakeIpcMain()
    const unregister = registerExternalLibraryIpc(ipcMain, dependencies, new TestLogger())

    expect([...ipcMain.handlers.keys()]).toEqual(EXTERNAL_LIBRARY_CHANNELS)
    unregister()
    expect(ipcMain.handlers.size).toBe(0)
    expect(ipcMain.removedChannels).toEqual(EXTERNAL_LIBRARY_CHANNELS)
  })

  it('chooses, lists, opens, and reveals files without returning an absolute path', async () => {
    const { libraryRoot, dependencies } = createDependencies()
    const logger = new TestLogger()
    let openedPath = ''
    let revealedPath = ''
    const guardedDependencies: ExternalLibraryIpcDependencies = {
      ...dependencies,
      openPath: async (path) => {
        openedPath = path
        return ''
      },
      showInFolder: (path) => {
        revealedPath = path
      },
    }

    const chosen = await dispatchExternalLibraryIpc(
      EXTERNAL_LIBRARY_IPC_CHANNELS.chooseRoot,
      {},
      guardedDependencies,
      logger,
    )
    expect(chosen).toMatchObject({ ok: true, data: { id: 'external-root-ipc', name: '资料' } })
    expect(JSON.stringify(chosen)).not.toContain(libraryRoot)

    const listed = await dispatchExternalLibraryIpc(
      EXTERNAL_LIBRARY_IPC_CHANNELS.listChildren,
      { rootId: 'external-root-ipc', relativePath: '' },
      guardedDependencies,
      logger,
    )
    expect(listed).toMatchObject({ ok: true, data: { entries: [{ name: '讲义.md' }] } })
    expect(JSON.stringify(listed)).not.toContain(libraryRoot)

    const request = { rootId: 'external-root-ipc', relativePath: '讲义.md' }
    expect(await dispatchExternalLibraryIpc(
      EXTERNAL_LIBRARY_IPC_CHANNELS.openFile,
      request,
      guardedDependencies,
      logger,
    )).toEqual({ ok: true, data: { accepted: true } })
    expect(await dispatchExternalLibraryIpc(
      EXTERNAL_LIBRARY_IPC_CHANNELS.showInFolder,
      request,
      guardedDependencies,
      logger,
    )).toEqual({ ok: true, data: { accepted: true } })
    expect(openedPath).toBe(join(libraryRoot, '讲义.md'))
    expect(revealedPath).toBe(openedPath)
  })

  it('returns null when directory selection is canceled', async () => {
    const { dependencies } = createDependencies()
    const response = await dispatchExternalLibraryIpc(
      EXTERNAL_LIBRARY_IPC_CHANNELS.chooseRoot,
      {},
      { ...dependencies, chooseRootPath: async () => null },
      new TestLogger(),
    )

    expect(response).toEqual({ ok: true, data: null })
  })

  it('rejects absolute paths, traversal, extra fields, and unknown channels', async () => {
    const { dependencies } = createDependencies()
    const logger = new TestLogger()
    let openCalls = 0
    const guardedDependencies: ExternalLibraryIpcDependencies = {
      ...dependencies,
      openPath: async () => {
        openCalls += 1
        return ''
      },
    }
    await dispatchExternalLibraryIpc(
      EXTERNAL_LIBRARY_IPC_CHANNELS.chooseRoot,
      {},
      guardedDependencies,
      logger,
    )

    for (const payload of [
      { rootId: 'external-root-ipc', relativePath: '..\\秘密.txt' },
      { rootId: 'external-root-ipc', relativePath: 'C:\\秘密.txt' },
      { rootId: 'external-root-ipc', relativePath: '讲义.md', path: 'C:\\秘密.txt' },
    ]) {
      const response = await dispatchExternalLibraryIpc(
        EXTERNAL_LIBRARY_IPC_CHANNELS.openFile,
        payload,
        guardedDependencies,
        logger,
      )
      expect(response).toMatchObject({
        ok: false,
        error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD },
      })
    }
    expect(openCalls).toBe(0)

    expect(await dispatchExternalLibraryIpc(
      'external-library:unknown',
      {},
      guardedDependencies,
      logger,
    )).toMatchObject({
      ok: false,
      error: { code: IPC_ERROR_CODES.UNKNOWN_CHANNEL },
    })
  })
})
