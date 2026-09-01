import { describe, expect, it } from 'vitest'

import type { NoteRecord } from '../src/shared/core-contracts'
import { DRAFT_MODIFICATION_SCOPE_VERSION, isDraftModificationScope } from '../src/shared/draft-contracts'
import {
  buildModificationScope,
  buildModeRequirement,
  buildPublishConfirmation,
  modificationNodeLabel,
  parseModificationScope,
} from '../src/renderer/draft-scope'

function noteWith(
  aiMetadata: Record<string, unknown> | undefined,
  noteKind: NonNullable<NoteRecord['noteKind']> = 'lecture',
): NoteRecord {
  return {
    id: 'note-1',
    studentId: null,
    lessonId: 'lesson-1',
    bodyMd: '# 草稿正文',
    createdAt: '2026-08-31T10:00:00.000Z',
    updatedAt: '2026-08-31T10:00:00.000Z',
    deletedAt: null,
    noteKind,
    draftStatus: 'draft',
    ...(aiMetadata === undefined ? {} : { aiMetadata: aiMetadata as unknown as NoteRecord['aiMetadata'] }),
  }
}

const singleFile = {
  id: 'file-1',
  originalName: '函数讲义.md',
  sizeBytes: 100,
  mimeType: 'text/markdown',
  originFileId: null,
  mtimeMs: null,
  contentHash: null,
  createdAt: '2026-08-31T10:00:00.000Z',
  updatedAt: '2026-08-31T10:00:00.000Z',
  deletedAt: null,
}

