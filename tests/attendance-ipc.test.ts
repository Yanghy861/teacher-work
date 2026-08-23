import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { runMigrations } from '../src/main/db/migrations'
import {
  ATTENDANCE_CHANNELS,
  dispatchAttendanceIpc,
  registerAttendanceIpc,
  type AttendanceIpcDependencies,
} from '../src/main/ipc/attendance-ipc'
import type { IpcLogger, IpcMainPort } from '../src/main/ipc/app-ipc'
import {
  ATTENDANCE_IPC_CHANNELS,
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

  log(): void {}

  error(_event: string, error: unknown): void {
    this.errors.push(error)
  }
}

function createFixture(): {
  database: Database.Database
  core: CoreDataService
  dependencies: AttendanceIpcDependencies
} {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  runMigrations(database)
  const core = new CoreDataService(database)
  return {
    database,
    core,
    dependencies: { getAttendanceService: () => core.attendance },
  }
}

describe('V12-01 attendance IPC', () => {
  it('registers exactly the three attendance channels and completes schedule/save/get', async () => {
    const { database, core, dependencies } = createFixture()
    try {
      const ipcMain = new FakeIpcMain()
      const logger = new TestLogger()
      const unregister = registerAttendanceIpc(ipcMain, dependencies, logger)
      expect([...ipcMain.handlers.keys()]).toEqual(Object.values(ATTENDANCE_IPC_CHANNELS))
      expect(ATTENDANCE_CHANNELS).toHaveLength(3)

      const student = core.createStudent('IPC 学生')
      const course = core.createCourse({ title: 'IPC 课程', mode: 'class', studentIds: [student.id] })
      const period = core.nodes.createPeriod(course.id, '第一阶段')
      const lesson = core.nodes.createLesson(period.id, '第一课')
      const scheduledAt = '2026-08-23T01:30:00.000Z'

      const scheduleResponse = await ipcMain.handlers.get(ATTENDANCE_IPC_CHANNELS.updateSchedule)!(
        {},
        { lessonId: lesson.id, scheduledAt },
      )
      expect(scheduleResponse).toMatchObject({ ok: true, data: { lessonId: lesson.id, scheduledAt } })

      const saveResponse = await ipcMain.handlers.get(ATTENDANCE_IPC_CHANNELS.saveLesson)!(
        {},
        { lessonId: lesson.id, entries: [{ studentId: student.id, status: 'present' }] },
      )
      expect(saveResponse).toMatchObject({
        ok: true,
        data: { students: [{ studentId: student.id, status: 'present' }] },
      })

      const getResponse = await dispatchAttendanceIpc(
        ATTENDANCE_IPC_CHANNELS.getLesson,
        { lessonId: lesson.id },
        dependencies,
        logger,
      )
      expect(getResponse).toMatchObject({ ok: true, data: { attendanceRecordedAt: expect.any(String) } })

      unregister()
      expect(ipcMain.handlers.size).toBe(0)
      expect(ipcMain.removedChannels).toEqual(Object.values(ATTENDANCE_IPC_CHANNELS))
    } finally {
      database.close()
    }
  })

  it('rejects extra fields and invalid attendance status before calling the service', async () => {
    const { database, dependencies } = createFixture()
    try {
      const logger = new TestLogger()
      const extraField = await dispatchAttendanceIpc(
        ATTENDANCE_IPC_CHANNELS.getLesson,
        { lessonId: 'lesson', filePath: 'C:\\secret.txt' },
        dependencies,
        logger,
      )
      expect(extraField).toEqual({
        ok: false,
        error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD, message: '请求参数无效。' },
      })

      const invalidStatus = await dispatchAttendanceIpc(
        ATTENDANCE_IPC_CHANNELS.saveLesson,
        { lessonId: 'lesson', entries: [{ studentId: 'student', status: 'late' }] },
        dependencies,
        logger,
      )
      expect(invalidStatus).toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })
    } finally {
      database.close()
    }
  })

  it('maps roster conflicts to the attendance error boundary', async () => {
    const { database, core, dependencies } = createFixture()
    try {
      const student = core.createStudent('在读学生')
      const outsider = core.createStudent('非在读学生')
      const course = core.createCourse({ title: '课程', mode: 'class', studentIds: [student.id] })
      const period = core.nodes.createPeriod(course.id, '阶段')
      const lesson = core.nodes.createLesson(period.id, '课次')
      const response = await dispatchAttendanceIpc(
        ATTENDANCE_IPC_CHANNELS.saveLesson,
        { lessonId: lesson.id, entries: [{ studentId: outsider.id, status: 'present' }] },
        dependencies,
        new TestLogger(),
      )
      expect(response).toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.ATTENDANCE_ERROR } })
    } finally {
      database.close()
    }
  })
})
