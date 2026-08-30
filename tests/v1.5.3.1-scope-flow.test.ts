import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('V1.5.3.1 scoped AI modification contract', () => {
  it('passes an explicit renderer-only launch intent from courseware to the workspace', () => {
    const target = source('../src/renderer/teaching-content-context.ts')
    const files = source('../src/renderer/lesson-files-section.tsx')
    const page = source('../src/renderer/teaching-content-page.tsx')

    expect(target).toContain("export type PrepLaunchMode = 'new' | 'single' | 'lesson'")
    expect(target).toContain('prepTargetFileId?: string')
    expect(files).toContain("{ mode: 'single', targetFileId: selectedFile.id }")
    expect(files).toContain("{ mode: 'lesson' }")
    expect(page).toContain('prepMode: intent.mode')
    expect(page).toContain('launchIntent={target?.prepMode === undefined ? undefined')
  })

  it('separates the modification object from optional references', () => {
    const draft = source('../src/renderer/draft-panel.tsx')

    expect(draft).toContain('修改对象')
    expect(draft).toContain('选择一份文件')
    expect(draft).toContain('本课全部内容')
    expect(draft).toContain('补充参考')
    expect(draft).toContain('selection="radio"')
    expect(draft).toContain('selection="checkbox"')
    expect(draft).toContain('修改当前文件')
    expect(draft).toContain('整课重做')
    expect(draft).not.toContain('勾选作为生成依据')
  })

  it('keeps quick artifact generation exclusive to new prep', () => {
    const draft = source('../src/renderer/draft-panel.tsx')
    const quickActions = draft.slice(
      draft.indexOf("{prepMode === 'new' && ([DRAFT_KINDS.lecture"),
      draft.indexOf("{improveError !== ''"),
    )

    expect(quickActions).toContain('生成${kindLabels[kind]}')
    expect(draft).toContain("prepMode === 'lesson' ? '确认并生成完整新版本'")
  })
})
