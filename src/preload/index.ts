import { contextBridge, ipcRenderer } from 'electron'

import {
  IPC_CHANNELS,
  isAppVersion,
  isWorkspaceInfo,
  parseIpcResponse,
  TeacherWorkbenchError,
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
}) satisfies TeacherWorkbenchApi

contextBridge.exposeInMainWorld('teacherWorkbench', api)
