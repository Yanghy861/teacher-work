import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { ExternalLibraryService } from '../src/main/external/external-library-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { MaterialLibraryService } from '../src/main/files/material-library-service'
import {
  dispatchMaterialLibraryIpc,
  MATERIAL_LIBRARY_CHANNELS,
  registerMaterialLibraryIpc,
  type MaterialLibraryIpcDependencies,
} from '../src/main/ipc/material-library-ipc'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'
import { MATERIAL_LIBRARY_IPC_CHANNELS, IPC_ERROR_CODES, type IpcResponse } from '../src/shared/ipc-contracts'
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
  readonly errors: Array<{ event: string; error: unknown }> = []

  log(): void {
    // Channel whitelist behavior is asserted by the test.
  }

  error(event: string, error: unknown): void {
    this.errors.push({ event, error })
  }
}

const roots: string[] = []
const workspaces: WorkspaceHandle[] = []

afterEach(() => {
  for (const workspace of workspaces.splice(0)) workspace.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function createFixture(): {
  readonly root: string
  readonly workspace: WorkspaceHandle
  readonly dependencies: MaterialLibraryIpcDependencies
  readonly library: MaterialLibraryService
  readonly files: ManagedFileService
} {
  const root = mkdtempSync(join(tmpdir(), 'material-library-ipc-'))
  roots.push(root)
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  workspaces.push(workspace)
  const files = new ManagedFileService(workspace.database.raw, workspace.paths)
  const library = new MaterialLibraryService(workspace.database.raw, files)
  const external = new ExternalLibraryService(workspace.database.raw)
  const dependencies: MaterialLibraryIpcDependencies = {
    getService: () => library,
    getExternalService: () => external,
  }
  return { root, workspace, dependencies, library, files }
}

describe('material library IPC whitelist and validation', () => {
  it('registers exactly the material library channels and removes them on unregister', async () => {
    const { dependencies } = createFixture()
    const ipcMain = new FakeIpcMain()
    const logger = new TestLogger()

    const unregister = registerMaterialLibraryIpc(ipcMain, dependencies, logger)
    expect([...ipcMain.handlers.keys()]).toEqual(MATERIAL_LIBRARY_CHANNELS)

    unregister()
    expect(ipcMain.handlers.size).toBe(0)
    expect(ipcMain.removedChannels).toEqual(MATERIAL_LIBRARY_CHANNELS)
  })

  it('returns the overview for the empty request object and rejects unknown channels', async () => {
    const { dependencies } = createFixture()
    const logger = new TestLogger()

    const overview = await dispatchMaterialLibraryIpc(
      MATERIAL_LIBRARY_IPC_CHANNELS.getOverview, {}, dependencies, logger,
    )
    expect(overview).toMatchObject({ ok: true, data: { folders: [], items: [], files: [] } })

    const unknown = await dispatchMaterialLibraryIpc(
      'material-library:arbitrary', {}, dependencies, logger,
    )
    expect(unknown).toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.UNKNOWN_CHANNEL } })
  })

  it('rejects payload shape violations before touching the service', async () => {
    const { dependencies } = createFixture()
    const logger = new TestLogger()

    const extraKey = await dispatchMaterialLibraryIpc(
      MATERIAL_LIBRARY_IPC_CHANNELS.createFolder,
      { parentId: null, name: '文件夹', evil: 'DROP TABLE files' },
      dependencies, logger,
    )
    expect(extraKey).toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })

    const negativeSort = await dispatchMaterialLibraryIpc(
      MATERIAL_LIBRARY_IPC_CHANNELS.reorderFolder,
      { folderId: '0d8eeb7e-9d3d-4a1c-9e00-3f1a50f50f50', parentId: null, sortOrder: -1 },
      dependencies, logger,
    )
    expect(negativeSort).toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })

    const missingKey = await dispatchMaterialLibraryIpc(
      MATERIAL_LIBRARY_IPC_CHANNELS.moveFile,
      { fileId: '0d8eeb7e-9d3d-4a1c-9e00-3f1a50f50f50' },
      dependencies, logger,
    )
    expect(missingKey).toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })
  })

  it('maps material library, external library, and managed file errors to their codes', async () => {
    const item = createFixture()
    const logger = new TestLogger()
    const { dependencies, library, files, root, workspace } = item

    const sourcePath = join(root, 'standalone.txt'); writeFileSync(sourcePath, 'standalone')
    const standalone = files.importFile(sourcePath)
    const core = new CoreDataService(workspace.database.raw)
    const course = core.nodes.createCourse('课程', 'class')
    const period = core.nodes.createPeriod(course.id, '阶段')
    const lesson = core.nodes.createLesson(period.id, '课次')
    const lessonCopy = files.copyToLesson(standalone.id, lesson.id)
    const parent = library.createFolder({ parentId: null, name: '父目录' })
    const child = library.createFolder({ parentId: parent.id, name: '子目录' })
    library.moveFile(standalone.id, child.id)

    const cycle = await dispatchMaterialLibraryIpc(
      MATERIAL_LIBRARY_IPC_CHANNELS.reorderFolder,
      { folderId: parent.id, parentId: child.id, sortOrder: 0 },
      dependencies, logger,
    )
    expect(cycle).toMatchObject({
      ok: false,
      error: { code: IPC_ERROR_CODES.MATERIAL_LIBRARY_ERROR },
    })

    const notEmpty = await dispatchMaterialLibraryIpc(
      MATERIAL_LIBRARY_IPC_CHANNELS.deleteFolder,
      { folderId: parent.id },
      dependencies, logger,
    )
    expect(notEmpty).toMatchObject({
      ok: false,
      error: { code: IPC_ERROR_CODES.MATERIAL_LIBRARY_ERROR },
    })

    const lessonLinked = await dispatchMaterialLibraryIpc(
      MATERIAL_LIBRARY_IPC_CHANNELS.moveFile,
      { fileId: lessonCopy.id, folderId: null },
      dependencies, logger,
    )
    expect(lessonLinked).toMatchObject({
      ok: false,
      error: { code: IPC_ERROR_CODES.MATERIAL_LIBRARY_ERROR },
    })

    const unregisteredRoot = await dispatchMaterialLibraryIpc(
      MATERIAL_LIBRARY_IPC_CHANNELS.saveExternal,
      { rootId: 'external-root', relativePath: 'notes.docx', folderId: null },
      dependencies, logger,
    )
    expect(unregisteredRoot).toMatchObject({
      ok: false,
      error: { code: IPC_ERROR_CODES.EXTERNAL_LIBRARY_ERROR },
    })
  })

  it('creates, moves, and renames folders through the dispatched channels', async () => {
    const { dependencies } = createFixture()
    const logger = new TestLogger()

    const created = await dispatchMaterialLibraryIpc(
      MATERIAL_LIBRARY_IPC_CHANNELS.createFolder,
      { parentId: null, name: '顶部目录' },
      dependencies, logger,
    )
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error('expected createFolder to succeed')
    const createdFolder = created.data as { id: string; name: string }
    expect(createdFolder).toMatchObject({ name: '顶部目录', parentId: null })

    const renamed = await dispatchMaterialLibraryIpc(
      MATERIAL_LIBRARY_IPC_CHANNELS.renameFolder,
      { folderId: createdFolder.id, name: '改名后' },
      dependencies, logger,
    )
    expect(renamed).toMatchObject({ ok: true, data: { name: '改名后' } })
  })

  it('maps unexpected service failures to a generic internal error without a stack trace', async () => {
    const item = createFixture()
    const logger = new TestLogger()
    const dependencies: MaterialLibraryIpcDependencies = {
      getService: () => {
        throw new Error('SOL_AUDIT_INTERNAL_SECRET leak attempt')
      },
      getExternalService: item.dependencies.getExternalService,
    }

    const response = await dispatchMaterialLibraryIpc(
      MATERIAL_LIBRARY_IPC_CHANNELS.getOverview, {}, dependencies, logger,
    )
    expect(response).toMatchObject({
      ok: false,
      error: { code: IPC_ERROR_CODES.INTERNAL_ERROR, message: '无法完成素材库操作，请稍后重试。' },
    })
    expect(JSON.stringify(response)).not.toContain('SOL_AUDIT_INTERNAL_SECRET')
    expect(JSON.stringify(response)).not.toContain('at ')
    expect(logger.errors).toHaveLength(1)
    expect(logger.errors[0]?.event).toBe('ipc.material_library_request_failed')
  })
})
