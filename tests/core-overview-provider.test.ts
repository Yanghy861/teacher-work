import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const providerPath = fileURLToPath(new URL('../src/renderer/core-overview-provider.tsx', import.meta.url))
const appPath = fileURLToPath(new URL('../src/renderer/App.tsx', import.meta.url))
const provider = readFileSync(providerPath, 'utf8')
const app = readFileSync(appPath, 'utf8')

describe('CoreOverviewProvider wiring', () => {
  it('mounts at the App shell level alongside AppDialogProvider', () => {
    expect(app).toContain("import { CoreOverviewProvider } from './core-overview-provider'")
    expect(app).toContain('<CoreOverviewProvider>')
    expect(app.indexOf('<AppDialogProvider>')).toBeLessThan(app.indexOf('<CoreOverviewProvider>'))
  })

  it('exposes the shared context contract pages consume', () => {
    expect(provider).toContain('export function useCoreOverview(): CoreOverviewContextValue')
    expect(provider).toContain('readonly overview: CoreOverview | null')
    expect(provider).toContain('readonly reload: () => Promise<CoreOverview | null>')
    expect(provider).toContain('readonly invalidate: () => void')
  })

  it('pulls one shared overview on mount and reuses the coalescer for every reload', () => {
    expect(provider).toContain('createOverviewReloadCoalescer(')
    expect(provider).toContain('void reload()')
    // reload 与 invalidate 共用同一合并器：变更完成后 invalidate() 也只触发单次共享重拉
    expect(provider).toContain('const invalidate = useCallback((): void => {\n    void reload()\n  }, [reload])')
  })

  it('keeps legacy page reload semantics: failures return null with the shared fallback copy', () => {
    expect(provider).toContain("toErrorMessage(loadError, '操作失败，请稍后重试。')")
    expect(provider).toContain('return lastAttemptFailedRef.current ? null : overviewRef.current')
  })

  it('subscribes files.onContentChanged to the same invalidation entry', () => {
    expect(provider).toContain('window.teacherWorkbench.files.onContentChanged(() => {\n    invalidate()\n  })')
  })

  it('stays renderer-only: no direct IPC additions beyond the existing whitelisted surface', () => {
    const calls = [...provider.matchAll(/window\.teacherWorkbench\.([a-z]+)\.([A-Za-z]+)/g)].map((m) => `${m[1]}.${m[2]}`)
    expect(new Set(calls)).toEqual(new Set(['core.getOverview', 'files.onContentChanged']))
  })
})
