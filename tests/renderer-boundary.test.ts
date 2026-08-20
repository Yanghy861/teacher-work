import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const rendererDirectory = fileURLToPath(new URL('../src/renderer', import.meta.url))
const prohibitedImports = [
  /from\s+['"]electron['"]/,
  /require\(\s*['"]electron['"]\s*\)/,
  /from\s+['"]node:(?:fs|path|sqlite|child_process)['"]/,
  /from\s+['"](?:fs|path|better-sqlite3|sqlite3)['"]/,
]

function rendererSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      return rendererSourceFiles(entryPath)
    }
    return /\.(?:ts|tsx|css|html)$/.test(entry.name) ? [entryPath] : []
  })
}

describe('renderer process boundary', () => {
  it('does not import Node, Electron, or database APIs directly', () => {
    const violations = rendererSourceFiles(rendererDirectory).flatMap((filePath) => {
      const contents = readFileSync(filePath, 'utf8')
      return prohibitedImports
        .filter((pattern) => pattern.test(contents))
        .map((pattern) => `${filePath} matches ${pattern}`)
    })

    expect(violations).toEqual([])
  })
})
