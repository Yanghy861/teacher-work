import { describe, expect, it } from 'vitest'

import { BackupRestoreError, type BackupRestoreService } from '../src/main/backup/backup-service'
import {
  dispatchBackupIpc,
  registerBackupIpc,
  BACKUP_CHANNELS,
  type BackupIpcDependencies,
} from '../src/main/ipc/backup-ipc'
import type { IpcLogger, IpcMainPort } from '../src/main/ipc/app-ipc'
import {
  BACKUP_IPC_CHANNELS,
  IPC_ERROR_CODES,
  type IpcResponse,
} from '../src/shared/ipc-contracts'

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
  readonly errors: unknown[] = []

  log(): void {}

  error(_event: string, error: unknown): void {
    this.errors.push(error)
  }
}

function dependencies(overrides: Partial<BackupIpcDependencies> = {}): BackupIpcDependencies {
  const service = {
    createBackup: async () => { throw new Error('must not run') },
    restoreBackup: async () => { throw new Error('must not run') },
  } as unknown as BackupRestoreService
  return {
    getService: () => service,
    chooseBackupDestination: async () => 'C:\\backup',
    chooseBackupSource: async () => 'C:\\backup',
    chooseRestoreTarget: async () => 'C:\\restored',
    ...overrides,
  }
}

describe('L11 backup IPC', () => {
  it('registers only backup channels and requires external-editor confirmation', async () => {
    const logger = new TestLogger()
    const ipcMain = new FakeIpcMain()
    const dependenciesValue = dependencies({
      confirmBackup: async () => false,
      chooseBackupDestination: async () => { throw new Error('picker must not run') },
    })
    const unregister = registerBackupIpc(ipcMain, dependenciesValue, logger)

    expect([...ipcMain.handlers.keys()]).toEqual(BACKUP_CHANNELS)
    await expect(dispatchBackupIpc(BACKUP_IPC_CHANNELS.create, {}, dependenciesValue, logger)).resolves.toEqual({
      ok: true,
      data: null,
    })
    unregister()
    expect(ipcMain.handlers.size).toBe(0)
  })

  it('rejects extra renderer payload fields and maps backup failures', async () => {
    const logger = new TestLogger()
    const invalid = await dispatchBackupIpc(
      BACKUP_IPC_CHANNELS.create,
      { destinationPath: 'C:\\outside' },
      dependencies(),
      logger,
    )
    expect(invalid).toEqual({
      ok: false,
      error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD, message: '请求参数无效。' },
    })

    const failingService = {
      createBackup: async () => {
        throw new BackupRestoreError('BACKUP_FAILED', '备份失败。')
      },
    } as unknown as BackupRestoreService
    const failed = await dispatchBackupIpc(
      BACKUP_IPC_CHANNELS.create,
      {},
      dependencies({
        confirmBackup: async () => true,
        getService: () => failingService,
      }),
      logger,
    )
    expect(failed).toEqual({
      ok: false,
      error: { code: IPC_ERROR_CODES.BACKUP_ERROR, message: '备份失败。' },
    })
  })
})
