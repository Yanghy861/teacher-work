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
  isDraftIdRequest,
  isRegenerateDraftRequest,
  isSaveDraftRequest,
  type DraftIdRequest,
  type GenerateDraftRequest,
  type GenerateDraftResult,
  type RegenerateDraftRequest,
  type SaveDraftRequest,
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
import type { BackupSummary, RestoreSummary } from './ipc-contracts'
import {
  isExternalActionResult,
  isExternalDirectoryListing,
  isExternalLessonCopyRequest,
  isExternalPathRequest,
  isExternalRootSummary,
  isNullableExternalRootSummary,
  type ExternalActionResult,
  type ExternalDirectoryListing,
  type ExternalLessonCopyRequest,
  type ExternalPathRequest,
  type ExternalRootSummary,
} from './external-library-contracts'
import {
  isCreateSkillRequest,
  isSkillIdRequest,
  isSkillRecord,
  isUpdateSkillRequest,
  type CreateSkillRequest,
  type SkillIdRequest,
  type SkillRecord,
  type UpdateSkillRequest,
} from './skill-contracts'

export { AI_IPC_CHANNELS, BACKUP_IPC_CHANNELS, CORE_IPC_CHANNELS, DRAFT_IPC_CHANNELS, EXTERNAL_LIBRARY_IPC_CHANNELS, FILE_IPC_EVENTS, FILE_IPC_CHANNELS, IPC_CHANNELS, SEARCH_IPC_CHANNELS, SKILL_IPC_CHANNELS } from './ipc-contracts'
export type { BackupSummary, IpcChannel, RestoreSummary, WorkspaceInfo } from './ipc-contracts'
export { isBackupSummary, isRestoreSummary } from './ipc-contracts'
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
export type { DraftIdRequest, DraftNoteMetadata, DraftSourceSelection, GenerateDraftRequest, GenerateDraftResult, RegenerateDraftRequest, SaveDraftRequest } from './draft-contracts'
export type {
  ExternalActionResult,
  ExternalDirectoryListing,
  ExternalLessonCopyRequest,
  ExternalEntry,
  ExternalPathRequest,
  ExternalRootSummary,
} from './external-library-contracts'
export type { CreateSkillRequest, SkillIdRequest, SkillRecord, UpdateSkillRequest } from './skill-contracts'

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
    permanentlyDeleteFile: (request: FileIdRequest) => Promise<FileActionResult>
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
    regenerate: (request: RegenerateDraftRequest) => Promise<GenerateDraftResult>
    saveToLesson: (request: SaveDraftRequest) => Promise<NoteRecord>
    softDelete: (request: DraftIdRequest) => Promise<NoteRecord>
  }
  skills: {
    list: () => Promise<readonly SkillRecord[]>
    create: (request: CreateSkillRequest) => Promise<SkillRecord>
    update: (request: UpdateSkillRequest) => Promise<SkillRecord>
    softDelete: (request: SkillIdRequest) => Promise<SkillRecord>
  }
  externalLibrary: {
    getRoot: () => Promise<ExternalRootSummary | null>
    chooseRoot: () => Promise<ExternalRootSummary | null>
    listChildren: (request: ExternalPathRequest) => Promise<ExternalDirectoryListing>
    openFile: (request: ExternalPathRequest) => Promise<ExternalActionResult>
    showInFolder: (request: ExternalPathRequest) => Promise<ExternalActionResult>
    copyToLibrary: (request: ExternalPathRequest) => Promise<ManagedFileRecord>
    copyToLesson: (request: ExternalLessonCopyRequest) => Promise<ManagedFileRecord>
  }
  backup: {
    create: () => Promise<BackupSummary | null>
    restore: () => Promise<RestoreSummary | null>
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
  isDraftIdRequest,
  isGenerateDraftRequest,
  isGenerateDraftResult,
  isRegenerateDraftRequest,
  isSaveDraftRequest,
  isExternalActionResult,
  isExternalDirectoryListing,
  isExternalLessonCopyRequest,
  isExternalPathRequest,
  isExternalRootSummary,
  isNullableExternalRootSummary,
  isCreateSkillRequest,
  isSkillIdRequest,
  isSkillRecord,
  isUpdateSkillRequest,
}
