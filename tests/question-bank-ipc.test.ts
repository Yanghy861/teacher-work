import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  dispatchQuestionBankIpc,
  QUESTION_BANK_CHANNELS,
  registerQuestionBankIpc,
  type QuestionBankIpcDependencies,
} from '../src/main/ipc/question-bank-ipc'
import type { QuestionBankService } from '../src/main/question-bank/question-bank-service'
import type { IpcLogger, IpcMainPort } from '../src/main/ipc/app-ipc'
import {
  IPC_ERROR_CODES,
  QUESTION_BANK_IPC_CHANNELS,
  type IpcResponse,
} from '../src/shared/ipc-contracts'

class FakeIpcMain implements IpcMainPort {
  readonly handlers = new Map<string, (event: unknown, payload: unknown) => Promise<IpcResponse<unknown>>>()
  readonly removed: string[] = []

  handle(channel: string, listener: (event: unknown, payload: unknown) => Promise<IpcResponse<unknown>>): void {
    this.handlers.set(channel, listener)
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel)
    this.removed.push(channel)
  }
}

class TestLogger implements IpcLogger {
  log(): void {}
  error(): void {}
}

const roots: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function dependencies(): QuestionBankIpcDependencies {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-question-bank-ipc-'))
  roots.push(root)
  const service = {
    getSummary: vi.fn(() => ({
      installed: false,
      packageId: null,
      sourceName: null,
      exportedAt: null,
      questionCount: 0,
      paperCount: 0,
      assetCount: 0,
      grades: [], years: [], months: [], types: [], examTypes: [], tags: [],
      difficultyMin: null,
      difficultyMax: null,
    })),
    search: vi.fn(() => ({ total: 0, limit: 50, offset: 0, items: [] })),
    importSnapshot: vi.fn(),
    getQuestion: vi.fn(),
    copyToLibrary: vi.fn(),
    copyToLesson: vi.fn(),
  } as unknown as QuestionBankService
  return {
    getService: () => service,
    chooseSnapshotPath: async () => null,
  }
}

describe('question bank IPC boundary', () => {
  it('registers and unregisters only the question-bank whitelist', () => {
    const ipcMain = new FakeIpcMain()
    const unregister = registerQuestionBankIpc(ipcMain, dependencies(), new TestLogger())
    expect([...ipcMain.handlers.keys()]).toEqual(QUESTION_BANK_CHANNELS)
    unregister()
    expect(ipcMain.handlers.size).toBe(0)
    expect(ipcMain.removed).toEqual(QUESTION_BANK_CHANNELS)
  })

  it('returns summary and a canceled import without exposing paths', async () => {
    const deps = dependencies()
    expect(await dispatchQuestionBankIpc(
      QUESTION_BANK_IPC_CHANNELS.getSummary,
      {},
      deps,
      new TestLogger(),
    )).toMatchObject({ ok: true, data: { installed: false } })
    expect(await dispatchQuestionBankIpc(
      QUESTION_BANK_IPC_CHANNELS.chooseAndImport,
      {},
      deps,
      new TestLogger(),
    )).toEqual({ ok: true, data: null })
  })

  it('dispatches the V17-A search-questions channel with the same payload guard as search', async () => {
    const searched: unknown[] = []
    const service = {
      getSummary: vi.fn(),
      search: (request: unknown) => {
        searched.push(request)
        return { total: 0, limit: 50, offset: 0, items: [] }
      },
      importSnapshot: vi.fn(),
      getQuestion: vi.fn(),
      copyToLibrary: vi.fn(),
      copyToLesson: vi.fn(),
    } as unknown as QuestionBankService
    const deps: QuestionBankIpcDependencies = {
      getService: () => service,
      chooseSnapshotPath: async () => null,
    }
    expect(await dispatchQuestionBankIpc(
      QUESTION_BANK_IPC_CHANNELS.searchQuestions,
      { text: '一次函数', limit: 10 },
      deps,
      new TestLogger(),
    )).toMatchObject({ ok: true, data: { total: 0, items: [] } })
    expect(await dispatchQuestionBankIpc(
      QUESTION_BANK_IPC_CHANNELS.searchQuestions,
      { limit: 101 },
      deps,
      new TestLogger(),
    )).toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })
    expect(searched).toEqual([{ text: '一次函数', limit: 10 }])
  })

  it('rejects extra fields, invalid ranges, and unknown channels before service calls', async () => {
    const deps = dependencies()
    for (const payload of [
      { text: '函数', path: 'E:\\Wss_Tiku' },
      { tag: '函数' },
      { tags: ['函数', '函数'] },
      { month: 0 },
      { questionNumbers: [1, 1] },
      { questionNumbers: [0] },
      { questionNumbers: Array.from({ length: 201 }, (_, index) => index + 1) },
      { limit: 101 },
      { offset: -1 },
    ]) {
      expect(await dispatchQuestionBankIpc(
        QUESTION_BANK_IPC_CHANNELS.search,
        payload,
        deps,
        new TestLogger(),
      )).toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })
    }
    expect(await dispatchQuestionBankIpc(
      'question-bank:unknown',
      {},
      deps,
      new TestLogger(),
    )).toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.UNKNOWN_CHANNEL } })
  })
})
