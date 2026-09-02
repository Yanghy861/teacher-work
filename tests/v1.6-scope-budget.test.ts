import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { isAppGeneratedCoursewareFile } from '../src/renderer/lesson-prep-context'
import type { ManagedFileRecord } from '../src/shared/file-contracts'

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

function fileNamed(originalName: string, mimeType: string): ManagedFileRecord {
  return {
    id: `file-${originalName}`,
    originalName,
    sizeBytes: 100,
    mimeType,
    originFileId: null,
    mtimeMs: null,
    contentHash: null,
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
    deletedAt: null,
  }
}

describe('V16-B modification scope narrowing and reference budget UX', () => {
  it('accepts only app-generated courseware versions as modification targets', () => {
    const versioned = fileNamed('二次函数 · 第 2 版.md', 'text/markdown')
    const importedMarkdown = fileNamed('老师自己的讲义.md', 'text/markdown')
    const office = fileNamed('外部课件.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    const pdf = fileNamed('扫描习题.pdf', 'application/pdf')
    const plainText = fileNamed('笔记.txt', 'text/plain')

    expect(isAppGeneratedCoursewareFile(versioned)).toBe(true)
    expect(isAppGeneratedCoursewareFile(importedMarkdown)).toBe(false)
    expect(isAppGeneratedCoursewareFile(office)).toBe(false)
    expect(isAppGeneratedCoursewareFile(pdf)).toBe(false)
    expect(isAppGeneratedCoursewareFile(plainText)).toBe(false)
  })

  it('narrows workspace candidates, radio list and entry points to app-generated versions', () => {
    const draft = source('../src/renderer/draft-panel.tsx')
    const context = source('../src/renderer/lesson-prep-context.ts')
    const files = source('../src/renderer/lesson-files-section.tsx')

    expect(draft).toContain('modifiableCurrentFiles')
    expect(draft).toContain('appGeneratedCurrentFiles')
    expect(draft).toContain('仅支持修改工作台生成的讲义/教案/作业；外部 Office 文档请用系统应用打开修改')
    expect(draft).toContain('先用 AI 生成第一版课件')
    expect(context).toContain('lessonVersionPattern.test(file.originalName)')
    expect(files).toContain('isAppGeneratedCoursewareFile(selectedFile)')
    expect(files).toContain('仅支持修改工作台生成的讲义/教案/作业；外部 Office 文档请用系统应用打开修改')
  })

  it('shows per-file char counts, budget occupancy and the 10-file selection cap in the picker', () => {
    const draft = source('../src/renderer/draft-panel.tsx')

    expect(draft).toContain('charCounts={referenceCharCounts}')
    expect(draft).toContain('DRAFT_MAX_REFERENCE_FILES} 份')
    expect(draft).toContain('参考已占用 {referenceCharTotal.toLocaleString')
    expect(draft).toContain(`current.length >= DRAFT_MAX_REFERENCE_FILES`)
    expect(draft).toContain(`补充参考最多选择 ${'${DRAFT_MAX_REFERENCE_FILES}'} 份`)
  })

  it('requires explicit confirmation with named overflow references before plan and generation', () => {
    const draft = source('../src/renderer/draft-panel.tsx')

    const planFlow = draft.slice(draft.indexOf('async function startImprovePlan'), draft.indexOf('async function confirmPlanAndGenerate'))
    const confirmFlow = draft.slice(draft.indexOf('async function confirmPlanAndGenerate'), draft.indexOf('async function publishVersion'))
    expect(planFlow).toContain('confirmReferenceBudget(baselineFiles)')
    expect(confirmFlow).toContain('confirmReferenceBudget(baselineFiles)')
    expect(draft).toContain('以下参考未纳入或未完整纳入：')
    expect(draft).toContain('planDraftBudget(baseline, references, DRAFT_DEFAULT_MAX_CHARS)')
  })
})
