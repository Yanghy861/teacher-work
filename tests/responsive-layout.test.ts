import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(
  fileURLToPath(new URL('../src/renderer/styles.css', import.meta.url)),
  'utf8',
)
const appSource = readFileSync(
  fileURLToPath(new URL('../src/renderer/App.tsx', import.meta.url)),
  'utf8',
)

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = [...stylesheet.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))]
  if (matches.length === 0) throw new Error(`Missing CSS rule: ${selector}`)
  return matches.map((match) => match[1]).join('\n')
}

describe('responsive workspace layout', () => {
  it('uses a compact desktop shell instead of a fixed presentation layout', () => {
    expect(declarations('.sidebar')).toContain('width: 104px')
    expect(declarations('.sidebar')).toContain('flex: 0 0 104px')
    expect(declarations('.nav-item')).toContain('flex-direction: column')
    expect(declarations('.nav-icon')).toContain('width: 24px')
    expect(declarations('.content-area')).toContain('padding: 10px 12px 12px')
    expect(appSource).not.toContain('className="content-header"')
    expect(appSource).not.toContain('教师工作台 V1.1')
    expect(appSource).not.toContain('schema v')
    expect(appSource).not.toContain('Electron {appVersion}')
  })

  it('lets every primary workspace use the available window width', () => {
    expect(declarations('.content-area')).toContain('display: flex')
    expect(declarations('.content-area')).toContain('flex-direction: column')
    for (const selector of [
      '.course-dashboard',
      '.search-panel',
      '.settings-panel',
      '.draft-panel',
      '.lesson-prep-panel',
      '.material-picker-panel',
      '.draft-inbox-panel',
      '.external-library-panel',
    ]) {
      expect(declarations(selector), selector).toContain('width: 100%')
      expect(declarations(selector), selector).not.toContain('max-width')
    }
  })

  it('keeps the resource tree bounded while the content pane fills the rest', () => {
    expect(declarations('.external-library-layout'))
      .toContain('grid-template-columns: minmax(250px, 286px) minmax(0, 1fr)')
    expect(declarations('.external-library-layout')).toContain('flex: 1')
    expect(declarations('.external-tree-panel')).toContain('flex-direction: column')
    expect(declarations('.external-tree-panel > .external-tree-list')).toContain('overflow-y: auto')
    expect(declarations('.external-content-panel')).toContain('overflow-y: auto')
  })
})
