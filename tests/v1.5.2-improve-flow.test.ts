import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('V152-C improvement flow contract', () => {
  it('proposes a reviewable plan before generating and embeds the confirmed plan', () => {
    const draft = source('../src/renderer/draft-panel.tsx')
    const scope = source('../src/renderer/draft-scope.ts')
    expect(draft).toContain('✦ 生成单文件修改方案')
    expect(draft).toContain('✦ 生成整课重做方案')
    expect(draft).toContain('修改方案（先审阅，再生成）')
    expect(draft).toContain('确认方案并生成')
    expect(draft).toContain('重新出方案')
    expect(draft).toContain('放弃改进')
    expect(scope).toContain('【老师已确认的修改方案（请严格按方案修改）】')
    expect(draft).toContain('window.teacherWorkbench.ai.requestText')
    expect(draft).toContain("window.teacherWorkbench.files.readContent({ fileId: file.id })")
    expect(draft).toContain("find((note) => note.draftStatus === 'draft')")
  })

  it('requires a modification object and a modification requirement before planning', () => {
    const draft = source('../src/renderer/draft-panel.tsx')
    expect(draft).toContain('请先选择要修改的文件。')
    expect(draft).toContain('本课没有可用于整课重做的基线内容。')
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

describe('V152-D publish version contract', () => {
  it('exposes the approved publish channel end to end', () => {
    const contracts = source('../src/shared/ipc-contracts.ts')
    const managed = source('../src/main/files/managed-file-service.ts')
    const draft = source('../src/renderer/draft-panel.tsx')
    const scope = source('../src/renderer/draft-scope.ts')
    const preload = source('../src/preload/index.ts')
    expect(contracts).toContain("publishToLesson: 'draft:publish-to-lesson'")
    expect(managed).toContain('publishLessonDraftVersion(noteId: string)')
    expect(managed).toContain('只能发布 AI 修改节点。')
    expect(managed).toContain("UPDATE notes SET draft_status = 'saved', updated_at = ? WHERE id = ?")
    expect(managed).toContain("f.original_name LIKE '% · 第 % 版.md'")
    expect(managed).toContain('writeFileSync(temporaryPath, Buffer.from(bodyMd, \'utf8\'))')
    expect(managed).toContain('this.renameFile(temporaryPath, object.contentPath)')
    expect(preload).toContain('publishToLesson')
    expect(draft).toContain('保存为新版本')
    expect(scope).toContain('将把当前内容发布为本课课件新版本，旧版本保留。继续？')
    expect(draft).toContain('旧版本保留，可在课件区查看。')
  })
})
