import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type OpenDialogOptions } from 'electron'
import { release } from 'node:os'
import { join } from 'node:path'

import { registerAppIpc } from './ipc/app-ipc'
import { registerCoreIpc } from './ipc/core-ipc'
import { registerFileIpc } from './ipc/file-ipc'
import { registerSearchIpc } from './ipc/search-ipc'
import { registerAiIpc } from './ipc/ai-ipc'
import { registerDraftIpc } from './ipc/draft-ipc'
import { registerBackupIpc } from './ipc/backup-ipc'
import { registerExternalLibraryIpc } from './ipc/external-library-ipc'
import { registerSkillIpc } from './ipc/skill-ipc'
import { registerAttendanceIpc } from './ipc/attendance-ipc'
import { CoreDataService } from './data/core-data-service'
import { ManagedFileService } from './files/managed-file-service'
import { openSearchDatabase, type SearchDatabase } from './search/search-database'
import { SearchService } from './search/search-service'
import { DocumentIndexWorker } from './parser/document-parser'
import { installMainErrorHandlers } from './logging/main-error-handlers'
import { StructuredLogger } from './logging/structured-logger'
import { applyWindowsCompatibility } from './windows-compat'
import { windowWebPreferences } from './window-security'
import { AiGateway } from './ai/ai-gateway'
import { AiSettingsService } from './ai/ai-settings-service'
import { electronSecureStorage } from './ai/secure-storage'
import { DraftService } from './draft/draft-service'
import { BackupRestoreService } from './backup/backup-service'
import { ExternalLibraryService } from './external/external-library-service'
import { SkillService } from './skills/skill-service'
import { BACKUP_DIRECTORY_NAME } from './backup/backup-service'
import { WorkspaceActivityError, WorkspaceActivityGate } from './workspace/activity-gate'
import {
  initializeDefaultWorkspace,
  type WorkspaceHandle,
} from './workspace/workspace-service'
import { FILE_IPC_EVENTS, type WorkspaceInfo } from '../shared/ipc-contracts'
import type { ManagedFileContentChanged } from '../shared/file-contracts'

let mainWindow: BrowserWindow | null = null
let workspaceHandle: WorkspaceHandle | null = null
let coreDataService: CoreDataService | null = null
let managedFileService: ManagedFileService | null = null
let searchDatabase: SearchDatabase | null = null
let searchService: SearchService | null = null
let documentIndexWorker: DocumentIndexWorker | null = null
let unregisterAppIpc: (() => void) | null = null
let unregisterCoreIpc: (() => void) | null = null
let unregisterFileIpc: (() => void) | null = null
let unregisterSearchIpc: (() => void) | null = null
let unregisterAiIpc: (() => void) | null = null
let unregisterDraftIpc: (() => void) | null = null
let unregisterBackupIpc: (() => void) | null = null
let unregisterExternalLibraryIpc: (() => void) | null = null
let unregisterSkillIpc: (() => void) | null = null
let unregisterAttendanceIpc: (() => void) | null = null
let aiSettingsService: AiSettingsService | null = null
let aiGateway: AiGateway | null = null
let draftService: DraftService | null = null
let backupRestoreService: BackupRestoreService | null = null
let externalLibraryService: ExternalLibraryService | null = null
let skillService: SkillService | null = null
const deferredIndexIds = new Set<string>()
const deferredRefreshTriggers = new Set<string>()
let servicesClosed = false
let shutdownStarted = false

const logger = new StructuredLogger()
const activityGate = new WorkspaceActivityGate()
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

function getSearchService(): SearchService {
  if (workspaceHandle === null) {
    getWorkspaceInfo()
  }
  if (workspaceHandle === null) {
    throw new Error('Workspace was not initialized')
  }
  searchDatabase ??= openSearchDatabase(workspaceHandle.paths)
  searchService ??= new SearchService(
    workspaceHandle.database.raw,
    searchDatabase.raw,
    workspaceHandle.paths,
  )
  return searchService
}

function getDocumentIndexWorker(): DocumentIndexWorker {
  if (workspaceHandle === null) {
    getWorkspaceInfo()
  }
  if (workspaceHandle === null) {
    throw new Error('Workspace was not initialized')
  }
  documentIndexWorker ??= new DocumentIndexWorker(
    workspaceHandle.database.raw,
    getSearchService(),
    workspaceHandle.paths,
  )
  return documentIndexWorker
}

