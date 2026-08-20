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

export { CORE_IPC_CHANNELS, IPC_CHANNELS } from './ipc-contracts'
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
  parseIpcResponse,
  TeacherWorkbenchError,
}
