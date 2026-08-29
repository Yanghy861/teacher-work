import {
  DRAFT_IPC_CHANNELS,
  failure,
  IPC_ERROR_CODES,
  success,
  type IpcChannel,
  type IpcResponse,
} from '../../shared/ipc-contracts'
import {
  isDraftIdRequest,
  isGenerateDraftRequest,
  isGenerateDraftResult,
  isRegenerateDraftRequest,
  isSaveDraftRequest,
  type DraftIdRequest,
  type GenerateDraftRequest,
  type RegenerateDraftRequest,
  type SaveDraftRequest,
} from '../../shared/draft-contracts'
import { isNoteRecord } from '../../shared/core-contracts'
import { isPublishDraftVersionRequest, type PublishDraftVersionRequest } from '../../shared/draft-contracts'
import { AiGatewayError } from '../ai/ai-gateway'
import { DraftService, DraftServiceError } from '../draft/draft-service'
import type { ManagedFileService } from '../files/managed-file-service'
import type { IpcLogger, IpcMainPort } from './app-ipc'
import type { WorkspaceActivityGate } from '../workspace/activity-gate'
import { WorkspaceActivityError } from '../workspace/activity-gate'

export interface DraftIpcDependencies {
  readonly getDraftService: () => DraftService
  readonly getManagedFiles: () => ManagedFileService
  readonly activityGate?: WorkspaceActivityGate
}

export const DRAFT_CHANNELS: readonly IpcChannel[] = Object.values(DRAFT_IPC_CHANNELS)

class DraftIpcRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DraftIpcRequestError'
  }
}

export function registerDraftIpc(
  ipcMain: IpcMainPort,
  dependencies: DraftIpcDependencies,
  logger: IpcLogger,
): () => void {
  for (const channel of DRAFT_CHANNELS) {
    ipcMain.handle(channel, (_event, payload) =>
      dependencies.activityGate === undefined
        ? dispatchDraftIpc(channel, payload, dependencies, logger)
        : dependencies.activityGate.run(() => dispatchDraftIpc(channel, payload, dependencies, logger)).catch((error: unknown) => {
          if (error instanceof WorkspaceActivityError) return failure(IPC_ERROR_CODES.WORKSPACE_BUSY, error.message)
          throw error
        }),
    )
  }
  return () => {
    for (const channel of DRAFT_CHANNELS) ipcMain.removeHandler(channel)
  }
}

export async function dispatchDraftIpc(
  channel: string,
  payload: unknown,
  dependencies: DraftIpcDependencies,
  logger: IpcLogger,
): Promise<IpcResponse<unknown>> {
  if (!DRAFT_CHANNELS.includes(channel as IpcChannel)) {
    logger.log('warn', 'ipc.unknown_draft_channel', { channel })
    return failure(IPC_ERROR_CODES.UNKNOWN_CHANNEL, '未知的 IPC 通道。')
  }
  try {
    const service = dependencies.getDraftService()
    switch (channel) {
      case DRAFT_IPC_CHANNELS.generate: {
        assertRequest(payload, isGenerateDraftRequest)
        const result = await service.generate(payload as GenerateDraftRequest)
        if (!isGenerateDraftResult(result)) {
          throw new Error('Draft service returned an invalid generation response')
        }
        return success(result)
      }
      case DRAFT_IPC_CHANNELS.regenerate: {
        assertRequest(payload, isRegenerateDraftRequest)
        const result = await service.regenerate(payload as RegenerateDraftRequest)
        if (!isGenerateDraftResult(result)) {
          throw new Error('Draft service returned an invalid regeneration response')
        }
        return success(result)
      }
      case DRAFT_IPC_CHANNELS.saveToLesson:
        assertRequest(payload, isSaveDraftRequest)
        return ensureNoteResponse(service.saveToLesson(payload as SaveDraftRequest))
      case DRAFT_IPC_CHANNELS.softDelete:
        assertRequest(payload, isDraftIdRequest)
        return ensureNoteResponse(service.softDelete(payload as DraftIdRequest))
      case DRAFT_IPC_CHANNELS.publishToLesson: {
        assertRequest(payload, isPublishDraftVersionRequest)
        const published = dependencies
          .getManagedFiles()
          .publishLessonDraftVersion((payload as PublishDraftVersionRequest).noteId)
        return success(published)
      }
    }
    throw new Error('Unhandled draft IPC channel')
  } catch (error) {
    const response = mapDraftIpcError(error)
    logger.error('ipc.draft_request_failed', error, {
      channel,
      code: response.ok ? undefined : response.error.code,
    })
    return response
  }
}

function assertRequest<T>(
  payload: unknown,
  guard: (value: unknown) => value is T,
): asserts payload is T {
  if (!guard(payload)) throw new DraftIpcRequestError('请求参数无效。')
}

function ensureNoteResponse(value: unknown): IpcResponse<unknown> {
  if (!isNoteRecord(value)) throw new Error('Draft service returned an invalid note response')
  return success(value)
}

function mapDraftIpcError(error: unknown): IpcResponse<never> {
  if (error instanceof DraftIpcRequestError) {
    return failure(IPC_ERROR_CODES.INVALID_PAYLOAD, error.message)
  }
  if (error instanceof DraftServiceError) {
    return failure(IPC_ERROR_CODES.DRAFT_ERROR, error.message)
  }
  if (error instanceof AiGatewayError) {
    return failure(IPC_ERROR_CODES.AI_ERROR, error.message)
  }
  return failure(IPC_ERROR_CODES.INTERNAL_ERROR, '无法完成草稿操作，请稍后重试。')
}
