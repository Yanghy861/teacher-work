import { describe, expect, it } from 'vitest'

import { IPC_CHANNELS } from '../src/shared/preload-api'
import { windowWebPreferences } from '../src/main/window-security'

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
})