function getAiSettings(): AiSettingsService {
  if (workspaceHandle === null) {
    getWorkspaceInfo()
  }
  if (workspaceHandle === null) {
    throw new Error('Workspace was not initialized')
  }
  aiSettingsService ??= new AiSettingsService(workspaceHandle.database.raw, {
    secureStorage: electronSecureStorage,
  })
  return aiSettingsService
}

function getAiGateway(): AiGateway {
  aiGateway ??= new AiGateway(getAiSettings(), { logger })
  return aiGateway
}

function getSkillService(): SkillService {
  if (workspaceHandle === null) getWorkspaceInfo()
  if (workspaceHandle === null) throw new Error('Workspace was not initialized')
  skillService ??= new SkillService(workspaceHandle.database.raw)
  return skillService
}

function getDraftService(): DraftService {
  draftService ??= new DraftService(
    getCoreData(),
    getSearchService(),
    getAiGateway(),
    getAiSettings(),
    getSkillService(),
  )
  return draftService
}

function getBackupRestoreService(): BackupRestoreService {
  if (workspaceHandle === null) getWorkspaceInfo()
  if (workspaceHandle === null) throw new Error('Workspace was not initialized')
  backupRestoreService ??= new BackupRestoreService(
    workspaceHandle,
    app.getAppPath(),
    activityGate,
    {
      pauseIndexing: async () => { await documentIndexWorker?.pause() },
      resumeIndexing: () => {
        documentIndexWorker?.resume()
        const deferred = [...deferredIndexIds]
        deferredIndexIds.clear()
        deferred.forEach(enqueueIndex)
        queueMicrotask(() => {
          const refreshes = [...deferredRefreshTriggers]
          deferredRefreshTriggers.clear()
          refreshes.forEach(refreshManagedFilesInBackground)
        })
      },
    },
  )
  return backupRestoreService
}

function getExternalLibraryService(): ExternalLibraryService {
  if (workspaceHandle === null) getWorkspaceInfo()
  if (workspaceHandle === null) throw new Error('Workspace was not initialized')
  externalLibraryService ??= new ExternalLibraryService(workspaceHandle.database.raw)
  return externalLibraryService
}

function enqueueIndex(fileId: string): void {
  if (servicesClosed || shutdownStarted) {
    return
  }
  if (activityGate.isPaused) {
    deferredIndexIds.add(fileId)
    return
  }
  void getDocumentIndexWorker().enqueueIfNeeded(fileId)?.catch((error: unknown) => {
    logger.error('document_index.file_failed', error, { fileId })
  })
}

async function rebuildSearchIndex() {
  const service = getSearchService()
  service.clearDerivedIndex()
  service.rebuildCoreSources()
  const results = await getDocumentIndexWorker().rebuildPending()
  const failedFiles = results.filter((result) => result.status === 'parse_failed').length
  return {
    queuedFiles: results.length,
    indexedFiles: results.filter((result) => result.status === 'indexed').length,
    failedFiles,
    status: service.getIndexStatusSummary(),
  }
}

function refreshManagedFilesInBackground(trigger: string): void {
  if (activityGate.isPaused) {
    deferredRefreshTriggers.add(trigger)
    return
  }
  void activityGate.run(() => getManagedFiles().refreshAll())
    .then((results) => {
      for (const result of results) {
        enqueueIndex(result.file.id)
      }
      for (const result of results) {
        if (result.contentChanged) {
          emitContentChanged({
            fileId: result.file.id,
            contentChanged: true,
            file: result.file,
          })
        }
      }
    })
    .catch((error: unknown) => {
      if (error instanceof WorkspaceActivityError) {
        deferredRefreshTriggers.add(trigger)
        return
      }
      logger.error('managed_files.refresh_failed', error, { trigger })
  })
}

