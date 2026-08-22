import { contextBridge, ipcRenderer } from 'electron'

import {
  CORE_IPC_CHANNELS,
  FILE_IPC_EVENTS,
  FILE_IPC_CHANNELS,
  IPC_CHANNELS,
  SEARCH_IPC_CHANNELS,
  AI_IPC_CHANNELS,
  DRAFT_IPC_CHANNELS,
  BACKUP_IPC_CHANNELS,
  EXTERNAL_LIBRARY_IPC_CHANNELS,
  SKILL_IPC_CHANNELS,
  isFileActionResult,
  isManagedFileContentChanged,
  isManagedFileOverview,
  isManagedFileRecord,
  isNullableManagedFileRecord,
  isAppVersion,
  isCoreOverview,
  isNodeRecord,
  isNoteRecord,
  isStudentRecord,
  isWorkspaceInfo,
  isSearchHit,
  isSearchIndexStatusSummary,
  isSearchRebuildResult,
  isAiCancelResult,
  isAiConnectionTestResult,
  isAiSettings,
  isAiTextResult,
  isGenerateDraftResult,
  isSkillRecord,
  isBackupSummary,
  isRestoreSummary,
  isExternalActionResult,
  isExternalDirectoryListing,
  isNullableExternalRootSummary,
  parseIpcResponse,
  TeacherWorkbenchError,
  type CreateCourseRequest,
  type CreateLessonRequest,
  type CreateNoteRequest,
  type UpdateNoteRequest,
  type CreatePeriodRequest,
  type CreateStudentRequest,
  type CopyFileToLessonRequest,
  type CopyFileToStudentRequest,
  type FileIdRequest,
  type ManagedFileContentChanged,
  type MoveNodeRequest,
  type NodeIdRequest,
  type ReorderNodeRequest,
  type RenameNodeRequest,
  type IpcChannel,
  type TeacherWorkbenchApi,
  type SearchQuery,
  type SearchHit,
  type AiRequestIdRequest,
  type AiTextRequest,
  type UpdateAiSettingsRequest,
  type GenerateDraftRequest,
  type DraftIdRequest,
  type RegenerateDraftRequest,
  type SaveDraftRequest,
  type CreateSkillRequest,
  type SkillIdRequest,
  type UpdateSkillRequest,
  type ExternalPathRequest,
  type ExternalLessonCopyRequest,
} from '../shared/preload-api'

async function invoke<T>(
  channel: IpcChannel,
  request: object,
  isData: (data: unknown) => data is T,
): Promise<T> {
  const response = parseIpcResponse(await ipcRenderer.invoke(channel, request), isData)
  if (!response.ok) {
    throw new TeacherWorkbenchError(response.error)
  }
  return response.data
}

