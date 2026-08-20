import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const rendererMainPath = fileURLToPath(new URL('../src/renderer/main.tsx', import.meta.url))
const errorBoundaryPath = fileURLToPath(
  new URL('../src/renderer/renderer-error-boundary.tsx', import.meta.url),
)

describe('renderer error boundary', () => {
  it('wraps the renderer root and only reports safe diagnostic metadata', () => {
    const entrySource = readFileSync(rendererMainPath, 'utf8')
    const boundarySource = readFileSync(errorBoundaryPath, 'utf8')

    expect(entrySource).toContain('<RendererErrorBoundary>')
    expect(boundarySource).toContain('getDerivedStateFromError')
    expect(boundarySource).toContain('renderer error boundary')
    expect(boundarySource).not.toContain('error.message')
    expect(boundarySource).toContain('componentStack')
  })
})
