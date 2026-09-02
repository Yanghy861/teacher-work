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
    expect(draft).toContain('选择一份课件版本')
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
    expect(draft).toContain("{prepMode !== 'new' && (")
  })

  it('orders the modification baseline before optional references and persists readable mode markers', () => {
    const draft = source('../src/renderer/draft-panel.tsx')
    const scope = source('../src/renderer/draft-scope.ts')
    const generation = draft.slice(
      draft.indexOf('async function confirmPlanAndGenerate'),
      draft.indexOf('async function publishVersion'),
    )

    expect(generation).toContain('uniqueFiles([...baselineFiles, ...selectedReferenceFiles])')
    expect(generation).toContain('sources: orderedSources.map')
    expect(generation).toContain('const modification = buildModificationScope(')
    expect(generation).toContain('requirement: embeddedRequirement,')
    expect(generation).toContain('modification,')
    expect(scope).toContain("const SINGLE_MODE_MARKER = '【AI修改方式：单文件】'")
    expect(scope).toContain("const LESSON_MODE_MARKER = '【AI修改方式：整课重做】'")
    expect(scope).toContain('【修改对象：${targetFile.originalName}】')
    expect(scope).toContain('【自动基线数量：${baselineCount}】')
  })

  it('gives each mode a distinct plan and final-output contract', () => {
    const draft = source('../src/renderer/draft-panel.tsx')
    const scope = source('../src/renderer/draft-scope.ts')

    expect(draft).toContain('唯一修改对象')
    expect(draft).toContain('补充参考只用于理解要求，不能变成额外修改对象')
    expect(draft).toContain('自动整课基线')
    expect(draft).toContain('整课结构与难度调整')
    expect(scope).toContain('输出修改后的完整文件 Markdown')
    expect(scope).toContain('输出一份可直接发布的完整课件 Markdown，不要拆成多个文件')
    expect(scope).toContain('讲义、例题、课堂练习、课后作业四个清晰板块')
    expect(draft).toContain("const generatedKind = prepMode === 'lesson' ? DRAFT_KINDS.lecture : kind")
  })

  it('restores scoped drafts from structured metadata first and falls back to requirement markers', () => {
    const draft = source('../src/renderer/draft-panel.tsx')
    const scope = source('../src/renderer/draft-scope.ts')
    const restore = draft.slice(
      draft.indexOf('const orderedSourceIds = uniqueStrings'),
      draft.indexOf('async function reload'),
    )

    expect(restore).toContain('orderedSourceIds.slice(0, scope.baselineCount)')
    expect(restore).toContain('orderedSourceIds.slice(scope.baselineCount)')
    expect(restore).toContain("setTargetFileId(scope.mode === 'single' ? baselineIds[0] ?? '' : '')")
    expect(restore).toContain("setLessonBaselineFileIds(scope.mode === 'lesson' ? baselineIds : [])")
    expect(restore).toContain('setRequirement(scope.teacherRequirement)')
    expect(restore).toContain('buildComparisonBase(scope.mode, scopedText.baselineParts)')
    expect(scope).toContain('metadata?.modification !== undefined')
    expect(scope).toContain("if (mode === null) return null")
  })

  it('prioritizes baseline text within the budget and exposes truncation and mode-specific publishing', () => {
    const draft = source('../src/renderer/draft-panel.tsx')
    const scope = source('../src/renderer/draft-scope.ts')

    expect(draft.indexOf('const baselineParts = await readGroup(baselineFiles)')).toBeLessThan(
      draft.indexOf('const referenceParts = await readGroup(referenceFiles)'),
    )
    expect(draft).toContain('planDraftBudget(')
    expect(draft).toContain('confirmReferenceBudget(')
    expect(draft).toContain('部分参考未完整纳入本次 AI 请求')
    expect(scope).toContain("if (scope?.mode === 'single') return '单文件修订'")
    expect(scope).toContain("if (scope?.mode === 'lesson') return '整课重做'")
    expect(scope).toContain('的单文件修订发布为本课课件新版本')
    expect(scope).toContain('将把整课重做内容发布为本课课件新版本')
  })
})
