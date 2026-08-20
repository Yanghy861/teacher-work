import { describe, expect, it } from 'vitest'

import {
  dispatchAppIpc,
  registerAppIpc,
  type AppIpcDependencies,
  type IpcMainPort,
} from '../src/main/ipc/app-ipc'
import {
  IPC_CHANNELS,
  IPC_ERROR_CODES,
  type IpcResponse,
  type WorkspaceInfo,
} from '../src/shared/ipc-contracts'
import { StructuredLogger } from '../src/main/logging/structured-logger'

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

function createLogger(): { logger: StructuredLogger; lines: string[] } {
  const lines: string[] = []
  return { logger: new StructuredLogger((line) => lines.push(line)), lines }
}

function createDependencies(overrides: Partial<AppIpcDependencies> = {}): AppIpcDependencies {
  const workspaceInfo: WorkspaceInfo = { workspaceId: 'test-workspace', schemaVersion: 1 }
  return {
    getAppVersion: () => '0.1.0',
    getWorkspaceInfo: () => workspaceInfo,
    ...overrides,
  }
}

describe('secure application IPC', () => {
  it('registers only the explicit whitelist and unregisters it', async () => {
    const ipcMain = new FakeIpcMain()
    const { logger } = createLogger()
    const unregister = registerAppIpc(ipcMain, createDependencies(), logger)

    expect([...ipcMain.handlers.keys()]).toEqual([
      IPC_CHANNELS.getAppVersion,
      IPC_CHANNELS.getWorkspaceInfo,
    ])
    const response = await ipcMain.handlers.get(IPC_CHANNELS.getWorkspaceInfo)!({}, {})
    expect(response).toEqual({
      ok: true,
      data: { workspaceId: 'test-workspace', schemaVersion: 1 },
    })

    unregister()
    expect(ipcMain.handlers.size).toBe(0)
    expect(ipcMain.removedChannels).toEqual([
      IPC_CHANNELS.getAppVersion,
      IPC_CHANNELS.getWorkspaceInfo,
    ])
  })

  it('accepts valid empty requests but rejects path and SQL injection payloads', async () => {
    const { logger } = createLogger()
    const dependencies = createDependencies()

    await expect(
      dispatchAppIpc(IPC_CHANNELS.getAppVersion, {}, dependencies, logger),
    ).resolves.toEqual({ ok: true, data: '0.1.0' })
    await expect(
      dispatchAppIpc(IPC_CHANNELS.getWorkspaceInfo, { root: 'C:\\secret' }, dependencies, logger),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: IPC_ERROR_CODES.INVALID_PAYLOAD,
        message: '请求参数无效；该操作不接受文件路径、SQL 或其他额外参数。',
      },
    })
    await expect(
      dispatchAppIpc(IPC_CHANNELS.getWorkspaceInfo, { sql: 'DROP TABLE nodes' }, dependencies, logger),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD },
    })
  })

  it('rejects unknown channels and maps internal errors without exposing a Main stack', async () => {
    const { logger, lines } = createLogger()
    const dependencies = createDependencies({
      getWorkspaceInfo: () => {
        throw new Error('apiKey=ipc-secret')
      },
    })

    const unknown = await dispatchAppIpc('arbitrary:invoke', {}, dependencies, logger)
    expect(unknown).toEqual({
      ok: false,
      error: { code: IPC_ERROR_CODES.UNKNOWN_CHANNEL, message: '未知的 IPC 通道。' },
    })

    const internal = await dispatchAppIpc(IPC_CHANNELS.getWorkspaceInfo, {}, dependencies, logger)
    expect(internal).toEqual({
      ok: false,
      error: {
        code: IPC_ERROR_CODES.INTERNAL_ERROR,
        message: '无法完成请求，请稍后重试。',
      },
    })
    expect(JSON.stringify(internal)).not.toContain('ipc-secret')
    expect(lines.join('\n')).toContain('ipc.request_failed')
    expect(lines.join('\n')).not.toContain('ipc-secret')
    expect(lines.join('\n')).toContain('[REDACTED]')
    expect(lines.join('\n')).not.toContain('stackTrace')
  })
})
