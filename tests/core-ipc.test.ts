import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { runMigrations } from '../src/main/db/migrations'
import {
  CORE_IPC_CHANNELS,
  IPC_ERROR_CODES,
  type IpcResponse,
} from '../src/shared/ipc-contracts'
import {
  dispatchCoreIpc,
  registerCoreIpc,
  type CoreIpcDependencies,
} from '../src/main/ipc/core-ipc'
import type { IpcMainPort, IpcLogger } from '../src/main/ipc/app-ipc'

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
    // The test only needs to prove that the channel stays inside the whitelist.
  }

  error(_event: string, error: unknown): void {
    this.errors.push(error)
  }
}

function createDependencies(): { database: Database.Database; dependencies: CoreIpcDependencies } {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  runMigrations(database)
  const dependencies: CoreIpcDependencies = {
    getCoreData: () => new CoreDataService(database),
  }
  return { database, dependencies }
}

describe('L01 typed core IPC', () => {
  it('registers only core channels and completes the create/list flow', async () => {
    const { database, dependencies } = createDependencies()
    try {
      const ipcMain = new FakeIpcMain()
      const logger = new TestLogger()
      const unregister = registerCoreIpc(ipcMain, dependencies, logger)

      expect([...ipcMain.handlers.keys()]).toEqual(Object.values(CORE_IPC_CHANNELS))
      const course = await ipcMain.handlers.get(CORE_IPC_CHANNELS.createCourse)!(
        {},
        { title: 'IPC 课程', mode: 'class' },
      )
      expect(course).toMatchObject({ ok: true, data: { kind: 'course', title: 'IPC 课程' } })

      const overview = await dispatchCoreIpc(
        CORE_IPC_CHANNELS.getCoreOverview,
        {},
        dependencies,
        logger,
      )
      expect(overview).toMatchObject({ ok: true, data: { nodes: [{ title: 'IPC 课程' }] } })

      unregister()
      expect(ipcMain.handlers.size).toBe(0)
      expect(ipcMain.removedChannels).toEqual(Object.values(CORE_IPC_CHANNELS))
    } finally {
      database.close()
    }
  })

  it('rejects extra payload fields before touching the database', async () => {
    const { database, dependencies } = createDependencies()
    try {
      const logger = new TestLogger()
      const response = await dispatchCoreIpc(
        CORE_IPC_CHANNELS.createCourse,
        { title: '不应写入', mode: 'class', sql: 'DROP TABLE nodes' },
        dependencies,
        logger,
      )
      expect(response).toEqual({
        ok: false,
        error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD, message: '请求参数无效。' },
      })
      expect(dependencies.getCoreData().getOverview().nodes).toEqual([])
    } finally {
      database.close()
    }
  })
})
