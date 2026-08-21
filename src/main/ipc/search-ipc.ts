import {
  failure,
  IPC_ERROR_CODES,
  isEmptyIpcRequest,
  SEARCH_IPC_CHANNELS,
  success,
  type IpcChannel,
  type IpcResponse,
} from '../../shared/ipc-contracts'
import {
  isSearchHit,
  isSearchIndexStatusSummary,
  isSearchQuery,
  isSearchRebuildResult,
  type SearchQuery,
  type SearchRebuildResult,
} from '../../shared/search-contracts'
import { SearchService, SearchServiceError } from '../search/search-service'
import type { IpcLogger, IpcMainPort } from './app-ipc'

export interface SearchIpcDependencies {
  readonly getSearchService: () => SearchService
  readonly rebuildSearchIndex: () => Promise<SearchRebuildResult>
}

export const SEARCH_CHANNELS: readonly IpcChannel[] = Object.values(SEARCH_IPC_CHANNELS)

class SearchIpcRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SearchIpcRequestError'
  }
}

export function registerSearchIpc(
  ipcMain: IpcMainPort,
  dependencies: SearchIpcDependencies,
  logger: IpcLogger,
): () => void {
  for (const channel of SEARCH_CHANNELS) {
    ipcMain.handle(channel, (_event, payload) =>
      dispatchSearchIpc(channel, payload, dependencies, logger),
    )
  }
  return () => {
    for (const channel of SEARCH_CHANNELS) {
      ipcMain.removeHandler(channel)
    }
  }
}

export async function dispatchSearchIpc(
  channel: string,
  payload: unknown,
  dependencies: SearchIpcDependencies,
  logger: IpcLogger,
): Promise<IpcResponse<unknown>> {
  if (!SEARCH_CHANNELS.includes(channel as IpcChannel)) {
    logger.log('warn', 'ipc.unknown_search_channel', { channel })
    return failure(IPC_ERROR_CODES.UNKNOWN_CHANNEL, '未知的 IPC 通道。')
  }

  try {
    const service = dependencies.getSearchService()
    switch (channel) {
      case SEARCH_IPC_CHANNELS.query:
        assertRequest(payload, isSearchQuery)
        return ensureResponse(await service.search(payload as SearchQuery), (value): value is readonly unknown[] =>
          Array.isArray(value) && value.every(isSearchHit),
        )
      case SEARCH_IPC_CHANNELS.getStatus:
        assertRequest(payload, isEmptyIpcRequest)
        return ensureResponse(service.getIndexStatusSummary(), isSearchIndexStatusSummary)
      case SEARCH_IPC_CHANNELS.rebuild:
        assertRequest(payload, isEmptyIpcRequest)
        return ensureResponse(await dependencies.rebuildSearchIndex(), isSearchRebuildResult)
    }
    throw new Error('Unhandled search IPC channel')
  } catch (error) {
    const response = mapSearchIpcError(error)
    logger.error('ipc.search_request_failed', error, {
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
  if (!guard(payload)) {
    throw new SearchIpcRequestError('请求参数无效。')
  }
}

function ensureResponse<T>(value: T, guard: (candidate: unknown) => candidate is T): IpcResponse<T> {
  if (!guard(value)) {
    throw new Error('Search service returned an invalid response')
  }
  return success(value)
}

function mapSearchIpcError(error: unknown): IpcResponse<never> {
  if (error instanceof SearchIpcRequestError) {
    return failure(IPC_ERROR_CODES.INVALID_PAYLOAD, error.message)
  }
  if (error instanceof SearchServiceError) {
    return failure(IPC_ERROR_CODES.SEARCH_ERROR, error.message)
  }
  return failure(IPC_ERROR_CODES.INTERNAL_ERROR, '无法完成搜索操作，请稍后重试。')
}
