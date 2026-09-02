import {
  AI_IPC_CHANNELS,
  AI_IPC_EVENTS,
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
  isAiStreamEvent,
  isUpdateAiSettingsRequest,
  type AiStreamEvent,
  type AiTextRequest,
  type AiRequestIdRequest,
  type UpdateAiSettingsRequest,
} from '../../shared/ai-contracts'
import { AiGateway, AiGatewayError, type AiGatewayStreamChunk } from '../ai/ai-gateway'
import { AiSettingsService } from '../ai/ai-settings-service'
import { extractIpcSender, type IpcEventSender, type IpcLogger, type IpcMainPort } from './app-ipc'
import type { WorkspaceActivityGate } from '../workspace/activity-gate'
import { WorkspaceActivityError } from '../workspace/activity-gate'

export interface AiIpcDependencies {
  readonly getSettingsService: () => AiSettingsService
  readonly getGateway: () => AiGateway
  readonly activityGate?: WorkspaceActivityGate
}

/** D22：推送流事件到 Renderer（载荷经 isAiStreamEvent 校验后才发送）。 */
export function pushAiStreamEvent(sender: IpcEventSender | undefined, event: AiStreamEvent): void {
  if (sender === undefined || !isAiStreamEvent(event)) return
  sender.send(AI_IPC_EVENTS.streamEvent, event)
}

/** D22：把网关 chunk 翻译为推送事件——reasoning 只推进度计数（不转发思维链原文），text 逐块转发。 */
export function buildStreamEventSink(requestId: string, sender: IpcEventSender | undefined) {
  let reasoningChars = 0
  return (chunk: AiGatewayStreamChunk): void => {
    if (chunk.kind === 'reasoning') {
      reasoningChars += chunk.chars
      pushAiStreamEvent(sender, { requestId, kind: 'reasoning', chars: reasoningChars })
      return
    }
    pushAiStreamEvent(sender, { requestId, kind: 'text', text: chunk.text })
  }
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
    ipcMain.handle(channel, (event, payload) =>
      dependencies.activityGate === undefined
        ? dispatchAiIpc(channel, payload, dependencies, logger, extractIpcSender(event))
        : dependencies.activityGate.run(() => dispatchAiIpc(channel, payload, dependencies, logger, extractIpcSender(event))).catch((error: unknown) => {
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
  sender?: IpcEventSender,
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
      case AI_IPC_CHANNELS.requestText: {
        assertRequest(payload, isAiTextRequest)
        const request = payload as AiTextRequest
        if (request.stream === true) {
          const result = await dependencies.getGateway().requestStreamText(
            request.requestId,
            request.prompt,
            request.maxTokens,
            buildStreamEventSink(request.requestId, sender),
          )
          pushAiStreamEvent(sender, { requestId: request.requestId, kind: 'done', chars: result.text.length, model: result.model })
          return ensureResponse(result, isAiTextResult)
        }
        return ensureResponse(
          await dependencies.getGateway().requestText(
            request.requestId,
            request.prompt,
            request.maxTokens,
          ),
          isAiTextResult,
        )
      }
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
