import {
  isAppVersion,
  isWorkspaceInfo,
  parseIpcResponse,
  TeacherWorkbenchError,
} from './ipc-contracts'
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
} from './core-contracts'
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
  type FileActionResult,
  type FileIdRequest,
  type ManagedFileOverview,
  type ManagedFileRecord,
} from './file-contracts'

export { CORE_IPC_CHANNELS, FILE_IPC_CHANNELS, IPC_CHANNELS } from './ipc-contracts'
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
} from './core-contracts'
export type {
  CopyFileToLessonRequest,
  CopyFileToStudentRequest,
  FileActionResult,
  FileIdRequest,
  ManagedFileOverview,
  ManagedFileRecord,
} from './file-contracts'

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
  isManagedFileOverview,
  isManagedFileRecord,
  isNullableManagedFileRecord,
  parseIpcResponse,
  TeacherWorkbenchError,
}
