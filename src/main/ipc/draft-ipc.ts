import {
  DRAFT_IPC_CHANNELS,
  failure,
  IPC_ERROR_CODES,
  success,
  type IpcChannel,
  type IpcResponse,
} from '../../shared/ipc-contracts'
import { isGenerateDraftRequest, isGenerateDraftResult, type GenerateDraftRequest } from '../../shared/draft-contracts'
import { AiGatewayError } from '../ai/ai-gateway'
import { DraftService, DraftServiceError } from '../draft/draft-service'
import type { IpcLogger, IpcMainPort } from './app-ipc'

export interface DraftIpcDependencies {
  readonly getDraftService: () => DraftService
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
    ipcMain.handle(channel, (_event, payload) => dispatchDraftIpc(channel, payload, dependencies, logger))
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
    if (channel !== DRAFT_IPC_CHANNELS.generate) {
      throw new Error('Unhandled draft IPC channel')
    }
    if (!isGenerateDraftRequest(payload)) {
      throw new DraftIpcRequestError('请求参数无效。')
    }
    const result = await dependencies.getDraftService().generate(payload as GenerateDraftRequest)
    if (!isGenerateDraftResult(result)) {
      throw new Error('Draft service returned an invalid response')
    }
    return success(result)
  } catch (error) {
    const response = mapDraftIpcError(error)
    logger.error('ipc.draft_request_failed', error, {
      channel,
      code: response.ok ? undefined : response.error.code,
    })
    return response
  }
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
  return failure(IPC_ERROR_CODES.INTERNAL_ERROR, '无法完成草稿生成，请稍后重试。')
}
