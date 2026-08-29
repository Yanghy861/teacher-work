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
  type PublishDraftVersionRequest,
  type PublishDraftVersionResult,
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
  isConfirmLessonResult,
  isCourseProgressRecord,
  isCourseStudentLink,
  isCoreOverview,
  isCreateCourseSetupResult,
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
  type ClearCurrentLessonRequest,
  type ConfirmLessonResult,
  type ConfirmLessonTaughtRequest,
  type CoreOverview,
  type CourseIdRequest,
  type CourseLessonRequest,
  type CourseProgressRecord,
  type CourseStudentLink,
  type CourseStudentRequest,
  type CreateCourseRequest,
  type CreateCourseSetupRequest,
  type CreateCourseSetupResult,
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
  type SetCurrentLessonRequest,
  type StartPeriodRequest,
  type StudentRecord,
  type UpdateNoteRequest,
  isLessonAttendanceRecord,
  isLessonIdRequest,
  isSaveLessonAttendanceRequest,
  isUpdateLessonScheduleRequest,
  type LessonAttendanceRecord,
  type LessonIdRequest,
  type SaveLessonAttendanceRequest,
  type UpdateLessonScheduleRequest,
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
  type ManagedFileContent,
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
import {
  isQuestionBankDetail,
  isQuestionBankLessonCopyRequest,
  isQuestionBankQuestionRequest,
  isQuestionBankSearchRequest,
  isQuestionBankSearchResult,
  isQuestionBankSummary,
  type QuestionBankDetail,
  type QuestionBankLessonCopyRequest,
  type QuestionBankQuestionRequest,
  type QuestionBankSearchRequest,
  type QuestionBankSearchResult,
  type QuestionBankSummary,
} from './question-bank-contracts'

