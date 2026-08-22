import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { runMigrations } from '../src/main/db/migrations'
import {
  dispatchSkillIpc,
  registerSkillIpc,
  SKILL_CHANNELS,
  type SkillIpcDependencies,
} from '../src/main/ipc/skill-ipc'
import { SkillService } from '../src/main/skills/skill-service'
import type { IpcLogger, IpcMainPort } from '../src/main/ipc/app-ipc'
import {
  IPC_ERROR_CODES,
  SKILL_IPC_CHANNELS,
  type IpcResponse,
} from '../src/shared/ipc-contracts'
import type { SkillRecord } from '../src/shared/skill-contracts'

class FakeIpcMain implements IpcMainPort {
  readonly handlers = new Map<string, (event: unknown, payload: unknown) => Promise<IpcResponse<unknown>>>()
  handle(channel: string, listener: (event: unknown, payload: unknown) => Promise<IpcResponse<unknown>>): void { this.handlers.set(channel, listener) }
  removeHandler(channel: string): void { this.handlers.delete(channel) }
}

class TestLogger implements IpcLogger {
  readonly errors: string[] = []
  log(): void {}
  error(_event: string, error: unknown): void { this.errors.push(error instanceof Error ? error.message : String(error)) }
}

const databases: Database.Database[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

function createDependencies(): SkillIpcDependencies {
  const database = new Database(':memory:')
  databases.push(database)
  database.pragma('foreign_keys = ON')
  runMigrations(database)
  return { getSkillService: () => new SkillService(database) }
}

describe('V11-03 skill IPC', () => {
  it('registers only the skill whitelist and returns validated CRUD results', async () => {
    const dependencies = createDependencies()
    const logger = new TestLogger()
    const ipcMain = new FakeIpcMain()
    const unregister = registerSkillIpc(ipcMain, dependencies, logger)
    expect([...ipcMain.handlers.keys()]).toEqual(SKILL_CHANNELS)

    const initial = await dispatchSkillIpc(SKILL_IPC_CHANNELS.list, {}, dependencies, logger)
    expect(initial).toMatchObject({ ok: true, data: [{ name: 'AMC8 一对一常规备课' }, { name: '初中数学常规备课' }] })
    const created = await dispatchSkillIpc(
      SKILL_IPC_CHANNELS.create,
      { name: '基础补弱', prompt: '多安排基础题。' },
      dependencies,
      logger,
    )
    expect(created).toMatchObject({ ok: true, data: { name: '基础补弱' } })
    if (!created.ok) throw new Error('Skill creation failed')
    const createdSkill = created.data as SkillRecord
    const updated = await dispatchSkillIpc(
      SKILL_IPC_CHANNELS.update,
      { skillId: createdSkill.id, name: '基础巩固', prompt: '从基础题逐步提升。' },
      dependencies,
      logger,
    )
    expect(updated).toMatchObject({ ok: true, data: { name: '基础巩固' } })
    const deleted = await dispatchSkillIpc(
      SKILL_IPC_CHANNELS.softDelete,
      { skillId: createdSkill.id },
      dependencies,
      logger,
    )
    expect(deleted).toMatchObject({ ok: true, data: { deletedAt: expect.any(String) } })

    unregister()
    expect(ipcMain.handlers.size).toBe(0)
  })

  it('rejects extra fields and never writes Prompt contents into error logs', async () => {
    const dependencies = createDependencies()
    const logger = new TestLogger()
    const secretPrompt = 'PRIVATE_SKILL_PROMPT_SHOULD_NOT_BE_LOGGED'
    const invalid = await dispatchSkillIpc(
      SKILL_IPC_CHANNELS.create,
      { name: '越界请求', prompt: secretPrompt, path: 'C:\\secret' },
      dependencies,
      logger,
    )
    expect(invalid).toEqual({
      ok: false,
      error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD, message: '请求参数无效。' },
    })
    expect(logger.errors.join('\n')).not.toContain(secretPrompt)
    expect(await dispatchSkillIpc('skills:unknown', {}, dependencies, logger)).toMatchObject({
      ok: false,
      error: { code: IPC_ERROR_CODES.UNKNOWN_CHANNEL },
    })
  })
})
