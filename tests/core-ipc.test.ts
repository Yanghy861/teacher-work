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

  it('updates an existing note without dropping its AI metadata', async () => {
    const { database, dependencies } = createDependencies()
    try {
      const logger = new TestLogger()
      const core = dependencies.getCoreData()
      const course = core.nodes.createCourse('IPC 草稿课程', 'one_to_one')
      const period = core.nodes.createPeriod(course.id, '阶段')
      const lesson = core.nodes.createLesson(period.id, '课次')
      const student = core.createStudentForCourse(course.id, '学生')
      const note = core.createNote(student.id, '原始草稿', lesson.id, {
        noteKind: 'lecture',
        aiMetadata: {
          kind: 'lecture',
          promptVersion: 'l09-v1',
          provider: 'openai-compatible',
          model: 'fake-model',
          sources: [{ fileId: 'file-1', charsSent: 4 }],
          inputChars: 4,
          maxChars: 100,
          maxTokens: 100,
        },
      })
      const response = await dispatchCoreIpc(
        CORE_IPC_CHANNELS.updateNote,
        { noteId: note.id, bodyMd: '编辑后的草稿' },
        dependencies,
        logger,
      )
      expect(response).toMatchObject({ ok: true, data: { id: note.id, bodyMd: '编辑后的草稿', noteKind: 'lecture' } })
      expect(response.ok && response.data).toMatchObject({ aiMetadata: { promptVersion: 'l09-v1' } })
    } finally {
      database.close()
    }
  })

  it('rejects a manual record lesson outside the student current or historical courses', async () => {
    const { database, dependencies } = createDependencies()
    try {
      const core = dependencies.getCoreData()
      const student = core.createStudent('学生甲')
      const unrelatedCourse = core.createCourse({ title: '无关课程', mode: 'class' })
      const period = core.nodes.createPeriod(unrelatedCourse.id, '阶段')
      const lesson = core.nodes.createLesson(period.id, '课次')
      const response = await dispatchCoreIpc(
        CORE_IPC_CHANNELS.createNote,
        { studentId: student.id, lessonId: lesson.id, bodyMd: '不应保存' },
        dependencies,
        new TestLogger(),
      )
      expect(response).toMatchObject({
        ok: false,
        error: { code: IPC_ERROR_CODES.CORE_DATA_ERROR },
      })
      expect(core.getOverview().notes).toEqual([])
    } finally {
      database.close()
    }
  })
})
