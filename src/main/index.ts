import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

import { registerAppIpc } from './ipc/app-ipc'
import { windowWebPreferences } from './window-security'

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

  window.once('ready-to-show', () => {
    window.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.whenReady().then(() => {
  registerAppIpc()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
