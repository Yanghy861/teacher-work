import {
  isAppVersion,
  isWorkspaceInfo,
  parseIpcResponse,
  TeacherWorkbenchError,
} from './ipc-contracts'
import {
  isAiCancelResult,
  isAiConnectionTestResult,
  isAiSettings,
  isAiTextRequest,
  isAiTextResult,
  isAiRequestIdRequest,
  isUpdateAiSettingsRequest,
  type AiCancelResult,
  type AiConnectionTestResult,
  type AiRequestIdRequest,
  type AiSettings,
  type AiTextRequest,
  type AiTextResult,
  type UpdateAiSettingsRequest,
} from './ai-contracts'
import {
  isGenerateDraftRequest,
  isGenerateDraftResult,
  type GenerateDraftRequest,
  type GenerateDraftResult,
  isDraftNoteMetadata,
} from './draft-contracts'
import {
  isSearchHit,
  isSearchIndexStatusSummary,
  isSearchRebuildResult,
  isSearchQuery,
  type SearchIndexStatusSummary,
  type SearchQuery,
  type SearchRebuildResult,
  type SearchHit,
} from './search-contracts'
import {
  isCoreOverview,
  isCreateCourseRequest,
  isCreateLessonRequest,
  isCreateNoteRequest,
  isCreatePeriodRequest,
  isCreateStudentRequest,
  isMoveNodeRequest,
  isNodeIdRequest,
  isNodeRecord,
  isNoteRecord,
  isReorderNodeRequest,
  isRenameNodeRequest,
  isStudentRecord,
  isUpdateNoteRequest,
  type CoreOverview,
  type CreateCourseRequest,
  type CreateLessonRequest,
  type CreateNoteRequest,
  type CreatePeriodRequest,
  type CreateStudentRequest,
  type MoveNodeRequest,
  type NodeIdRequest,
  type NodeRecord,
  type NoteRecord,
  type ReorderNodeRequest,
  type RenameNodeRequest,
  type StudentRecord,
  type UpdateNoteRequest,
} from './core-contracts'
import {
  isCopyFileToLessonRequest,
  isCopyFileToStudentRequest,
  isFileActionResult,
  isFileIdRequest,
  isManagedFileOverview,
  isManagedFileContentChanged,
  isManagedFileRefreshResult,
  isManagedFileRecord,
  isNullableManagedFileRecord,
  type CopyFileToLessonRequest,
  type CopyFileToStudentRequest,
  type FileActionResult,
  type FileIdRequest,
  type ManagedFileOverview,
  type ManagedFileContentChanged,
  type ManagedFileRecord,
} from './file-contracts'

export { AI_IPC_CHANNELS, CORE_IPC_CHANNELS, DRAFT_IPC_CHANNELS, FILE_IPC_EVENTS, FILE_IPC_CHANNELS, IPC_CHANNELS, SEARCH_IPC_CHANNELS } from './ipc-contracts'
export type { IpcChannel, WorkspaceInfo } from './ipc-contracts'
export type {
  CoreOverview,
  CreateCourseRequest,
  CreateLessonRequest,
  CreateNoteRequest,
  CreatePeriodRequest,
  CreateStudentRequest,
  MoveNodeRequest,
  NodeIdRequest,
  NodeRecord,
  NoteRecord,
  ReorderNodeRequest,
  RenameNodeRequest,
  StudentRecord,
  UpdateNoteRequest,
} from './core-contracts'
export type {
  CopyFileToLessonRequest,
  CopyFileToStudentRequest,
  FileActionResult,
  FileIdRequest,
  ManagedFileContentChanged,
  ManagedFileOverview,
  ManagedFileRecord,
  ManagedFileRefreshResult,
} from './file-contracts'
export type { SearchHit, SearchIndexStatusSummary, SearchQuery, SearchRebuildResult } from './search-contracts'
export type { AiCancelResult, AiConnectionTestResult, AiKeyStorageMode, AiRequestIdRequest, AiSettings, AiTextRequest, AiTextResult, UpdateAiSettingsRequest } from './ai-contracts'
export type { DraftNoteMetadata, DraftSourceSelection, GenerateDraftRequest, GenerateDraftResult } from './draft-contracts'

