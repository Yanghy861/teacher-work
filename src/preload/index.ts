import { contextBridge, ipcRenderer } from 'electron'

import {
  CORE_IPC_CHANNELS,
  FILE_IPC_CHANNELS,
  IPC_CHANNELS,
  isFileActionResult,
  isManagedFileOverview,
  isManagedFileRecord,
  isNullableManagedFileRecord,
  isAppVersion,
  isCoreOverview,
  isNodeRecord,
  isNoteRecord,
  isStudentRecord,
  isWorkspaceInfo,
  parseIpcResponse,
  TeacherWorkbenchError,
  type CreateCourseRequest,
  type CreateLessonRequest,
  type CreateNoteRequest,
  type CreatePeriodRequest,
  type CreateStudentRequest,
  type CopyFileToLessonRequest,
  type CopyFileToStudentRequest,
  type FileIdRequest,
  type MoveNodeRequest,
  type NodeIdRequest,
  type ReorderNodeRequest,
  type RenameNodeRequest,
  type IpcChannel,
  type TeacherWorkbenchApi,
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
    copyToLesson: (request: CopyFileToLessonRequest) => invoke(FILE_IPC_CHANNELS.copyToLesson, request, isManagedFileRecord),
    copyToStudent: (request: CopyFileToStudentRequest) => invoke(FILE_IPC_CHANNELS.copyToStudent, request, isManagedFileRecord),
  }),
}) satisfies TeacherWorkbenchApi

contextBridge.exposeInMainWorld('teacherWorkbench', api)
