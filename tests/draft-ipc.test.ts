import { describe, expect, it } from 'vitest'

import { dispatchDraftIpc, registerDraftIpc, DRAFT_CHANNELS, type DraftIpcDependencies } from '../src/main/ipc/draft-ipc'
import type { DraftService } from '../src/main/draft/draft-service'
import { DRAFT_IPC_CHANNELS, IPC_ERROR_CODES, type IpcResponse } from '../src/shared/ipc-contracts'
import type { IpcLogger, IpcMainPort } from '../src/main/ipc/app-ipc'

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

const validRequest = {
  requestId: 'draft-ipc',
  kind: 'lecture' as const,
  lessonId: 'lesson-1',
  sources: [{ fileId: 'file-1', text: 'selected text', position: { type: 'line', value: 1 } }],
  maxChars: 100,
  maxTokens: 100,
}

describe('draft IPC boundary', () => {
  it('registers only narrow draft channels and validates generation, lifecycle, and delete requests', async () => {
    const logger = new TestLogger()
    const metadata = {
      kind: 'lecture' as const,
      promptVersion: 'v11-03-v1',
      provider: 'openai-compatible',
      model: 'fake-model',
      sources: [{ fileId: 'file-1', position: { type: 'line' as const, value: 1 }, charsSent: 13 }],
      inputChars: 13,
      maxChars: 100,
      maxTokens: 100,
    }
    const service = {
      generate: async () => ({
        noteId: 'note-1',
        kind: 'lecture' as const,
        bodyMd: '# 可编辑草稿',
        metadata,
      }),
      regenerate: async () => ({
        noteId: 'note-2',
        kind: 'lecture' as const,
        bodyMd: '# 新草稿',
        metadata,
      }),
      saveToLesson: () => ({
        id: 'note-1',
        studentId: null,
        lessonId: 'lesson-1',
        bodyMd: '# 已保存成果',
        createdAt: '2026-08-22T00:00:00.000Z',
        updatedAt: '2026-08-22T00:01:00.000Z',
        deletedAt: null,
        noteKind: 'lecture' as const,
        draftStatus: 'saved' as const,
        aiMetadata: metadata,
      }),
      softDelete: () => ({
        id: 'note-1',
        studentId: null,
        lessonId: 'lesson-1',
        bodyMd: '# 可编辑草稿',
        createdAt: '2026-08-22T00:00:00.000Z',
        updatedAt: '2026-08-22T00:01:00.000Z',
        deletedAt: '2026-08-22T00:01:00.000Z',
        noteKind: 'lecture' as const,
        draftStatus: 'draft' as const,
        aiMetadata: metadata,
      }),
    } as unknown as DraftService
    const dependencies: DraftIpcDependencies = {
      getDraftService: () => service,
      getManagedFiles: () => ({ publishLessonDraftVersion: () => ({ file: {}, version: 1 }) }) as never,
    }
    const ipcMain = new FakeIpcMain()
    const unregister = registerDraftIpc(ipcMain, dependencies, logger)
    expect([...ipcMain.handlers.keys()]).toEqual(DRAFT_CHANNELS)
    await expect(dispatchDraftIpc(DRAFT_IPC_CHANNELS.generate, validRequest, dependencies, logger)).resolves.toMatchObject({ ok: true, data: { noteId: 'note-1' } })
    await expect(dispatchDraftIpc(DRAFT_IPC_CHANNELS.generate, { ...validRequest, path: 'C:\\secret' }, dependencies, logger)).resolves.toEqual({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD, message: '请求参数无效。' } })
    await expect(dispatchDraftIpc(DRAFT_IPC_CHANNELS.generate, { ...validRequest, maxChars: 100_001 }, dependencies, logger)).resolves.toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })
    await expect(dispatchDraftIpc(DRAFT_IPC_CHANNELS.generate, { ...validRequest, skillId: '' }, dependencies, logger)).resolves.toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })
    await expect(dispatchDraftIpc(DRAFT_IPC_CHANNELS.generate, { ...validRequest, requirement: 'x'.repeat(4_001) }, dependencies, logger)).resolves.toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })
    await expect(dispatchDraftIpc(DRAFT_IPC_CHANNELS.generate, { ...validRequest, skillId: 'skill-1', requirement: '多安排基础题。' }, dependencies, logger)).resolves.toMatchObject({ ok: true })
    await expect(dispatchDraftIpc(DRAFT_IPC_CHANNELS.regenerate, { requestId: 'regen-1', noteId: 'note-1' }, dependencies, logger)).resolves.toMatchObject({ ok: true, data: { noteId: 'note-2' } })
    await expect(dispatchDraftIpc(DRAFT_IPC_CHANNELS.saveToLesson, { noteId: 'note-1', bodyMd: '# 已保存成果' }, dependencies, logger)).resolves.toMatchObject({ ok: true, data: { draftStatus: 'saved' } })
    await expect(dispatchDraftIpc(DRAFT_IPC_CHANNELS.softDelete, { noteId: 'note-1' }, dependencies, logger)).resolves.toMatchObject({ ok: true, data: { deletedAt: expect.any(String) } })
    await expect(dispatchDraftIpc(DRAFT_IPC_CHANNELS.regenerate, { requestId: 'regen-1', noteId: 'note-1', path: 'C:\\secret' }, dependencies, logger)).resolves.toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })
    await expect(dispatchDraftIpc(DRAFT_IPC_CHANNELS.saveToLesson, { noteId: 'note-1', bodyMd: '' }, dependencies, logger)).resolves.toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })
    await expect(dispatchDraftIpc(DRAFT_IPC_CHANNELS.softDelete, { noteId: 'note-1', restore: true }, dependencies, logger)).resolves.toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })
    const missingLesson = {
      requestId: validRequest.requestId,
      kind: validRequest.kind,
      sources: validRequest.sources,
      maxChars: validRequest.maxChars,
      maxTokens: validRequest.maxTokens,
    }
    await expect(dispatchDraftIpc(DRAFT_IPC_CHANNELS.generate, missingLesson, dependencies, logger)).resolves.toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })
    unregister()
    expect(ipcMain.handlers.size).toBe(0)
  })
})
