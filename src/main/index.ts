import { app, BrowserWindow, ipcMain } from 'electron'
import { release } from 'node:os'
import { join } from 'node:path'

import { registerAppIpc } from './ipc/app-ipc'
import { installMainErrorHandlers } from './logging/main-error-handlers'
import { StructuredLogger } from './logging/structured-logger'
import { applyWindowsCompatibility } from './windows-compat'
import { windowWebPreferences } from './window-security'
import {
  initializeDefaultWorkspace,
  type WorkspaceHandle,
} from './workspace/workspace-service'
import type { WorkspaceInfo } from '../shared/ipc-contracts'

let mainWindow: BrowserWindow | null = null
let workspaceHandle: WorkspaceHandle | null = null
let unregisterAppIpc: (() => void) | null = null
let servicesClosed = false

const logger = new StructuredLogger()
const removeMainErrorHandlers = installMainErrorHandlers(logger)

function getWorkspaceInfo(): WorkspaceInfo {
  if (workspaceHandle === null) {
    workspaceHandle = initializeDefaultWorkspace(app.getPath('appData'), app.getAppPath())
  }
  return workspaceHandle.identity
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      ...windowWebPreferences,
      preload: join(__dirname, '../preload/index.js'),
    },
  })

  window.webContents.once('did-finish-load', () => {
    if (!window.isDestroyed()) {
      window.show()
    }
  })

  window.once('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

applyWindowsCompatibility(app.commandLine, process.platform, release())

void app.whenReady().then(() => {
  unregisterAppIpc = registerAppIpc(
    ipcMain,
    {
      getAppVersion: () => app.getVersion(),
      getWorkspaceInfo,
    },
    logger,
  )
  mainWindow = createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
}).catch((error: unknown) => {
  logger.error('main.ready_failed', error)
})

app.on('before-quit', () => {
  if (servicesClosed) {
    return
  }
  servicesClosed = true
  unregisterAppIpc?.()
  workspaceHandle?.close()
  removeMainErrorHandlers()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
