import type {
  ExternalActionResult,
  ExternalDirectoryListing,
  ExternalPathRequest,
  ExternalRootSummary,
} from '../../shared/external-library-contracts'
import {
  isExternalActionResult,
  isExternalDirectoryListing,
  isExternalPathRequest,
  isNullableExternalRootSummary,
} from '../../shared/external-library-contracts'
import {
  EXTERNAL_LIBRARY_IPC_CHANNELS,
  failure,
  IPC_ERROR_CODES,
  isEmptyIpcRequest,
  success,
  type IpcChannel,
  type IpcResponse,
} from '../../shared/ipc-contracts'
import {
  ExternalLibraryError,
  ExternalLibraryService,
} from '../external/external-library-service'
import type { WorkspaceActivityGate } from '../workspace/activity-gate'
import { WorkspaceActivityError } from '../workspace/activity-gate'
import type { IpcLogger, IpcMainPort } from './app-ipc'

export interface ExternalLibraryIpcDependencies {
  readonly getService: () => ExternalLibraryService
  readonly chooseRootPath: () => Promise<string | null>
  readonly openPath: (path: string) => Promise<string>
  readonly showInFolder: (path: string) => void
  readonly activityGate?: WorkspaceActivityGate
}

export const EXTERNAL_LIBRARY_CHANNELS: readonly IpcChannel[] = Object.values(
  EXTERNAL_LIBRARY_IPC_CHANNELS,
)

class ExternalLibraryIpcRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExternalLibraryIpcRequestError'
  }
}

export function registerExternalLibraryIpc(
  ipcMain: IpcMainPort,
  dependencies: ExternalLibraryIpcDependencies,
  logger: IpcLogger,
): () => void {
  for (const channel of EXTERNAL_LIBRARY_CHANNELS) {
    ipcMain.handle(channel, (_event, payload) => {
      const dispatch = () => dispatchExternalLibraryIpc(channel, payload, dependencies, logger)
      return dependencies.activityGate === undefined
        ? dispatch()
        : dependencies.activityGate.run(dispatch).catch((error: unknown) => {
          if (error instanceof WorkspaceActivityError) {
            return failure(IPC_ERROR_CODES.WORKSPACE_BUSY, error.message)
          }
          throw error
        })
    })
  }

  return () => {
    for (const channel of EXTERNAL_LIBRARY_CHANNELS) ipcMain.removeHandler(channel)
  }
}

export async function dispatchExternalLibraryIpc(
  channel: string,
  payload: unknown,
  dependencies: ExternalLibraryIpcDependencies,
  logger: IpcLogger,
): Promise<IpcResponse<unknown>> {
  if (!EXTERNAL_LIBRARY_CHANNELS.includes(channel as IpcChannel)) {
    logger.log('warn', 'ipc.unknown_external_library_channel', { channel })
    return failure(IPC_ERROR_CODES.UNKNOWN_CHANNEL, '未知的 IPC 通道。')
  }

  try {
    const service = dependencies.getService()
    switch (channel) {
      case EXTERNAL_LIBRARY_IPC_CHANNELS.getRoot:
        assertRequest(payload, isEmptyIpcRequest)
        return ensureResponse<ExternalRootSummary | null>(
          service.getRoot(),
          isNullableExternalRootSummary,
        )
      case EXTERNAL_LIBRARY_IPC_CHANNELS.chooseRoot: {
        assertRequest(payload, isEmptyIpcRequest)
        const selectedPath = await dependencies.chooseRootPath()
        return ensureResponse<ExternalRootSummary | null>(
          selectedPath === null ? null : service.setRoot(selectedPath),
          isNullableExternalRootSummary,
        )
      }
      case EXTERNAL_LIBRARY_IPC_CHANNELS.listChildren: {
        assertRequest(payload, isExternalPathRequest)
        const request = payload as ExternalPathRequest
        return ensureResponse<ExternalDirectoryListing>(
          service.listChildren(request.rootId, request.relativePath),
          isExternalDirectoryListing,
        )
      }
      case EXTERNAL_LIBRARY_IPC_CHANNELS.openFile: {
        assertRequest(payload, isExternalPathRequest)
        const request = payload as ExternalPathRequest
        const path = service.getFilePath(request.rootId, request.relativePath)
        const openError = await dependencies.openPath(path)
        if (openError.trim() !== '') {
          throw new ExternalLibraryError('EXTERNAL_ENTRY_NOT_FILE', '无法用系统应用打开文件。')
        }
        return ensureResponse<ExternalActionResult>({ accepted: true }, isExternalActionResult)
      }
      case EXTERNAL_LIBRARY_IPC_CHANNELS.showInFolder: {
        assertRequest(payload, isExternalPathRequest)
        const request = payload as ExternalPathRequest
        dependencies.showInFolder(service.getFilePath(request.rootId, request.relativePath))
        return ensureResponse<ExternalActionResult>({ accepted: true }, isExternalActionResult)
      }
    }
    throw new Error('Unhandled external library IPC channel')
  } catch (error) {
    const response = mapExternalLibraryIpcError(error)
    logger.error('ipc.external_library_request_failed', error, {
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
    throw new ExternalLibraryIpcRequestError('请求参数无效。')
  }
}

function ensureResponse<T>(
  value: T,
  guard: (candidate: unknown) => candidate is T,
): IpcResponse<T> {
  if (!guard(value)) throw new Error('External library service returned an invalid response')
  return success(value)
}

function mapExternalLibraryIpcError(error: unknown): IpcResponse<never> {
  if (error instanceof ExternalLibraryIpcRequestError) {
    return failure(IPC_ERROR_CODES.INVALID_PAYLOAD, error.message)
  }
  if (error instanceof ExternalLibraryError) {
    return failure(IPC_ERROR_CODES.EXTERNAL_LIBRARY_ERROR, error.message)
  }
  return failure(IPC_ERROR_CODES.INTERNAL_ERROR, '无法完成外部资料操作，请稍后重试。')
}
