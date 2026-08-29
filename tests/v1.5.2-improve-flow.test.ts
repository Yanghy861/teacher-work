import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('V152-C improvement flow contract', () => {
  it('proposes a reviewable plan before generating and embeds the confirmed plan', () => {
    const draft = source('../src/renderer/draft-panel.tsx')
    expect(draft).toContain('基于课件改进（AI 先出修改方案）')
    expect(draft).toContain('修改方案（先审阅，再生成）')
    expect(draft).toContain('确认方案并生成')
    expect(draft).toContain('重新出方案')
    expect(draft).toContain('放弃改进')
    expect(draft).toContain('【老师已确认的修改方案（请严格按方案修改）】')
    expect(draft).toContain('window.teacherWorkbench.ai.requestText')
    expect(draft).toContain("window.teacherWorkbench.files.readContent({ fileId: file.id })")
    expect(draft).toContain("find((note) => note.draftStatus === 'draft')")
  })

  it('requires reference selection and a modification requirement before planning', () => {
    const draft = source('../src/renderer/draft-panel.tsx')
    expect(draft).toContain('请先勾选要改进的课件或资料。')
    expect(draft).toContain('请先填写本次修改要求，AI 需要知道你想怎么改。')
  })

  it('compares new work copy against the reference courseware', () => {
    const draft = source('../src/renderer/draft-panel.tsx')
    const styles = source('../src/renderer/styles.css')
    expect(draft).toContain('参考课件：')
    expect(draft).toContain('新工作副本（未发布）')
    expect(draft).toContain('新旧对比')
    expect(styles).toContain('.draft-compare-grid')
    expect(styles).toContain('@media (max-width: 760px)')
  })

  it('keeps improve state isolated per lesson context', () => {
    const draft = source('../src/renderer/draft-panel.tsx')
    const contextEffect = draft.slice(
      draft.indexOf('let cancelled = false'),
      draft.indexOf('async function reload'),
    )
    expect(contextEffect).toContain('setImprovePhase(\'\')')
    expect(contextEffect).toContain('setCompareOpen(false)')
  })
})
