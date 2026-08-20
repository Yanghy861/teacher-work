import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { release } from 'node:os'
import { join } from 'node:path'

import { registerAppIpc } from './ipc/app-ipc'
import { registerCoreIpc } from './ipc/core-ipc'
import { registerFileIpc } from './ipc/file-ipc'
import { CoreDataService } from './data/core-data-service'
import { ManagedFileService } from './files/managed-file-service'
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
let coreDataService: CoreDataService | null = null
let managedFileService: ManagedFileService | null = null
let unregisterAppIpc: (() => void) | null = null
let unregisterCoreIpc: (() => void) | null = null
let unregisterFileIpc: (() => void) | null = null
let servicesClosed = false

const logger = new StructuredLogger()
const removeMainErrorHandlers = installMainErrorHandlers(logger)

function getWorkspaceInfo(): WorkspaceInfo {
  if (workspaceHandle === null) {
    const smokeAppDataPath = process.env.TEACHER_WORKBENCH_L01_SMOKE_APP_DATA?.trim()
    workspaceHandle = initializeDefaultWorkspace(
      smokeAppDataPath || app.getPath('appData'),
      app.getAppPath(),
    )
  }
  return workspaceHandle.identity
}

function getCoreData(): CoreDataService {
  if (workspaceHandle === null) {
    getWorkspaceInfo()
  }
  if (workspaceHandle === null) {
    throw new Error('Workspace was not initialized')
  }
  coreDataService ??= new CoreDataService(workspaceHandle.database.raw)
  return coreDataService
}

function getManagedFiles(): ManagedFileService {
  if (workspaceHandle === null) {
    getWorkspaceInfo()
  }
  if (workspaceHandle === null) {
    throw new Error('Workspace was not initialized')
  }
  managedFileService ??= new ManagedFileService(workspaceHandle.database.raw, workspaceHandle.paths)
  return managedFileService
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
  unregisterCoreIpc = registerCoreIpc(ipcMain, { getCoreData }, logger)
  unregisterFileIpc = registerFileIpc(
    ipcMain,
    {
      getFileService: getManagedFiles,
      chooseSourcePath: async () => {
        const options: OpenDialogOptions = {
          properties: ['openFile'],
          title: '导入资料',
        }
        const result = mainWindow !== null && !mainWindow.isDestroyed()
          ? await dialog.showOpenDialog(mainWindow, options)
          : await dialog.showOpenDialog(options)
        return result.canceled ? null : result.filePaths[0] ?? null
      },
      openPath: (path) => shell.openPath(path),
      showInFolder: (path) => shell.showItemInFolder(path),
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
  unregisterCoreIpc?.()
  unregisterFileIpc?.()
  coreDataService = null
  managedFileService = null
  workspaceHandle?.close()
  removeMainErrorHandlers()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
