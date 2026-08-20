import { app, BrowserWindow } from 'electron'
import { release } from 'node:os'
import { join } from 'node:path'

import { registerAppIpc } from './ipc/app-ipc'
import { applyWindowsCompatibility } from './windows-compat'
import { windowWebPreferences } from './window-security'

let mainWindow: BrowserWindow | null = null

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

app.whenReady().then(() => {
  registerAppIpc()
  mainWindow = createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
