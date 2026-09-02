import {
  MINERU_IPC_CHANNELS,
  failure,
  IPC_ERROR_CODES,
  success,
  type IpcChannel,
  type IpcResponse,
} from '../../shared/ipc-contracts'
import {
  isMineruConnectionTestResult,
  isMineruEnhanceResult,
  isMineruFileIdRequest,
  isMineruSettings,
  isMineruStatus,
  isMineruTokenRequest,
  isUpdateMineruSettingsRequest,
  type MineruFileIdRequest,
  type MineruTokenRequest,
  type UpdateMineruSettingsRequest,
} from '../../shared/mineru-contracts'
import { MineruError, type MineruService } from '../parser/mineru-service'
import type { MineruSettingsService } from '../ai/mineru-settings-service'
import type { IpcLogger, IpcMainPort } from './app-ipc'
import type { WorkspaceActivityGate } from '../workspace/activity-gate'
import { WorkspaceActivityError } from '../workspace/activity-gate'

export interface MineruIpcDependencies {
  readonly getSettingsService: () => MineruSettingsService
  readonly getMineruService: () => MineruService
  readonly activityGate?: WorkspaceActivityGate
}

export const MINERU_CHANNELS: readonly IpcChannel[] = Object.values(MINERU_IPC_CHANNELS)

class MineruIpcRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MineruIpcRequestError'
  }
}

/** 判活请求超时（轻量判活法：查询不存在的 batch id，非 A0202/A0211 即通过）。 */
const MINERU_TEST_TIMEOUT_MS = 15_000

export function registerMineruIpc(
  ipcMain: IpcMainPort,
  dependencies: MineruIpcDependencies,
  logger: IpcLogger,
): () => void {
  for (const channel of MINERU_CHANNELS) {
    ipcMain.handle(channel, (_event, payload) =>
      dependencies.activityGate === undefined
        ? dispatchMineruIpc(channel, payload, dependencies, logger)
        : dependencies.activityGate.run(() => dispatchMineruIpc(channel, payload, dependencies, logger)).catch((error: unknown) => {
          if (error instanceof WorkspaceActivityError) return failure(IPC_ERROR_CODES.WORKSPACE_BUSY, error.message)
          throw error
        }),
    )
  }
  return () => {
    for (const channel of MINERU_CHANNELS) ipcMain.removeHandler(channel)
  }
}

export async function dispatchMineruIpc(
  channel: string,
  payload: unknown,
  dependencies: MineruIpcDependencies,
  logger: IpcLogger,
): Promise<IpcResponse<unknown>> {
  if (!MINERU_CHANNELS.includes(channel as IpcChannel)) {
    logger.log('warn', 'ipc.unknown_mineru_channel', { channel })
    return failure(IPC_ERROR_CODES.UNKNOWN_CHANNEL, '未知的 IPC 通道。')
  }
  try {
    switch (channel) {
      case MINERU_IPC_CHANNELS.getSettings:
        assertRequest(payload, isEmptyPayload)
        return ensureResponse(dependencies.getSettingsService().getSettings(), isMineruSettings)
      case MINERU_IPC_CHANNELS.updateSettings:
        assertRequest(payload, isUpdateMineruSettingsRequest)
        return ensureResponse(
          dependencies.getSettingsService().updateSettings(payload as UpdateMineruSettingsRequest),
          isMineruSettings,
        )
      case MINERU_IPC_CHANNELS.clearToken:
        assertRequest(payload, isEmptyPayload)
        return ensureResponse(dependencies.getSettingsService().clearToken(), isMineruSettings)
      case MINERU_IPC_CHANNELS.testConnection:
        assertRequest(payload, isMineruTokenRequest)
        return ensureResponse(
          await testMineruConnection(payload as MineruTokenRequest),
          isMineruConnectionTestResult,
        )
      case MINERU_IPC_CHANNELS.enhanceFile:
        assertRequest(payload, isMineruFileIdRequest)
        return ensureResponse(
          await dependencies.getMineruService().enhanceFile((payload as MineruFileIdRequest).fileId),
          isMineruEnhanceResult,
        )
      case MINERU_IPC_CHANNELS.getStatus:
        assertRequest(payload, isMineruFileIdRequest)
        return ensureResponse(
          dependencies.getMineruService().getStatus((payload as MineruFileIdRequest).fileId),
          isMineruStatus,
        )
    }
    throw new Error('Unhandled MinerU IPC channel')
  } catch (error) {
    const response = mapMineruIpcError(error)
    logger.error('ipc.mineru_request_failed', error, { channel, code: response.ok ? undefined : response.error.code })
    return response
  }
}

/**
 * D24 判活：GET /extract-results/batch/<不存在ID>。正常返回“不存在该任务”类业务错误（非 A0202/A0211）
 * 即证明 token 有效、网络可达；A0202/A0211 表示 token/鉴权问题。token 仅注入请求头，不进日志。
 */
export async function testMineruConnection(
  request: MineruTokenRequest,
): Promise<{ latencyMs: number }> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MINERU_TEST_TIMEOUT_MS)
  try {
    const response = await fetch('https://mineru.net/api/v4/extract-results/batch/teacher-workbench-probe', {
      method: 'GET',
      headers: { Authorization: `Bearer ${request.token}` },
      signal: controller.signal,
    })
    const body = await response.json().catch(() => undefined) as { code?: unknown } | undefined
    const code = typeof body?.code === 'number' ? body.code : undefined
    if (code === 401 || code === 403 || response.status === 401 || response.status === 403) {
      throw new MineruError('MINERU_NOT_CONFIGURED', 'MinerU token 无效，请检查后重试。')
    }
    if (code === 402 || response.status === 402) {
      throw new MineruError('MINERU_UPSTREAM', 'MinerU 账户额度不足。')
    }
    return { latencyMs: Date.now() - startedAt }
  } catch (error) {
    if (error instanceof MineruError) throw error
    throw new MineruError('MINERU_UPSTREAM', '无法连接 MinerU 服务，请检查网络。')
  } finally {
    clearTimeout(timer)
  }
}

function assertRequest<T>(payload: unknown, guard: (value: unknown) => value is T): asserts payload is T {
  if (!guard(payload)) throw new MineruIpcRequestError('请求参数无效。')
}

function isEmptyPayload(value: unknown): value is Record<string, never> {
  return typeof value === 'object' && value !== null && Object.keys(value).length === 0
}

function ensureResponse<T>(value: T, guard: (candidate: unknown) => candidate is T): IpcResponse<T> {
  if (!guard(value)) throw new Error('MinerU service returned an invalid response')
  return success(value)
}

function mapMineruIpcError(error: unknown): IpcResponse<never> {
  if (error instanceof MineruIpcRequestError) return failure(IPC_ERROR_CODES.INVALID_PAYLOAD, error.message)
  if (error instanceof MineruError) return failure(IPC_ERROR_CODES.MINERU_ERROR, error.message)
  return failure(IPC_ERROR_CODES.INTERNAL_ERROR, '无法完成增强解析操作，请稍后重试。')
}