export interface TeacherWorkbenchApi {
  app: {
    getVersion: () => Promise<string>
  }
  workspace: {
    getInfo: () => Promise<import('./ipc-contracts').WorkspaceInfo>
  }
  core: {
    getOverview: () => Promise<CoreOverview>
    createCourse: (request: CreateCourseRequest) => Promise<NodeRecord>
    createPeriod: (request: CreatePeriodRequest) => Promise<NodeRecord>
    createLesson: (request: CreateLessonRequest) => Promise<NodeRecord>
    createStudent: (request: CreateStudentRequest) => Promise<StudentRecord>
    createNote: (request: CreateNoteRequest) => Promise<NoteRecord>
    updateNote: (request: UpdateNoteRequest) => Promise<NoteRecord>
    renameNode: (request: RenameNodeRequest) => Promise<NodeRecord>
    moveNode: (request: MoveNodeRequest) => Promise<NodeRecord>
    reorderNode: (request: ReorderNodeRequest) => Promise<NodeRecord>
    softDeleteNode: (request: NodeIdRequest) => Promise<NodeRecord>
    restoreNode: (request: NodeIdRequest) => Promise<NodeRecord>
  }
  files: {
    getOverview: () => Promise<ManagedFileOverview>
    importFromPicker: () => Promise<ManagedFileRecord | null>
    openFile: (request: FileIdRequest) => Promise<FileActionResult>
    showFileInFolder: (request: FileIdRequest) => Promise<FileActionResult>
    softDeleteFile: (request: FileIdRequest) => Promise<ManagedFileRecord>
    restoreFile: (request: FileIdRequest) => Promise<ManagedFileRecord>
    copyToLesson: (request: CopyFileToLessonRequest) => Promise<ManagedFileRecord>
    copyToStudent: (request: CopyFileToStudentRequest) => Promise<ManagedFileRecord>
    onContentChanged: (listener: (event: ManagedFileContentChanged) => void) => () => void
  }
  search: {
    query: (request: SearchQuery) => Promise<readonly SearchHit[]>
    rebuild: () => Promise<SearchRebuildResult>
    getStatus: () => Promise<SearchIndexStatusSummary>
  }
  ai: {
    getSettings: () => Promise<AiSettings>
    updateSettings: (request: UpdateAiSettingsRequest) => Promise<AiSettings>
    testConnection: (request: AiRequestIdRequest) => Promise<AiConnectionTestResult>
    requestText: (request: AiTextRequest) => Promise<AiTextResult>
    cancel: (request: AiRequestIdRequest) => Promise<AiCancelResult>
  }
  drafts: {
    generate: (request: GenerateDraftRequest) => Promise<GenerateDraftResult>
  }
}

export {
  isAppVersion,
  isCoreOverview,
  isCreateCourseRequest,
  isCreateLessonRequest,
  isCreateNoteRequest,
  isCreatePeriodRequest,
  isCreateStudentRequest,
  isMoveNodeRequest,
  isNodeIdRequest,
  isNodeRecord,
  isNoteRecord,
  isReorderNodeRequest,
  isRenameNodeRequest,
  isStudentRecord,
  isWorkspaceInfo,
  isCopyFileToLessonRequest,
  isCopyFileToStudentRequest,
  isFileActionResult,
  isFileIdRequest,
  isManagedFileContentChanged,
  isManagedFileOverview,
  isManagedFileRefreshResult,
  isManagedFileRecord,
  isNullableManagedFileRecord,
  parseIpcResponse,
  TeacherWorkbenchError,
  isSearchHit,
  isSearchIndexStatusSummary,
  isSearchRebuildResult,
  isSearchQuery,
  isAiCancelResult,
  isAiConnectionTestResult,
  isAiSettings,
  isAiTextRequest,
  isAiTextResult,
  isAiRequestIdRequest,
  isUpdateAiSettingsRequest,
  isUpdateNoteRequest,
  isDraftNoteMetadata,
  isGenerateDraftRequest,
  isGenerateDraftResult,
}
