import { app, ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../shared/preload-api'

export function registerAppIpc(): void {
  ipcMain.handle(IPC_CHANNELS.getAppVersion, () => app.getVersion())
}