export { AI_IPC_CHANNELS, ATTENDANCE_IPC_CHANNELS, BACKUP_IPC_CHANNELS, CORE_IPC_CHANNELS, DRAFT_IPC_CHANNELS, EXTERNAL_LIBRARY_IPC_CHANNELS, FILE_IPC_EVENTS, FILE_IPC_CHANNELS, IPC_CHANNELS, QUESTION_BANK_IPC_CHANNELS, SEARCH_IPC_CHANNELS, SKILL_IPC_CHANNELS } from './ipc-contracts'
export type { BackupSummary, IpcChannel, RestoreSummary, WorkspaceInfo } from './ipc-contracts'
export { isBackupSummary, isRestoreSummary } from './ipc-contracts'
export type {
  CoreOverview,
  ClearCurrentLessonRequest,
  ConfirmLessonResult,
  ConfirmLessonTaughtRequest,
  CourseIdRequest,
  CourseLessonRequest,
  CourseProgressRecord,
  CourseStudentLink,
  CourseStudentRequest,
  CreateCourseRequest,
  CreateCourseSetupRequest,
  CreateCourseSetupResult,
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
  SetCurrentLessonRequest,
  StartPeriodRequest,
  StudentRecord,
  UpdateNoteRequest,
  LessonAttendanceRecord,
  LessonIdRequest,
  SaveLessonAttendanceRequest,
  UpdateLessonScheduleRequest,
} from './core-contracts'
export type {
  CopyFileToLessonRequest,
  CopyFileToStudentRequest,
  FileActionResult,
  FileIdRequest,
  ManagedFileContent,
  ManagedFileContentChanged,
  ManagedFileOverview,
  ManagedFileRecord,
  ManagedFileRefreshResult,
} from './file-contracts'
export { isManagedFileContent } from './file-contracts'
export type { SearchHit, SearchIndexStatusSummary, SearchQuery, SearchRebuildResult } from './search-contracts'
export type { AiCancelResult, AiConnectionTestResult, AiKeyStorageMode, AiRequestIdRequest, AiSettings, AiTextRequest, AiTextResult, UpdateAiSettingsRequest } from './ai-contracts'
export type { DraftIdRequest, DraftNoteMetadata, DraftSourceSelection, GenerateDraftRequest, GenerateDraftResult, PublishDraftVersionRequest, PublishDraftVersionResult, RegenerateDraftRequest, SaveDraftRequest } from './draft-contracts'
export { isPublishDraftVersionRequest, isPublishDraftVersionResult } from './draft-contracts'
export type {
  ExternalActionResult,
  ExternalDirectoryListing,
  ExternalLessonCopyRequest,
  ExternalEntry,
  ExternalPathRequest,
  ExternalRootSummary,
} from './external-library-contracts'
export type { CreateSkillRequest, SkillIdRequest, SkillRecord, UpdateSkillRequest } from './skill-contracts'
export type {
  QuestionBankAsset,
  QuestionBankDetail,
  QuestionBankFacetValue,
  QuestionBankLessonCopyRequest,
  QuestionBankOption,
  QuestionBankQuestionRequest,
  QuestionBankSearchItem,
  QuestionBankSearchRequest,
  QuestionBankSearchResult,
  QuestionBankSummary,
} from './question-bank-contracts'

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
    createCourseSetup: (request: CreateCourseSetupRequest) => Promise<CreateCourseSetupResult>
    createPeriod: (request: CreatePeriodRequest) => Promise<NodeRecord>
    createLesson: (request: CreateLessonRequest) => Promise<NodeRecord>
    createStudent: (request: CreateStudentRequest) => Promise<StudentRecord>
    linkStudentToCourse: (request: CourseStudentRequest) => Promise<CourseStudentLink>
    endCourseStudentLink: (request: CourseStudentRequest) => Promise<CourseStudentLink>
    reactivateCourseStudentLink: (request: CourseStudentRequest) => Promise<CourseStudentLink>
    createNote: (request: CreateNoteRequest) => Promise<NoteRecord>
    updateNote: (request: UpdateNoteRequest) => Promise<NoteRecord>
    renameNode: (request: RenameNodeRequest) => Promise<NodeRecord>
    moveNode: (request: MoveNodeRequest) => Promise<NodeRecord>
    reorderNode: (request: ReorderNodeRequest) => Promise<NodeRecord>
    softDeleteNode: (request: NodeIdRequest) => Promise<NodeRecord>
    restoreNode: (request: NodeIdRequest) => Promise<NodeRecord>
    setCurrentLesson: (request: SetCurrentLessonRequest) => Promise<CourseProgressRecord>
    clearCurrentLesson: (request: ClearCurrentLessonRequest) => Promise<CourseProgressRecord>
    startPeriod: (request: StartPeriodRequest) => Promise<CourseProgressRecord>
    confirmLessonTaught: (request: ConfirmLessonTaughtRequest) => Promise<ConfirmLessonResult>
    undoLessonTaught: (request: CourseLessonRequest) => Promise<void>
    endCourse: (request: CourseIdRequest) => Promise<CourseProgressRecord>
    reopenCourse: (request: CourseIdRequest) => Promise<CourseProgressRecord>
  }
  attendance: {
    updateSchedule: (request: UpdateLessonScheduleRequest) => Promise<LessonAttendanceRecord>
    getLesson: (request: LessonIdRequest) => Promise<LessonAttendanceRecord>
    saveLesson: (request: SaveLessonAttendanceRequest) => Promise<LessonAttendanceRecord>
  }
  files: {
    getOverview: () => Promise<ManagedFileOverview>
    readContent: (request: FileIdRequest) => Promise<ManagedFileContent>
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
    publishToLesson: (request: PublishDraftVersionRequest) => Promise<PublishDraftVersionResult>
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
  questionBank: {
    getSummary: () => Promise<QuestionBankSummary>
    chooseAndImport: () => Promise<QuestionBankSummary | null>
    search: (request: QuestionBankSearchRequest) => Promise<QuestionBankSearchResult>
    getQuestion: (request: QuestionBankQuestionRequest) => Promise<QuestionBankDetail>
    copyToLibrary: (request: QuestionBankQuestionRequest) => Promise<ManagedFileRecord>
    copyToLesson: (request: QuestionBankLessonCopyRequest) => Promise<ManagedFileRecord>
  }
  backup: {
    create: () => Promise<BackupSummary | null>
    restore: () => Promise<RestoreSummary | null>
  }
}

export {
  isAppVersion,
  isCoreOverview,
  isCreateCourseSetupResult,
  isCreateCourseRequest,
  isConfirmLessonResult,
  isCourseProgressRecord,
  isCourseStudentLink,
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
  isLessonAttendanceRecord,
  isLessonIdRequest,
  isSaveLessonAttendanceRequest,
  isUpdateLessonScheduleRequest,
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
  isQuestionBankDetail,
  isQuestionBankLessonCopyRequest,
  isQuestionBankQuestionRequest,
  isQuestionBankSearchRequest,
  isQuestionBankSearchResult,
  isQuestionBankSummary,
}
