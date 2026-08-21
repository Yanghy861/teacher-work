export const IPC_CHANNELS = {
  getAppVersion: 'app:get-version',
  getWorkspaceInfo: 'workspace:get-info',
} as const

export const CORE_IPC_CHANNELS = {
  getCoreOverview: 'core:get-overview',
  createCourse: 'core:create-course',
  createPeriod: 'core:create-period',
  createLesson: 'core:create-lesson',
  createStudent: 'core:create-student',
  createNote: 'core:create-note',
  renameNode: 'core:rename-node',
  moveNode: 'core:move-node',
  reorderNode: 'core:reorder-node',
  softDeleteNode: 'core:soft-delete-node',
  restoreNode: 'core:restore-node',
} as const

export const FILE_IPC_CHANNELS = {
  getManagedFileOverview: 'files:get-overview',
  importFromPicker: 'files:import-from-picker',
  openFile: 'files:open',
  showFileInFolder: 'files:show-in-folder',
  softDeleteFile: 'files:soft-delete',
  restoreFile: 'files:restore',
  copyToLesson: 'files:copy-to-lesson',
  copyToStudent: 'files:copy-to-student',
} as const

export const SEARCH_IPC_CHANNELS = {
  query: 'search:query',
  rebuild: 'search:rebuild',
  getStatus: 'search:get-status',
} as const

export const FILE_IPC_EVENTS = {
  contentChanged: 'files:content-changed',
} as const

export type IpcChannel =
  | (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
  | (typeof CORE_IPC_CHANNELS)[keyof typeof CORE_IPC_CHANNELS]
  | (typeof FILE_IPC_CHANNELS)[keyof typeof FILE_IPC_CHANNELS]
  | (typeof SEARCH_IPC_CHANNELS)[keyof typeof SEARCH_IPC_CHANNELS]

export const IPC_ERROR_CODES = {
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  UNKNOWN_CHANNEL: 'UNKNOWN_CHANNEL',
  WORKSPACE_UNAVAILABLE: 'WORKSPACE_UNAVAILABLE',
  CORE_DATA_ERROR: 'CORE_DATA_ERROR',
  MANAGED_FILE_ERROR: 'MANAGED_FILE_ERROR',
  SEARCH_ERROR: 'SEARCH_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
} as const

export type IpcErrorCode = (typeof IPC_ERROR_CODES)[keyof typeof IPC_ERROR_CODES]

export interface IpcError {
  readonly code: IpcErrorCode
  readonly message: string
}

export interface IpcSuccess<T> {
  readonly ok: true
  readonly data: T
}

export interface IpcFailure {
  readonly ok: false
  readonly error: IpcError
}

export type IpcResponse<T> = IpcSuccess<T> | IpcFailure

export interface EmptyIpcRequest {
  readonly [key: string]: never
}

export type GetAppVersionRequest = EmptyIpcRequest
export type GetWorkspaceInfoRequest = EmptyIpcRequest

export interface WorkspaceInfo {
  readonly workspaceId: string
  readonly schemaVersion: number
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isEmptyIpcRequest(value: unknown): value is EmptyIpcRequest {
  return isRecord(value) && Object.keys(value).length === 0
}

export function isWorkspaceInfo(value: unknown): value is WorkspaceInfo {
  return (
    isRecord(value) &&
    typeof value.workspaceId === 'string' &&
    value.workspaceId.trim().length > 0 &&
    typeof value.schemaVersion === 'number' &&
    Number.isInteger(value.schemaVersion) &&
    value.schemaVersion >= 0
  )
}

export function isAppVersion(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function success<T>(data: T): IpcSuccess<T> {
  return { ok: true, data }
}

export function failure<T = never>(code: IpcErrorCode, message: string): IpcResponse<T> {
  return { ok: false, error: { code, message } }
}

export function parseIpcResponse<T>(
  value: unknown,
  isData: (data: unknown) => data is T,
): IpcResponse<T> {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return failure(IPC_ERROR_CODES.INVALID_RESPONSE, 'IPC 响应格式无效。')
  }

  if (value.ok) {
    return isData(value.data)
      ? success(value.data)
      : failure(IPC_ERROR_CODES.INVALID_RESPONSE, 'IPC 响应数据无效。')
  }

  if (!isRecord(value.error) || !isIpcErrorCode(value.error.code) || typeof value.error.message !== 'string') {
    return failure(IPC_ERROR_CODES.INVALID_RESPONSE, 'IPC 错误响应格式无效。')
  }

  return {
    ok: false,
    error: {
      code: value.error.code,
      message: value.error.message,
    },
  }
}

export class TeacherWorkbenchError extends Error {
  readonly code: IpcErrorCode

  constructor(error: IpcError) {
    super(error.message)
    this.name = 'TeacherWorkbenchError'
    this.code = error.code
  }

  toJSON(): { name: string; code: IpcErrorCode; message: string } {
    return { name: this.name, code: this.code, message: this.message }
  }
}

function isIpcErrorCode(value: unknown): value is IpcErrorCode {
  return typeof value === 'string' && Object.values(IPC_ERROR_CODES).includes(value as IpcErrorCode)
}
