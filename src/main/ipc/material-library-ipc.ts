import {
  failure,
  IPC_ERROR_CODES,
  MATERIAL_LIBRARY_IPC_CHANNELS,
  success,
  type IpcChannel,
  type IpcResponse,
} from '../../shared/ipc-contracts'
import {
  isCopyExternalToMaterialRequest,
  isCreateMaterialFolderRequest,
  isMaterialFolder,
  isMaterialFolderIdRequest,
  isMaterialFolderItem,
  isMaterialLibraryOverview,
  isMoveMaterialRequest,
  isRenameMaterialFolderRequest,
  isReorderMaterialFolderRequest,
  isSaveFileAsMaterialRequest,
  type CopyExternalToMaterialRequest,
  type CreateMaterialFolderRequest,
  type MaterialFolderIdRequest,
  type MoveMaterialRequest,
  type RenameMaterialFolderRequest,
  type ReorderMaterialFolderRequest,
  type SaveFileAsMaterialRequest,
} from '../../shared/material-library-contracts'
import { ExternalLibraryError, ExternalLibraryService } from '../external/external-library-service'
import { MaterialLibraryError, MaterialLibraryService } from '../files/material-library-service'
import { ManagedFileError } from '../files/managed-file-service'
import type { IpcLogger, IpcMainPort } from './app-ipc'
import type { WorkspaceActivityGate } from '../workspace/activity-gate'
import { WorkspaceActivityError } from '../workspace/activity-gate'
import { isEmptyIpcRequest } from '../../shared/ipc-contracts'
import { isManagedFileRecord } from '../../shared/file-contracts'

export interface MaterialLibraryIpcDependencies {
  readonly getService: () => MaterialLibraryService
  readonly getExternalService: () => ExternalLibraryService
  readonly activityGate?: WorkspaceActivityGate
}

export const MATERIAL_LIBRARY_CHANNELS: readonly IpcChannel[] = Object.values(MATERIAL_LIBRARY_IPC_CHANNELS)

class RequestError extends Error {}

export function registerMaterialLibraryIpc(
  ipcMain: IpcMainPort,
  dependencies: MaterialLibraryIpcDependencies,
  logger: IpcLogger,
): () => void {
  for (const channel of MATERIAL_LIBRARY_CHANNELS) {
    ipcMain.handle(channel, (_event, payload) => {
      const dispatch = () => dispatchMaterialLibraryIpc(channel, payload, dependencies, logger)
      return dependencies.activityGate === undefined ? dispatch() : dependencies.activityGate.run(dispatch).catch((error: unknown) => {
        if (error instanceof WorkspaceActivityError) return failure(IPC_ERROR_CODES.WORKSPACE_BUSY, error.message)
        throw error
      })
    })
  }
  return () => MATERIAL_LIBRARY_CHANNELS.forEach((channel) => ipcMain.removeHandler(channel))
}

export async function dispatchMaterialLibraryIpc(channel: string, payload: unknown, dependencies: MaterialLibraryIpcDependencies, logger: IpcLogger): Promise<IpcResponse<unknown>> {
  if (!MATERIAL_LIBRARY_CHANNELS.includes(channel as IpcChannel)) return failure(IPC_ERROR_CODES.UNKNOWN_CHANNEL, '未知的素材库 IPC 通道。')
  try {
    const service = dependencies.getService()
    switch (channel) {
      case MATERIAL_LIBRARY_IPC_CHANNELS.getOverview:
        assert(payload, isEmptyIpcRequest)
        return ensure(service.getOverview(), isMaterialLibraryOverview)
      case MATERIAL_LIBRARY_IPC_CHANNELS.createFolder:
        assert(payload, isCreateMaterialFolderRequest)
        return ensure(service.createFolder(payload as CreateMaterialFolderRequest), isMaterialFolder)
      case MATERIAL_LIBRARY_IPC_CHANNELS.renameFolder:
        assert(payload, isRenameMaterialFolderRequest)
        return ensure(service.renameFolder((payload as RenameMaterialFolderRequest).folderId, (payload as RenameMaterialFolderRequest).name), isMaterialFolder)
      case MATERIAL_LIBRARY_IPC_CHANNELS.deleteFolder:
        assert(payload, isMaterialFolderIdRequest)
        service.deleteFolder((payload as MaterialFolderIdRequest).folderId)
        return success(null)
      case MATERIAL_LIBRARY_IPC_CHANNELS.reorderFolder:
        assert(payload, isReorderMaterialFolderRequest)
        return ensure(service.reorderFolder((payload as ReorderMaterialFolderRequest).folderId, (payload as ReorderMaterialFolderRequest).sortOrder), isMaterialFolder)
      case MATERIAL_LIBRARY_IPC_CHANNELS.moveFile:
        assert(payload, isMoveMaterialRequest)
        return ensure(service.moveFile((payload as MoveMaterialRequest).fileId, (payload as MoveMaterialRequest).folderId), isMaterialFolderItem)
      case MATERIAL_LIBRARY_IPC_CHANNELS.saveExternal: {
        assert(payload, isCopyExternalToMaterialRequest)
        const request = payload as CopyExternalToMaterialRequest
        const sourcePath = dependencies.getExternalService().getFilePath(request.rootId, request.relativePath)
        return ensure(service.importExternalFile(sourcePath, request.folderId), isManagedFileRecord)
      }
      case MATERIAL_LIBRARY_IPC_CHANNELS.saveFileAsMaterial: {
        assert(payload, isSaveFileAsMaterialRequest)
        const request = payload as SaveFileAsMaterialRequest
        return ensure(service.saveFileAsMaterial(request.fileId, request.folderId), isManagedFileRecord)
      }
    }
    throw new Error('Unhandled material library channel')
  } catch (error) {
    const response = mapError(error)
    logger.error('ipc.material_library_request_failed', error, { channel, code: response.ok ? undefined : response.error.code })
    return response
  }
}

function assert<T>(value: unknown, guard: (value: unknown) => value is T): asserts value is T { if (!guard(value)) throw new RequestError('请求参数无效。') }
function ensure<T>(value: T, guard: (value: unknown) => value is T): IpcResponse<T> { if (!guard(value)) throw new Error('Material library service returned an invalid response'); return success(value) }
function mapError(error: unknown): IpcResponse<never> {
  if (error instanceof RequestError) return failure(IPC_ERROR_CODES.INVALID_PAYLOAD, error.message)
  if (error instanceof MaterialLibraryError) return failure(IPC_ERROR_CODES.MATERIAL_LIBRARY_ERROR, error.message)
  if (error instanceof ExternalLibraryError) return failure(IPC_ERROR_CODES.EXTERNAL_LIBRARY_ERROR, error.message)
  if (error instanceof ManagedFileError) return failure(IPC_ERROR_CODES.MANAGED_FILE_ERROR, error.message)
  return failure(IPC_ERROR_CODES.INTERNAL_ERROR, '无法完成素材库操作，请稍后重试。')
}
