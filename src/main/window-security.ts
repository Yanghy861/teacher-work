export const windowWebPreferences = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
} as const

export interface WebContentsLike {
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' | 'allow' }): void
  on(event: 'will-navigate', listener: (event: { preventDefault(): void }, url: string) => void): void
}

/**
 * Defense in depth for the single-window local app: deny every window.open and
 * only let in-app navigation reach the loaded index. Anything else is dropped.
 */
export function applyWindowNavigationGuard(webContents: WebContentsLike, allowedUrls: readonly string[]): void {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  webContents.on('will-navigate', (event, url) => {
    if (!allowedUrls.includes(url)) {
      event.preventDefault()
    }
  })
}