describe('V155-A draft modification scope metadata', () => {
  it('builds a single-file scope with target identity and a bounded confirmed plan', () => {
    const scope = buildModificationScope('single', singleFile, 1, '加一道即时练习', '第一部分后增加练习。')

    expect(scope).toEqual({
      scopeVersion: DRAFT_MODIFICATION_SCOPE_VERSION,
      mode: 'single',
      baselineCount: 1,
      targetFileId: 'file-1',
      targetName: '函数讲义.md',
      teacherRequirement: '加一道即时练习',
      confirmedPlan: '第一部分后增加练习。',
    })
    expect(isDraftModificationScope(scope)).toBe(true)
  })

  it('builds a whole-lesson scope without target identity and truncates over-budget fields', () => {
    const longRequirement = '要求'.repeat(4_100)
    const longPlan = '方案'.repeat(900)
    const scope = buildModificationScope('lesson', null, 3, longRequirement, longPlan)

    expect(scope.targetFileId).toBeUndefined()
    expect(scope.targetName).toBeUndefined()
    expect(scope.mode).toBe('lesson')
    expect(scope.baselineCount).toBe(3)
    expect(scope.teacherRequirement.length).toBe(4_000)
    expect(scope.confirmedPlan?.length).toBe(800)
    expect(isDraftModificationScope(scope)).toBe(true)
  })

  it('omits the confirmed plan when empty and still passes the contract guard', () => {
    const scope = buildModificationScope('lesson', null, 2, '', '  ')
    expect(scope.confirmedPlan).toBeUndefined()
    expect(scope.teacherRequirement).toBe('')
    expect(isDraftModificationScope(scope)).toBe(true)
  })

  it('keeps the marker-based requirement prompt unchanged for the AI', () => {
    const requirement = buildModeRequirement('single', singleFile, 1, '加一道即时练习', '第一部分后增加练习。')
    expect(requirement).toContain('【AI修改方式：单文件】')
    expect(requirement).toContain('【修改对象：函数讲义.md】')
    expect(requirement).toContain('【老师修改要求】')
    expect(requirement).toContain('加一道即时练习')
    expect(requirement).toContain('【老师已确认的修改方案（请严格按方案修改）】')
    expect(requirement).toContain('第一部分后增加练习。')
  })

  it('restores from structured metadata first, even when the stored requirement contradicts it', () => {
    const requirement = buildModeRequirement('lesson', singleFile, 3, '旧要求', '旧方案')
    const note = noteWith({
      kind: 'lecture',
      promptVersion: 'v11-03-v1',
      provider: 'openai-compatible',
      model: 'fake-model',
      sources: [{ fileId: 'file-1', charsSent: 10 }],
      inputChars: 10,
      maxChars: 100,
      maxTokens: 100,
      requirement,
      modification: {
        scopeVersion: DRAFT_MODIFICATION_SCOPE_VERSION,
        mode: 'single',
        baselineCount: 1,
        targetFileId: 'file-1',
        targetName: '函数讲义.md',
        teacherRequirement: '结构化要求',
        confirmedPlan: '结构化方案',
      },
    })

    expect(parseModificationScope(note)).toEqual({
      mode: 'single',
      baselineCount: 1,
      targetName: '函数讲义.md',
      teacherRequirement: '结构化要求',
    })
  })

  it('falls back to marker parsing for legacy notes without structured metadata', () => {
    const requirement = buildModeRequirement('lesson', singleFile, 3, '旧课重做要求', '旧方案')
    const note = noteWith({
      kind: 'lecture',
      promptVersion: 'v11-03-v1',
      provider: 'openai-compatible',
      model: 'fake-model',
      sources: [{ fileId: 'file-1', charsSent: 10 }],
      inputChars: 10,
      maxChars: 100,
      maxTokens: 100,
      requirement,
    })

    const parsed = parseModificationScope(note)
    expect(parsed?.mode).toBe('lesson')
    expect(parsed?.baselineCount).toBe(3)
    expect(parsed?.teacherRequirement).toBe('旧课重做要求')

    const singleRequirement = buildModeRequirement('single', singleFile, 1, '单文件要求', '单文件方案')
    const singleNote = noteWith({
      kind: 'lecture',
      promptVersion: 'v11-03-v1',
      provider: 'openai-compatible',
      model: 'fake-model',
      sources: [{ fileId: 'file-1', charsSent: 10 }],
      inputChars: 10,
      maxChars: 100,
      maxTokens: 100,
      requirement: singleRequirement,
    })
    const singleParsed = parseModificationScope(singleNote)
    expect(singleParsed?.mode).toBe('single')
    expect(singleParsed?.baselineCount).toBe(1)
    expect(singleParsed?.targetName).toBe('函数讲义.md')
    expect(singleParsed?.teacherRequirement).toBe('单文件要求')
  })

  it('keeps teacher requirements containing marker text intact via structured metadata', () => {
    const poisonedRequirement = `请按【AI修改方式：整课重做】的方式处理这一段`
    const note = noteWith({
      kind: 'lecture',
      promptVersion: 'v11-03-v1',
      provider: 'openai-compatible',
      model: 'fake-model',
      sources: [{ fileId: 'file-1', charsSent: 10 }],
      inputChars: 10,
      maxChars: 100,
      maxTokens: 100,
      modification: {
        scopeVersion: DRAFT_MODIFICATION_SCOPE_VERSION,
        mode: 'single',
        baselineCount: 1,
        targetFileId: 'file-1',
        targetName: '函数讲义.md',
        teacherRequirement: poisonedRequirement,
        confirmedPlan: '按单文件处理。',
      },
    })

    const parsed = parseModificationScope(note)
    expect(parsed?.mode).toBe('single')
    expect(parsed?.teacherRequirement).toBe(poisonedRequirement)
  })

  it('labels nodes and builds publish confirmations for both tracks', () => {
    const legacySingle = noteWith({
      kind: 'lecture',
      promptVersion: 'v11-03-v1',
      provider: 'openai-compatible',
      model: 'fake-model',
      sources: [{ fileId: 'file-1', charsSent: 10 }],
      inputChars: 10,
      maxChars: 100,
      maxTokens: 100,
      requirement: buildModeRequirement('single', singleFile, 1, '要求', '方案'),
    })
    const structuredLesson = noteWith({
      kind: 'lecture',
      promptVersion: 'v11-03-v1',
      provider: 'openai-compatible',
      model: 'fake-model',
      sources: [{ fileId: 'file-1', charsSent: 10 }],
      inputChars: 10,
      maxChars: 100,
      maxTokens: 100,
      modification: {
        scopeVersion: DRAFT_MODIFICATION_SCOPE_VERSION,
        mode: 'lesson',
        baselineCount: 2,
        teacherRequirement: '要求',
      },
    })
    const plain = noteWith({
      kind: 'example',
      promptVersion: 'v11-03-v1',
      provider: 'openai-compatible',
      model: 'fake-model',
      sources: [{ fileId: 'file-1', charsSent: 10 }],
      inputChars: 10,
      maxChars: 100,
      maxTokens: 100,
    }, 'example')

    expect(modificationNodeLabel(legacySingle)).toBe('单文件修订')
    expect(modificationNodeLabel(structuredLesson)).toBe('整课重做')
    expect(modificationNodeLabel(plain)).toBe('例题修改节点')
    expect(buildPublishConfirmation(legacySingle)).toContain('的单文件修订发布为本课课件新版本')
    expect(buildPublishConfirmation(structuredLesson)).toBe('将把整课重做内容发布为本课课件新版本，旧版本保留。继续？')
    expect(buildPublishConfirmation(plain)).toBe('将把当前内容发布为本课课件新版本，旧版本保留。继续？')
  })

  it('returns null when a legacy note has no recognizable scope', () => {
    const note = noteWith({
      kind: 'lecture',
      promptVersion: 'v11-03-v1',
      provider: 'openai-compatible',
      model: 'fake-model',
      sources: [{ fileId: 'file-1', charsSent: 10 }],
      inputChars: 10,
      maxChars: 100,
      maxTokens: 100,
      requirement: '普通的新建备课要求，没有任何修改方式标记。',
    })
    expect(parseModificationScope(note)).toBeNull()
    expect(parseModificationScope(noteWith(undefined))).toBeNull()
  })
})
