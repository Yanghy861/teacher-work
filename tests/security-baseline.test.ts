import { describe, expect, it } from 'vitest'

import { IPC_CHANNELS } from '../src/shared/preload-api'
import { applyWindowNavigationGuard, type WebContentsLike, windowWebPreferences } from '../src/main/window-security'

describe('desktop security baseline', () => {
  it('keeps the renderer isolated from Node integration', () => {
    expect(windowWebPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    })
  })

  it('exposes only named, narrow IPC channels', () => {
    expect(Object.keys(IPC_CHANNELS)).toEqual(['getAppVersion', 'getWorkspaceInfo'])
    expect(IPC_CHANNELS.getAppVersion).toBe('app:get-version')
    expect(IPC_CHANNELS.getWorkspaceInfo).toBe('workspace:get-info')
  })

  it('denies window.open and blocks navigation away from the app index', () => {
    const openResults: Array<{ action: string }> = []
    const navigationEvents: Array<{ url: string; prevented: boolean }> = []
    const webContents: WebContentsLike = {
      setWindowOpenHandler: (handler) => {
        openResults.push(handler({ url: 'https://evil.example.com' }))
        openResults.push(handler({ url: 'file:///D:/teacher_work/out/renderer/index.html' }))
      },
      on: (_event, listener) => {
        for (const url of ['https://evil.example.com', 'file:///D:/teacher_work/out/renderer/index.html']) {
          let prevented = false
          listener({ preventDefault: () => { prevented = true } }, url)
          navigationEvents.push({ url, prevented })
        }
      },
    }

    applyWindowNavigationGuard(webContents, ['file:///D:/teacher_work/out/renderer/index.html'])

    expect(openResults).toEqual([{ action: 'deny' }, { action: 'deny' }])
    expect(navigationEvents.find((event) => event.url === 'https://evil.example.com')?.prevented).toBe(true)
    expect(navigationEvents.find((event) => event.url === 'file:///D:/teacher_work/out/renderer/index.html')?.prevented).toBe(false)
  })
})