function emitContentChanged(event: ManagedFileContentChanged): void {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(FILE_IPC_EVENTS.contentChanged, event)
  }
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      ...windowWebPreferences,
      preload: join(__dirname, '../preload/index.js'),
    },
  })

  window.once('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  window.on('focus', () => {
    refreshManagedFilesInBackground('window_focus')
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
  Menu.setApplicationMenu(null)
  unregisterAppIpc = registerAppIpc(
    ipcMain,
    {
      getAppVersion: () => app.getVersion(),
      getWorkspaceInfo,
    },
    logger,
  )
  unregisterCoreIpc = registerCoreIpc(ipcMain, { getCoreData, activityGate }, logger)
  unregisterAttendanceIpc = registerAttendanceIpc(
    ipcMain,
    { getAttendanceService: () => getCoreData().attendance, activityGate },
    logger,
  )
  unregisterFileIpc = registerFileIpc(
    ipcMain,
    {
      getFileService: getManagedFiles,
      activityGate,
      enqueueIndex,
      removeFromIndex: (fileId) => getSearchService().removeFileFromIndex(fileId),
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
      notifyContentChanged: emitContentChanged,
    },
    logger,
  )
  unregisterSearchIpc = registerSearchIpc(
    ipcMain,
    {
      getSearchService,
      rebuildSearchIndex,
      activityGate,
    },
    logger,
  )
  unregisterAiIpc = registerAiIpc(
    ipcMain,
    {
      getSettingsService: getAiSettings,
      getGateway: getAiGateway,
      activityGate,
    },
    logger,
  )
  unregisterDraftIpc = registerDraftIpc(
    ipcMain,
    { getDraftService, activityGate },
    logger,
  )
  unregisterSkillIpc = registerSkillIpc(
    ipcMain,
    { getSkillService, activityGate },
    logger,
  )
  unregisterBackupIpc = registerBackupIpc(
    ipcMain,
    {
      getService: getBackupRestoreService,
      confirmBackup: async () => {
        const result = mainWindow !== null && !mainWindow.isDestroyed()
          ? await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: '创建工作区备份',
            message: '请先保存并关闭正在编辑工作区资料的外部程序。',
            detail: '备份期间工作台会暂停写入、刷新和搜索索引任务。',
            buttons: ['继续备份', '取消'],
            defaultId: 0,
            cancelId: 1,
          })
          : await dialog.showMessageBox({
            type: 'warning',
            title: '创建工作区备份',
            message: '请先保存并关闭正在编辑工作区资料的外部程序。',
            detail: '备份期间工作台会暂停写入、刷新和搜索索引任务。',
            buttons: ['继续备份', '取消'],
            defaultId: 0,
            cancelId: 1,
          })
        return result.response === 0
      },
      chooseBackupDestination: async () => {
        const result = mainWindow !== null && !mainWindow.isDestroyed()
          ? await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'], title: '选择备份目录' })
          : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: '选择备份目录' })
        return result.canceled ? null : result.filePaths[0] === undefined ? null : join(result.filePaths[0], BACKUP_DIRECTORY_NAME)
      },
      chooseBackupSource: async () => {
        const result = mainWindow !== null && !mainWindow.isDestroyed()
          ? await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: '选择备份目录' })
          : await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择备份目录' })
        return result.canceled ? null : result.filePaths[0] ?? null
      },
      chooseRestoreTarget: async () => {
        const result = mainWindow !== null && !mainWindow.isDestroyed()
          ? await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'], title: '选择新的空工作区' })
          : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: '选择新的空工作区' })
        return result.canceled ? null : result.filePaths[0] ?? null
      },
    },
    logger,
  )
  unregisterExternalLibraryIpc = registerExternalLibraryIpc(
    ipcMain,
    {
      getService: getExternalLibraryService,
      getManagedFileService: getManagedFiles,
      activityGate,
      enqueueIndex,
      chooseRootPath: async () => {
        const options: OpenDialogOptions = {
          properties: ['openDirectory'],
          title: '选择外部资料目录',
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
  refreshManagedFilesInBackground('workspace_startup')
  void getDocumentIndexWorker().rebuildPending().catch((error: unknown) => {
    logger.error('document_index.rebuild_failed', error, { trigger: 'workspace_startup' })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
}).catch((error: unknown) => {
  logger.error('main.ready_failed', error)
})

app.on('before-quit', (event) => {
  if (servicesClosed) {
    return
  }
  if (shutdownStarted) {
    event.preventDefault()
    return
  }
  shutdownStarted = true
  event.preventDefault()
  servicesClosed = true
  unregisterAppIpc?.()
  unregisterCoreIpc?.()
  unregisterFileIpc?.()
  unregisterSearchIpc?.()
  unregisterAiIpc?.()
  unregisterDraftIpc?.()
  unregisterBackupIpc?.()
  unregisterExternalLibraryIpc?.()
  unregisterSkillIpc?.()
  unregisterAttendanceIpc?.()
  coreDataService = null
  managedFileService = null
  aiGateway = null
  aiSettingsService = null
  draftService = null
  externalLibraryService = null
  skillService = null
  void (async () => {
    await documentIndexWorker?.close()
    documentIndexWorker = null
    searchService = null
    searchDatabase?.close()
    searchDatabase = null
    workspaceHandle?.close()
    removeMainErrorHandlers()
    app.exit(0)
  })().catch((error: unknown) => {
    logger.error('main.shutdown_failed', error)
    app.exit(1)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
