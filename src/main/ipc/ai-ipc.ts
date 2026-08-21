import {
  AI_IPC_CHANNELS,
  failure,
  IPC_ERROR_CODES,
  isEmptyIpcRequest,
  success,
  type IpcChannel,
  type IpcResponse,
} from '../../shared/ipc-contracts'
import {
  isAiRequestIdRequest,
  isAiSettings,
  isAiTextRequest,
  isAiConnectionTestResult,
  isAiTextResult,
  isAiCancelResult,
  isUpdateAiSettingsRequest,
  type AiTextRequest,
  type AiRequestIdRequest,
  type UpdateAiSettingsRequest,
} from '../../shared/ai-contracts'
import { AiGateway, AiGatewayError } from '../ai/ai-gateway'
import { AiSettingsService } from '../ai/ai-settings-service'
import type { IpcLogger, IpcMainPort } from './app-ipc'
import type { WorkspaceActivityGate } from '../workspace/activity-gate'
import { WorkspaceActivityError } from '../workspace/activity-gate'

export interface AiIpcDependencies {
  readonly getSettingsService: () => AiSettingsService
  readonly getGateway: () => AiGateway
  readonly activityGate?: WorkspaceActivityGate
}

export const AI_CHANNELS: readonly IpcChannel[] = Object.values(AI_IPC_CHANNELS)

class AiIpcRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiIpcRequestError'
  }
}

export function registerAiIpc(
  ipcMain: IpcMainPort,
  dependencies: AiIpcDependencies,
  logger: IpcLogger,
): () => void {
  for (const channel of AI_CHANNELS) {
    ipcMain.handle(channel, (_event, payload) =>
      dependencies.activityGate === undefined
        ? dispatchAiIpc(channel, payload, dependencies, logger)
        : dependencies.activityGate.run(() => dispatchAiIpc(channel, payload, dependencies, logger)).catch((error: unknown) => {
          if (error instanceof WorkspaceActivityError) return failure(IPC_ERROR_CODES.WORKSPACE_BUSY, error.message)
          throw error
        }),
    )
  }
  return () => {
    for (const channel of AI_CHANNELS) ipcMain.removeHandler(channel)
  }
}

export async function dispatchAiIpc(
  channel: string,
  payload: unknown,
  dependencies: AiIpcDependencies,
  logger: IpcLogger,
): Promise<IpcResponse<unknown>> {
  if (!AI_CHANNELS.includes(channel as IpcChannel)) {
    logger.log('warn', 'ipc.unknown_ai_channel', { channel })
    return failure(IPC_ERROR_CODES.UNKNOWN_CHANNEL, '未知的 IPC 通道。')
  }
  try {
    switch (channel) {
      case AI_IPC_CHANNELS.getSettings:
        assertRequest(payload, isEmptyIpcRequest)
        return ensureResponse(dependencies.getSettingsService().getSettings(), isAiSettings)
      case AI_IPC_CHANNELS.updateSettings:
        assertRequest(payload, isUpdateAiSettingsRequest)
        return ensureResponse(
          dependencies.getSettingsService().updateSettings(payload as UpdateAiSettingsRequest),
          isAiSettings,
        )
      case AI_IPC_CHANNELS.testConnection:
        assertRequest(payload, isAiRequestIdRequest)
        return ensureResponse(await dependencies.getGateway().testConnection((payload as AiRequestIdRequest).requestId), isAiConnectionTestResult)
      case AI_IPC_CHANNELS.requestText:
        assertRequest(payload, isAiTextRequest)
        return ensureResponse(
          await dependencies.getGateway().requestText(
            (payload as AiTextRequest).requestId,
            (payload as AiTextRequest).prompt,
            (payload as AiTextRequest).maxTokens,
          ),
          isAiTextResult,
        )
      case AI_IPC_CHANNELS.cancel:
        assertRequest(payload, isAiRequestIdRequest)
        return ensureResponse(
          { cancelled: dependencies.getGateway().cancel((payload as AiRequestIdRequest).requestId) },
          isAiCancelResult,
        )
    }
    throw new Error('Unhandled AI IPC channel')
  } catch (error) {
    const response = mapAiIpcError(error)
    logger.error('ipc.ai_request_failed', error, { channel, code: response.ok ? undefined : response.error.code })
    return response
  }
}

function assertRequest<T>(payload: unknown, guard: (value: unknown) => value is T): asserts payload is T {
  if (!guard(payload)) throw new AiIpcRequestError('请求参数无效。')
}

function ensureResponse<T>(value: T, guard: (candidate: unknown) => candidate is T): IpcResponse<T> {
  if (!guard(value)) throw new Error('AI service returned an invalid response')
  return success(value)
}

function mapAiIpcError(error: unknown): IpcResponse<never> {
  if (error instanceof AiIpcRequestError) return failure(IPC_ERROR_CODES.INVALID_PAYLOAD, error.message)
  if (error instanceof AiGatewayError) return failure(IPC_ERROR_CODES.AI_ERROR, mapGatewayMessage(error))
  return failure(IPC_ERROR_CODES.INTERNAL_ERROR, '无法完成 AI 操作，请稍后重试。')
}

function mapGatewayMessage(error: AiGatewayError): string {
  return error.message
}
