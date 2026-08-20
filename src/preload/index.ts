import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS, type TeacherWorkbenchApi } from '../shared/preload-api'

const api = Object.freeze({
  app: Object.freeze({
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.getAppVersion),
  }),
}) satisfies TeacherWorkbenchApi

contextBridge.exposeInMainWorld('teacherWorkbench', api)