const api = Object.freeze({
  app: Object.freeze({
    getVersion: (): Promise<string> => invoke(IPC_CHANNELS.getAppVersion, {}, isAppVersion),
  }),
  workspace: Object.freeze({
    getInfo: () => invoke(IPC_CHANNELS.getWorkspaceInfo, {}, isWorkspaceInfo),
  }),
  core: Object.freeze({
    getOverview: () => invoke(CORE_IPC_CHANNELS.getCoreOverview, {}, isCoreOverview),
    createCourse: (request: CreateCourseRequest) => invoke(CORE_IPC_CHANNELS.createCourse, request, isNodeRecord),
    createPeriod: (request: CreatePeriodRequest) => invoke(CORE_IPC_CHANNELS.createPeriod, request, isNodeRecord),
    createLesson: (request: CreateLessonRequest) => invoke(CORE_IPC_CHANNELS.createLesson, request, isNodeRecord),
    createStudent: (request: CreateStudentRequest) => invoke(CORE_IPC_CHANNELS.createStudent, request, isStudentRecord),
    createNote: (request: CreateNoteRequest) => invoke(CORE_IPC_CHANNELS.createNote, request, isNoteRecord),
    updateNote: (request: UpdateNoteRequest) => invoke(CORE_IPC_CHANNELS.updateNote, request, isNoteRecord),
    renameNode: (request: RenameNodeRequest) => invoke(CORE_IPC_CHANNELS.renameNode, request, isNodeRecord),
    moveNode: (request: MoveNodeRequest) => invoke(CORE_IPC_CHANNELS.moveNode, request, isNodeRecord),
    reorderNode: (request: ReorderNodeRequest) => invoke(CORE_IPC_CHANNELS.reorderNode, request, isNodeRecord),
    softDeleteNode: (request: NodeIdRequest) => invoke(CORE_IPC_CHANNELS.softDeleteNode, request, isNodeRecord),
    restoreNode: (request: NodeIdRequest) => invoke(CORE_IPC_CHANNELS.restoreNode, request, isNodeRecord),
  }),
  files: Object.freeze({
    getOverview: () => invoke(FILE_IPC_CHANNELS.getManagedFileOverview, {}, isManagedFileOverview),
    importFromPicker: () => invoke(FILE_IPC_CHANNELS.importFromPicker, {}, isNullableManagedFileRecord),
    openFile: (request: FileIdRequest) => invoke(FILE_IPC_CHANNELS.openFile, request, isFileActionResult),
    showFileInFolder: (request: FileIdRequest) => invoke(FILE_IPC_CHANNELS.showFileInFolder, request, isFileActionResult),
    softDeleteFile: (request: FileIdRequest) => invoke(FILE_IPC_CHANNELS.softDeleteFile, request, isManagedFileRecord),
    restoreFile: (request: FileIdRequest) => invoke(FILE_IPC_CHANNELS.restoreFile, request, isManagedFileRecord),
    permanentlyDeleteFile: (request: FileIdRequest) => invoke(FILE_IPC_CHANNELS.permanentlyDeleteFile, request, isFileActionResult),
    copyToLesson: (request: CopyFileToLessonRequest) => invoke(FILE_IPC_CHANNELS.copyToLesson, request, isManagedFileRecord),
    copyToStudent: (request: CopyFileToStudentRequest) => invoke(FILE_IPC_CHANNELS.copyToStudent, request, isManagedFileRecord),
    onContentChanged: (listener: (event: ManagedFileContentChanged) => void): (() => void) => {
      const handler = (_event: unknown, payload: unknown): void => {
        if (isManagedFileContentChanged(payload)) {
          listener(payload)
        }
      }
      ipcRenderer.on(FILE_IPC_EVENTS.contentChanged, handler)
      return () => ipcRenderer.removeListener(FILE_IPC_EVENTS.contentChanged, handler)
    },
  }),
  search: Object.freeze({
    query: (request: SearchQuery) => invoke(SEARCH_IPC_CHANNELS.query, request, (value): value is readonly SearchHit[] =>
      Array.isArray(value) && value.every(isSearchHit),
    ),
    rebuild: () => invoke(SEARCH_IPC_CHANNELS.rebuild, {}, isSearchRebuildResult),
    getStatus: () => invoke(SEARCH_IPC_CHANNELS.getStatus, {}, isSearchIndexStatusSummary),
  }),
  ai: Object.freeze({
    getSettings: () => invoke(AI_IPC_CHANNELS.getSettings, {}, isAiSettings),
    updateSettings: (request: UpdateAiSettingsRequest) => invoke(AI_IPC_CHANNELS.updateSettings, request, isAiSettings),
    testConnection: (request: AiRequestIdRequest) => invoke(AI_IPC_CHANNELS.testConnection, request, isAiConnectionTestResult),
    requestText: (request: AiTextRequest) => invoke(AI_IPC_CHANNELS.requestText, request, isAiTextResult),
    cancel: (request: AiRequestIdRequest) => invoke(AI_IPC_CHANNELS.cancel, request, isAiCancelResult),
  }),
  drafts: Object.freeze({
    generate: (request: GenerateDraftRequest) => invoke(DRAFT_IPC_CHANNELS.generate, request, isGenerateDraftResult),
    regenerate: (request: RegenerateDraftRequest) => invoke(DRAFT_IPC_CHANNELS.regenerate, request, isGenerateDraftResult),
    saveToLesson: (request: SaveDraftRequest) => invoke(DRAFT_IPC_CHANNELS.saveToLesson, request, isNoteRecord),
    softDelete: (request: DraftIdRequest) => invoke(DRAFT_IPC_CHANNELS.softDelete, request, isNoteRecord),
  }),
  skills: Object.freeze({
    list: () => invoke(SKILL_IPC_CHANNELS.list, {}, (value): value is readonly import('../shared/preload-api').SkillRecord[] =>
      Array.isArray(value) && value.every(isSkillRecord),
    ),
    create: (request: CreateSkillRequest) => invoke(SKILL_IPC_CHANNELS.create, request, isSkillRecord),
    update: (request: UpdateSkillRequest) => invoke(SKILL_IPC_CHANNELS.update, request, isSkillRecord),
    softDelete: (request: SkillIdRequest) => invoke(SKILL_IPC_CHANNELS.softDelete, request, isSkillRecord),
  }),
  externalLibrary: Object.freeze({
    getRoot: () => invoke(EXTERNAL_LIBRARY_IPC_CHANNELS.getRoot, {}, isNullableExternalRootSummary),
    chooseRoot: () => invoke(EXTERNAL_LIBRARY_IPC_CHANNELS.chooseRoot, {}, isNullableExternalRootSummary),
    listChildren: (request: ExternalPathRequest) => invoke(EXTERNAL_LIBRARY_IPC_CHANNELS.listChildren, request, isExternalDirectoryListing),
    openFile: (request: ExternalPathRequest) => invoke(EXTERNAL_LIBRARY_IPC_CHANNELS.openFile, request, isExternalActionResult),
    showInFolder: (request: ExternalPathRequest) => invoke(EXTERNAL_LIBRARY_IPC_CHANNELS.showInFolder, request, isExternalActionResult),
    copyToLibrary: (request: ExternalPathRequest) => invoke(EXTERNAL_LIBRARY_IPC_CHANNELS.copyToLibrary, request, isManagedFileRecord),
    copyToLesson: (request: ExternalLessonCopyRequest) => invoke(EXTERNAL_LIBRARY_IPC_CHANNELS.copyToLesson, request, isManagedFileRecord),
  }),
  backup: Object.freeze({
    create: () => invoke(BACKUP_IPC_CHANNELS.create, {}, (value): value is import('../shared/ipc-contracts').BackupSummary | null =>
      value === null || isBackupSummary(value)),
    restore: () => invoke(BACKUP_IPC_CHANNELS.restore, {}, (value): value is import('../shared/ipc-contracts').RestoreSummary | null =>
      value === null || isRestoreSummary(value)),
  }),
}) satisfies TeacherWorkbenchApi

contextBridge.exposeInMainWorld('teacherWorkbench', api)
