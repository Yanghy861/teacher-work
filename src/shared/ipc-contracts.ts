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
  linkStudentToCourse: 'core:link-student-to-course',
  endCourseStudentLink: 'core:end-course-student-link',
  reactivateCourseStudentLink: 'core:reactivate-course-student-link',
  createNote: 'core:create-note',
  updateNote: 'core:update-note',
  renameNode: 'core:rename-node',
  moveNode: 'core:move-node',
  reorderNode: 'core:reorder-node',
  softDeleteNode: 'core:soft-delete-node',
  restoreNode: 'core:restore-node',
  setCurrentLesson: 'core:set-current-lesson',
  clearCurrentLesson: 'core:clear-current-lesson',
  startPeriod: 'core:start-period',
  confirmLessonTaught: 'core:confirm-lesson-taught',
  undoLessonTaught: 'core:undo-lesson-taught',
  endCourse: 'core:end-course',
  reopenCourse: 'core:reopen-course',
} as const

export const ATTENDANCE_IPC_CHANNELS = {
  updateSchedule: 'attendance:update-schedule',
  getLesson: 'attendance:get-lesson',
  saveLesson: 'attendance:save-lesson',
} as const

export const FILE_IPC_CHANNELS = {
  getManagedFileOverview: 'files:get-overview',
  importFromPicker: 'files:import-from-picker',
  openFile: 'files:open',
  showFileInFolder: 'files:show-in-folder',
  softDeleteFile: 'files:soft-delete',
  restoreFile: 'files:restore',
  permanentlyDeleteFile: 'files:permanent-delete',
  copyToLesson: 'files:copy-to-lesson',
  copyToStudent: 'files:copy-to-student',
} as const

export const SEARCH_IPC_CHANNELS = {
  query: 'search:query',
  rebuild: 'search:rebuild',
  getStatus: 'search:get-status',
} as const

export const AI_IPC_CHANNELS = {
  getSettings: 'ai:get-settings',
  updateSettings: 'ai:update-settings',
  testConnection: 'ai:test-connection',
  requestText: 'ai:request-text',
  cancel: 'ai:cancel',
} as const

export const DRAFT_IPC_CHANNELS = {
  generate: 'draft:generate',
  regenerate: 'draft:regenerate',
  saveToLesson: 'draft:save-to-lesson',
  softDelete: 'draft:soft-delete',
} as const

export const SKILL_IPC_CHANNELS = {
  list: 'skills:list',
  create: 'skills:create',
  update: 'skills:update',
  softDelete: 'skills:soft-delete',
} as const

export const BACKUP_IPC_CHANNELS = {
  create: 'backup:create',
  restore: 'backup:restore',
} as const

export const EXTERNAL_LIBRARY_IPC_CHANNELS = {
  getRoot: 'external-library:get-root',
  chooseRoot: 'external-library:choose-root',
  listChildren: 'external-library:list-children',
  openFile: 'external-library:open-file',
  showInFolder: 'external-library:show-in-folder',
  copyToLibrary: 'external-library:copy-to-library',
  copyToLesson: 'external-library:copy-to-lesson',
} as const

export const FILE_IPC_EVENTS = {
  contentChanged: 'files:content-changed',
} as const

export type IpcChannel =
  | (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
  | (typeof CORE_IPC_CHANNELS)[keyof typeof CORE_IPC_CHANNELS]
  | (typeof ATTENDANCE_IPC_CHANNELS)[keyof typeof ATTENDANCE_IPC_CHANNELS]
  | (typeof FILE_IPC_CHANNELS)[keyof typeof FILE_IPC_CHANNELS]
  | (typeof SEARCH_IPC_CHANNELS)[keyof typeof SEARCH_IPC_CHANNELS]
  | (typeof AI_IPC_CHANNELS)[keyof typeof AI_IPC_CHANNELS]
  | (typeof DRAFT_IPC_CHANNELS)[keyof typeof DRAFT_IPC_CHANNELS]
  | (typeof SKILL_IPC_CHANNELS)[keyof typeof SKILL_IPC_CHANNELS]
  | (typeof BACKUP_IPC_CHANNELS)[keyof typeof BACKUP_IPC_CHANNELS]
  | (typeof EXTERNAL_LIBRARY_IPC_CHANNELS)[keyof typeof EXTERNAL_LIBRARY_IPC_CHANNELS]

export const IPC_ERROR_CODES = {
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  UNKNOWN_CHANNEL: 'UNKNOWN_CHANNEL',
  WORKSPACE_UNAVAILABLE: 'WORKSPACE_UNAVAILABLE',
  CORE_DATA_ERROR: 'CORE_DATA_ERROR',
  ATTENDANCE_ERROR: 'ATTENDANCE_ERROR',
  MANAGED_FILE_ERROR: 'MANAGED_FILE_ERROR',
  SEARCH_ERROR: 'SEARCH_ERROR',
  AI_ERROR: 'AI_ERROR',
  DRAFT_ERROR: 'DRAFT_ERROR',
  SKILL_ERROR: 'SKILL_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  BACKUP_ERROR: 'BACKUP_ERROR',
  WORKSPACE_BUSY: 'WORKSPACE_BUSY',
  EXTERNAL_LIBRARY_ERROR: 'EXTERNAL_LIBRARY_ERROR',
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

export interface BackupSummary {
  readonly backupPath: string
  readonly fileCount: number
  readonly totalFileSize: number
  readonly createdAt: string
}

export interface RestoreSummary {
  readonly workspacePath: string
  readonly fileCount: number
  readonly indexedFiles: number
  readonly failedFiles: number
}

export function isBackupSummary(value: unknown): value is BackupSummary {
  return isRecord(value) && typeof value.backupPath === 'string' && typeof value.fileCount === 'number' &&
    typeof value.totalFileSize === 'number' && typeof value.createdAt === 'string'
}

export function isRestoreSummary(value: unknown): value is RestoreSummary {
  return isRecord(value) && typeof value.workspacePath === 'string' && typeof value.fileCount === 'number' &&
    typeof value.indexedFiles === 'number' && typeof value.failedFiles === 'number'
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
