import {
  failure,
  IPC_CHANNELS,
  IPC_ERROR_CODES,
  isAppVersion,
  isEmptyIpcRequest,
  isWorkspaceInfo,
  success,
  type IpcChannel,
  type IpcErrorCode,
  type IpcResponse,
  type WorkspaceInfo,
} from '../../shared/ipc-contracts'
import { WorkspacePathError } from '../workspace/workspace-paths'

export interface IpcMainPort {
  handle(
    channel: string,
    listener: (event: unknown, payload: unknown) => Promise<IpcResponse<unknown>>,
  ): void
  removeHandler(channel: string): void
}

export interface AppIpcDependencies {
  readonly getAppVersion: () => string
  readonly getWorkspaceInfo: () => WorkspaceInfo
}

export interface IpcLogger {
  log(level: 'info' | 'warn' | 'error', event: string, details?: Record<string, unknown>): void
  error(event: string, error: unknown, details?: Record<string, unknown>): void
}

export const APP_IPC_CHANNELS: readonly IpcChannel[] = [
  IPC_CHANNELS.getAppVersion,
  IPC_CHANNELS.getWorkspaceInfo,
]

class IpcRequestError extends Error {
  readonly code: IpcErrorCode

  constructor(code: IpcErrorCode, message: string) {
    super(message)
    this.name = 'IpcRequestError'
    this.code = code
  }
}

export function registerAppIpc(
  ipcMain: IpcMainPort,
  dependencies: AppIpcDependencies,
  logger: IpcLogger,
): () => void {
  for (const channel of APP_IPC_CHANNELS) {
    ipcMain.handle(channel, (_event, payload) =>
      dispatchAppIpc(channel, payload, dependencies, logger),
    )
  }

  return () => {
    for (const channel of APP_IPC_CHANNELS) {
      ipcMain.removeHandler(channel)
    }
  }
}

export async function dispatchAppIpc(
  channel: string,
  payload: unknown,
  dependencies: AppIpcDependencies,
  logger: IpcLogger,
): Promise<IpcResponse<unknown>> {
  if (!isKnownChannel(channel)) {
    logger.log('warn', 'ipc.unknown_channel', { channel })
    return failure(IPC_ERROR_CODES.UNKNOWN_CHANNEL, '未知的 IPC 通道。')
  }

  try {
    assertEmptyRequest(payload)

    if (channel === IPC_CHANNELS.getAppVersion) {
      const version = dependencies.getAppVersion()
      if (!isAppVersion(version)) {
        throw new Error('App version service returned an invalid value')
      }
      return success(version)
    }

    const workspaceInfo = dependencies.getWorkspaceInfo()
    if (!isWorkspaceInfo(workspaceInfo)) {
      throw new Error('Workspace service returned an invalid value')
    }
    return success(workspaceInfo)
  } catch (error) {
    const response = mapIpcError(error)
    logger.error('ipc.request_failed', error, {
      channel,
      code: response.ok ? undefined : response.error.code,
    })
    return response
  }
}

function assertEmptyRequest(payload: unknown): void {
  if (!isEmptyIpcRequest(payload)) {
    throw new IpcRequestError(
      IPC_ERROR_CODES.INVALID_PAYLOAD,
      '请求参数无效；该操作不接受文件路径、SQL 或其他额外参数。',
    )
  }
}

function mapIpcError(error: unknown): IpcResponse<never> {
  if (error instanceof IpcRequestError) {
    return failure(error.code, error.message)
  }
  if (error instanceof WorkspacePathError) {
    return failure(IPC_ERROR_CODES.WORKSPACE_UNAVAILABLE, '工作区不可用，请检查工作区设置。')
  }
  return failure(IPC_ERROR_CODES.INTERNAL_ERROR, '无法完成请求，请稍后重试。')
}

function isKnownChannel(channel: string): channel is IpcChannel {
  return APP_IPC_CHANNELS.includes(channel as IpcChannel)
}
