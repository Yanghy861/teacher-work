import { describe, expect, it } from 'vitest'

import { dispatchAiIpc, registerAiIpc, AI_CHANNELS, type AiIpcDependencies } from '../src/main/ipc/ai-ipc'
import type { AiGateway } from '../src/main/ai/ai-gateway'
import type { AiSettingsService } from '../src/main/ai/ai-settings-service'
import { AI_IPC_CHANNELS, IPC_ERROR_CODES, type IpcResponse } from '../src/shared/ipc-contracts'
import type { IpcLogger, IpcMainPort } from '../src/main/ipc/app-ipc'

class FakeIpcMain implements IpcMainPort {
  readonly handlers = new Map<string, (event: unknown, payload: unknown) => Promise<IpcResponse<unknown>>>()
  handle(channel: string, listener: (event: unknown, payload: unknown) => Promise<IpcResponse<unknown>>): void { this.handlers.set(channel, listener) }
  removeHandler(channel: string): void { this.handlers.delete(channel) }
}

class TestLogger implements IpcLogger {
  readonly lines: string[] = []
  log(_level: 'info' | 'warn' | 'error', event: string): void { this.lines.push(event) }
  error(_event: string, error: unknown): void { this.lines.push(error instanceof Error ? error.message : String(error)) }
}

describe('AI IPC boundary', () => {
  it('exposes settings status only and rejects key reads or extra fields', async () => {
    const logger = new TestLogger()
    const settings = {
      getSettings: () => ({ provider: 'openai-compatible' as const, model: 'fake', endpoint: 'https://fake.local/v1', keyConfigured: true, keyStorage: 'secure' as const }),
      updateSettings: (request: { apiKey?: string }) => {
        expect(request.apiKey).toBe('IPC_KEY')
        return { provider: 'openai-compatible' as const, model: 'fake', endpoint: 'https://fake.local/v1', keyConfigured: true, keyStorage: 'secure' as const }
      },
    } as unknown as AiSettingsService
    const gateway = {
      testConnection: async () => ({ provider: 'openai-compatible' as const, model: 'fake', latencyMs: 1 }),
      requestText: async () => ({ text: 'draft', model: 'fake' }),
      cancel: () => true,
    } as unknown as AiGateway
    const dependencies: AiIpcDependencies = { getSettingsService: () => settings, getGateway: () => gateway }
    const get = await dispatchAiIpc(AI_IPC_CHANNELS.getSettings, {}, dependencies, logger)
    expect(get).toEqual({ ok: true, data: { provider: 'openai-compatible', model: 'fake', endpoint: 'https://fake.local/v1', keyConfigured: true, keyStorage: 'secure' } })
    expect(JSON.stringify(get)).not.toContain('IPC_KEY')

    const update = await dispatchAiIpc(AI_IPC_CHANNELS.updateSettings, { provider: 'openai-compatible', model: 'fake', endpoint: 'https://fake.local/v1', apiKey: 'IPC_KEY' }, dependencies, logger)
    expect(update).toMatchObject({ ok: true, data: { keyConfigured: true } })
    const invalid = await dispatchAiIpc(AI_IPC_CHANNELS.updateSettings, { provider: 'openai-compatible', model: 'fake', endpoint: 'https://fake.local/v1', path: 'C:\\secret' }, dependencies, logger)
    expect(invalid).toEqual({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD, message: '请求参数无效。' } })
  })

  it('registers all AI channels and maps connection, request, and cancel', async () => {
    const logger = new TestLogger()
    const settings = { getSettings: () => ({ provider: 'openai-compatible' as const, model: 'fake', endpoint: 'https://fake.local/v1', keyConfigured: false, keyStorage: 'none' as const }) } as unknown as AiSettingsService
    const gateway = {
      testConnection: async (requestId: string) => ({ provider: 'openai-compatible' as const, model: requestId, latencyMs: 2 }),
      requestText: async (requestId: string, prompt: string) => ({ text: `${requestId}:${prompt}`, model: 'fake' }),
      cancel: (requestId: string) => requestId === 'cancel-me',
    } as unknown as AiGateway
    const dependencies: AiIpcDependencies = { getSettingsService: () => settings, getGateway: () => gateway }
    const ipcMain = new FakeIpcMain()
    const unregister = registerAiIpc(ipcMain, dependencies, logger)
    expect([...ipcMain.handlers.keys()]).toEqual(AI_CHANNELS)
    await expect(dispatchAiIpc(AI_IPC_CHANNELS.testConnection, { requestId: 'test' }, dependencies, logger)).resolves.toMatchObject({ ok: true, data: { model: 'test' } })
    await expect(dispatchAiIpc(AI_IPC_CHANNELS.requestText, { requestId: 'run', prompt: 'hello' }, dependencies, logger)).resolves.toEqual({ ok: true, data: { text: 'run:hello', model: 'fake' } })
    await expect(dispatchAiIpc(AI_IPC_CHANNELS.cancel, { requestId: 'cancel-me' }, dependencies, logger)).resolves.toEqual({ ok: true, data: { cancelled: true } })
    unregister()
    expect(ipcMain.handlers.size).toBe(0)
  })
})
