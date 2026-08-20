import {
  failure,
  FILE_IPC_CHANNELS,
  IPC_ERROR_CODES,
  isEmptyIpcRequest,
  success,
  type IpcChannel,
  type IpcResponse,
} from '../../shared/ipc-contracts'
import {
  isCopyFileToLessonRequest,
  isCopyFileToStudentRequest,
  isFileActionResult,
  isFileIdRequest,
  isManagedFileOverview,
  isManagedFileRecord,
  isNullableManagedFileRecord,
  type CopyFileToLessonRequest,
  type CopyFileToStudentRequest,
  type FileIdRequest,
} from '../../shared/file-contracts'
import { ManagedFileError, ManagedFileService } from '../files/managed-file-service'
import type { IpcLogger, IpcMainPort } from './app-ipc'

export interface FileIpcDependencies {
  readonly getFileService: () => ManagedFileService
  readonly chooseSourcePath: () => Promise<string | null>
  readonly openPath: (path: string) => Promise<string>
  readonly showInFolder: (path: string) => void
}

export const FILE_CHANNELS: readonly IpcChannel[] = Object.values(FILE_IPC_CHANNELS)

class FileIpcRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileIpcRequestError'
  }
}

export function registerFileIpc(
  ipcMain: IpcMainPort,
  dependencies: FileIpcDependencies,
  logger: IpcLogger,
): () => void {
  for (const channel of FILE_CHANNELS) {
    ipcMain.handle(channel, (_event, payload) =>
      dispatchFileIpc(channel, payload, dependencies, logger),
    )
  }

  return () => {
    for (const channel of FILE_CHANNELS) {
      ipcMain.removeHandler(channel)
    }
  }
}

export async function dispatchFileIpc(
  channel: string,
  payload: unknown,
  dependencies: FileIpcDependencies,
  logger: IpcLogger,
): Promise<IpcResponse<unknown>> {
  if (!isKnownFileChannel(channel)) {
    logger.log('warn', 'ipc.unknown_file_channel', { channel })
    return failure(IPC_ERROR_CODES.UNKNOWN_CHANNEL, '未知的 IPC 通道。')
  }

  try {
    const fileService = dependencies.getFileService()
    switch (channel) {
      case FILE_IPC_CHANNELS.getManagedFileOverview:
        assertRequest(payload, isEmptyIpcRequest)
        return ensureResponse(fileService.getOverview(), isManagedFileOverview)
      case FILE_IPC_CHANNELS.importFromPicker: {
        assertRequest(payload, isEmptyIpcRequest)
        const sourcePath = await dependencies.chooseSourcePath()
        const imported = sourcePath === null ? null : fileService.importFile(sourcePath)
        return ensureResponse(imported, isNullableManagedFileRecord)
      }
      case FILE_IPC_CHANNELS.openFile: {
        assertRequest(payload, isFileIdRequest)
        const contentPath = fileService.openFile((payload as FileIdRequest).fileId)
        const openError = await dependencies.openPath(contentPath)
        if (openError.trim() !== '') {
          throw new ManagedFileError('FILE_OPEN_FAILED', '无法用系统应用打开文件。')
        }
        return ensureResponse({ accepted: true }, isFileActionResult)
      }
      case FILE_IPC_CHANNELS.showFileInFolder: {
        assertRequest(payload, isFileIdRequest)
        const contentPath = fileService.showFileInFolder((payload as FileIdRequest).fileId)
        dependencies.showInFolder(contentPath)
        return ensureResponse({ accepted: true }, isFileActionResult)
      }
      case FILE_IPC_CHANNELS.softDeleteFile:
        assertRequest(payload, isFileIdRequest)
        return ensureResponse(
          fileService.softDeleteFile((payload as FileIdRequest).fileId),
          isManagedFileRecord,
        )
      case FILE_IPC_CHANNELS.restoreFile:
        assertRequest(payload, isFileIdRequest)
        return ensureResponse(
          fileService.restoreFile((payload as FileIdRequest).fileId),
          isManagedFileRecord,
        )
      case FILE_IPC_CHANNELS.copyToLesson:
        assertRequest(payload, isCopyFileToLessonRequest)
        return ensureResponse(
          fileService.copyToLesson(
            (payload as CopyFileToLessonRequest).fileId,
            (payload as CopyFileToLessonRequest).lessonId,
          ),
          isManagedFileRecord,
        )
      case FILE_IPC_CHANNELS.copyToStudent:
        assertRequest(payload, isCopyFileToStudentRequest)
        return ensureResponse(
          fileService.copyToStudent(
            (payload as CopyFileToStudentRequest).fileId,
            (payload as CopyFileToStudentRequest).studentId,
          ),
          isManagedFileRecord,
        )
    }
    throw new Error('Unhandled file IPC channel')
  } catch (error) {
    const response = mapFileIpcError(error)
    logger.error('ipc.file_request_failed', error, {
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
    throw new FileIpcRequestError('请求参数无效。')
  }
}

function ensureResponse<T>(value: T, guard: (candidate: unknown) => candidate is T): IpcResponse<T> {
  if (!guard(value)) {
    throw new Error('Managed file service returned an invalid response')
  }
  return success(value)
}

function mapFileIpcError(error: unknown): IpcResponse<never> {
  if (error instanceof FileIpcRequestError) {
    return failure(IPC_ERROR_CODES.INVALID_PAYLOAD, error.message)
  }
  if (error instanceof ManagedFileError) {
    return failure(IPC_ERROR_CODES.MANAGED_FILE_ERROR, error.message)
  }
  return failure(IPC_ERROR_CODES.INTERNAL_ERROR, '无法完成文件操作，请稍后重试。')
}

function isKnownFileChannel(channel: string): channel is IpcChannel {
  return FILE_CHANNELS.includes(channel as IpcChannel)
}
