import {
  isAppVersion,
  isWorkspaceInfo,
  parseIpcResponse,
  TeacherWorkbenchError,
} from './ipc-contracts'

export { IPC_CHANNELS } from './ipc-contracts'
export type { IpcChannel, WorkspaceInfo } from './ipc-contracts'

export interface TeacherWorkbenchApi {
  app: {
    getVersion: () => Promise<string>
  }
  workspace: {
    getInfo: () => Promise<import('./ipc-contracts').WorkspaceInfo>
  }
}

export { isAppVersion, isWorkspaceInfo, parseIpcResponse, TeacherWorkbenchError }
