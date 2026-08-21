import {
  BACKUP_IPC_CHANNELS,
  failure,
  IPC_ERROR_CODES,
  isBackupSummary,
  isEmptyIpcRequest,
  isRestoreSummary,
  success,
  type BackupSummary,
  type IpcChannel,
  type IpcResponse,
  type RestoreSummary,
} from '../../shared/ipc-contracts'
import { BackupRestoreError, type BackupRestoreService } from '../backup/backup-service'
import type { IpcLogger, IpcMainPort } from './app-ipc'

export interface BackupIpcDependencies {
  readonly getService: () => BackupRestoreService
  readonly chooseBackupDestination: () => Promise<string | null>
  readonly chooseBackupSource: () => Promise<string | null>
  readonly chooseRestoreTarget: () => Promise<string | null>
}

export const BACKUP_CHANNELS: readonly IpcChannel[] = Object.values(BACKUP_IPC_CHANNELS)

export function registerBackupIpc(
  ipcMain: IpcMainPort,
  dependencies: BackupIpcDependencies,
  logger: IpcLogger,
): () => void {
  for (const channel of BACKUP_CHANNELS) {
    ipcMain.handle(channel, (_event, payload) => dispatchBackupIpc(channel, payload, dependencies, logger))
  }
  return () => {
    for (const channel of BACKUP_CHANNELS) ipcMain.removeHandler(channel)
  }
}

export async function dispatchBackupIpc(
  channel: string,
  payload: unknown,
  dependencies: BackupIpcDependencies,
  logger: IpcLogger,
): Promise<IpcResponse<unknown>> {
  if (!BACKUP_CHANNELS.includes(channel as IpcChannel)) {
    return failure(IPC_ERROR_CODES.UNKNOWN_CHANNEL, '未知的 IPC 通道。')
  }
  try {
    if (!isEmptyIpcRequest(payload)) {
      return failure(IPC_ERROR_CODES.INVALID_PAYLOAD, '请求参数无效。')
    }
    if (channel === BACKUP_IPC_CHANNELS.create) {
      const destination = await dependencies.chooseBackupDestination()
      if (destination === null) return success(null)
      const result = await dependencies.getService().createBackup(destination)
      const summary: BackupSummary = {
        backupPath: result.backupPath,
        fileCount: result.manifest.fileCount,
        totalFileSize: result.manifest.totalFileSize,
        createdAt: result.manifest.createdAt,
      }
      if (!isBackupSummary(summary)) throw new Error('Backup service returned invalid summary')
      return success(summary)
    }
    const source = await dependencies.chooseBackupSource()
    const target = await dependencies.chooseRestoreTarget()
    if (source === null || target === null) return success(null)
    const result = await dependencies.getService().restoreBackup(source, target)
    const summary: RestoreSummary = {
      workspacePath: result.workspacePath,
      fileCount: result.manifest.fileCount,
      indexedFiles: result.indexedFiles,
      failedFiles: result.failedFiles,
    }
    if (!isRestoreSummary(summary)) throw new Error('Restore service returned invalid summary')
    return success(summary)
  } catch (error) {
    const response = error instanceof BackupRestoreError
      ? failure(IPC_ERROR_CODES.BACKUP_ERROR, error.message)
      : failure(IPC_ERROR_CODES.INTERNAL_ERROR, '无法完成备份或恢复，请稍后重试。')
    logger.error('ipc.backup_request_failed', error, { channel, code: IPC_ERROR_CODES.BACKUP_ERROR })
    return response
  }
}
