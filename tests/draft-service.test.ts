import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { AiSettingsService } from '../src/main/ai/ai-settings-service'
import type { AiGateway } from '../src/main/ai/ai-gateway'
import { AiGatewayError } from '../src/main/ai/ai-gateway'
import type { SecureStoragePort } from '../src/main/ai/secure-storage'
import { CoreDataService } from '../src/main/data/core-data-service'
import { DraftService } from '../src/main/draft/draft-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { openSearchDatabase } from '../src/main/search/search-database'
import { SearchService } from '../src/main/search/search-service'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'

const roots: string[] = []
const workspaces: WorkspaceHandle[] = []
const searchDatabases: Array<{ close(): void }> = []

afterEach(() => {
  for (const database of searchDatabases.splice(0)) database.close()
  for (const workspace of workspaces.splice(0)) workspace.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(): {
  workspace: WorkspaceHandle
  core: CoreDataService
  search: SearchService
  draft: DraftService
  gateway: { requestText: (requestId: string, prompt: string, maxTokens?: number) => Promise<{ text: string; model: string }> }
  fileId: string
  otherFileId: string
  studentId: string
  lessonId: string
} {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-l09-'))
  roots.push(root)
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  workspaces.push(workspace)
  const searchDb = openSearchDatabase(workspace.paths)
  searchDatabases.push(searchDb)
  const core = new CoreDataService(workspace.database.raw)
  const files = new ManagedFileService(workspace.database.raw, workspace.paths)
  const search = new SearchService(workspace.database.raw, searchDb.raw, workspace.paths)
  const secure: SecureStoragePort = {
    isAvailable: () => false,
    encrypt: (value) => Buffer.from(value),
    decrypt: (value) => value.toString(),
    read: () => undefined,
    write: () => undefined,
    clear: () => undefined,
  }
  const settings = new AiSettingsService(workspace.database.raw, { secureStorage: secure })
  settings.updateSettings({ provider: 'openai-compatible', model: 'fake-model', endpoint: 'https://fake.local/v1', apiKey: 'SESSION_KEY' })
  const gateway = {
    requestText: async (_requestId: string, prompt: string, maxTokens?: number) => ({ text: `# Draft\n${prompt.slice(-(maxTokens === undefined ? 100 : 100))}`, model: 'fake-model' }),
  }
  const draft = new DraftService(core, search, gateway as unknown as AiGateway, settings)
  const course = core.nodes.createCourse('L09 课程', 'one_to_one')
  const period = core.nodes.createPeriod(course.id, '第一阶段')
  const lesson = core.nodes.createLesson(period.id, '函数')
  const student = core.createStudentForCourse(course.id, '学生甲')
  const source = join(root, 'source.txt')
  writeFileSync(source, '未选资料正文\nselected source text', 'utf8')
  const file = files.importFile(source)
  search.indexFile({ id: file.id, originalName: file.originalName, chunks: [{ text: 'selected source text', position: { type: 'line', value: 1 } }], status: 'indexed', contentHash: 'hash' })
  const otherSource = join(root, 'other.txt')
  writeFileSync(otherSource, 'UNSELECTED_SECRET_CONTEXT', 'utf8')
  const otherFile = files.importFile(otherSource)
  search.indexFile({ id: otherFile.id, originalName: otherFile.originalName, chunks: [{ text: 'UNSELECTED_SECRET_CONTEXT' }], status: 'indexed', contentHash: 'other-hash' })
  return { workspace, core, search, draft, gateway, fileId: file.id, otherFileId: otherFile.id, studentId: student.id, lessonId: lesson.id }
}

describe('L09 context builder and draft generation', () => {
  it('builds context from a selected indexed file without including another file', async () => {
    const { core, search, fileId, otherFileId, studentId, lessonId } = fixture()
    let prompt = ''
    const gateway = { requestText: async (_id: string, value: string) => { prompt = value; return { text: 'file-context draft', model: 'fake-model' } } }
    const settings = { getSettings: () => ({ provider: 'openai-compatible' as const, model: 'fake-model', endpoint: 'https://fake.local/v1', keyConfigured: true, keyStorage: 'session' as const }) } as unknown as AiSettingsService
    const draft = new DraftService(core, search, gateway as unknown as AiGateway, settings)
    await draft.generate({ requestId: 'file-context', kind: 'example', studentId, lessonId, sources: [{ fileId }], maxChars: 100, maxTokens: 100 })
    expect(prompt).toContain('selected source text')
    expect(prompt).not.toContain('UNSELECTED_SECRET_CONTEXT')
    expect(otherFileId).not.toBe(fileId)
  })

  it('sends only explicitly selected text, truncates to the character budget, and saves metadata note', async () => {
    const { core, draft, fileId, studentId, lessonId, workspace } = fixture()
    const result = await draft.generate({
      requestId: 'draft-1',
      kind: 'lecture',
      studentId,
      lessonId,
      sources: [{ fileId, text: 'EXPLICIT_SELECTED_TEXT', position: { type: 'manual' } }],
      maxChars: 8,
      maxTokens: 100,
    })
    expect(result.metadata.inputChars).toBe(8)
    expect(result.metadata.sources).toEqual([{ fileId, position: { type: 'manual' }, charsSent: 8 }])
    const note = core.getOverview().notes.find((item) => item.id === result.noteId)
    expect(note).toMatchObject({ noteKind: 'lecture' })
    expect(note?.bodyMd).toContain('# Draft')
    expect(note?.aiMetadata).toMatchObject({ promptVersion: 'l09-v1', provider: 'openai-compatible', model: 'fake-model' })
    const edited = core.updateNote(result.noteId, '老师修改后的讲义')
    expect(edited.bodyMd).toBe('老师修改后的讲义')
    expect(edited.aiMetadata?.promptVersion).toBe('l09-v1')
    expect(readFileSync(join(workspace.paths.objectsDirectory, fileId, 'content'), 'utf8')).toContain('selected source text')
  })

  it('reads only selected file context and keeps an earlier note when generation fails', async () => {
    const { core, search, fileId, otherFileId, studentId, lessonId } = fixture()
    const existing = core.createNote(studentId, '已有 note', lessonId)
    let sentPrompt = ''
    const gateway = { requestText: async (_id: string, prompt: string) => { sentPrompt = prompt; throw new AiGatewayError('AI_NETWORK', 'fake failure') } }
    const settings = { getSettings: () => ({ provider: 'openai-compatible' as const, model: 'fake-model', endpoint: 'https://fake.local/v1', keyConfigured: true, keyStorage: 'session' as const }) } as unknown as AiSettingsService
    const draft = new DraftService(core, search, gateway as unknown as AiGateway, settings)
    await expect(draft.generate({
      requestId: 'draft-fail', kind: 'homework', studentId, lessonId,
      sources: [{ fileId, text: 'only this text' }], maxChars: 100, maxTokens: 100,
    })).rejects.toMatchObject({ code: 'AI_NETWORK' })
    expect(sentPrompt).toContain('only this text')
    expect(sentPrompt).not.toContain('UNSELECTED_SECRET_CONTEXT')
    expect(otherFileId).not.toBe(fileId)
    expect(core.getOverview().notes.map((note) => note.id)).toEqual([existing.id])
  })

  it('can be retried after an empty/invalid provider response without duplicating a prior note', async () => {
    const { core, search, fileId, studentId, lessonId } = fixture()
    const existing = core.createNote(studentId, '保留的 note', lessonId)
    let attempts = 0
    const gateway = {
      requestText: async () => {
        attempts += 1
        if (attempts === 1) throw new AiGatewayError('AI_INVALID_RESPONSE', 'AI 服务返回了空响应。')
        return { text: '重试后的作业', model: 'fake-model' }
      },
    }
    const settings = { getSettings: () => ({ provider: 'openai-compatible' as const, model: 'fake-model', endpoint: 'https://fake.local/v1', keyConfigured: true, keyStorage: 'session' as const }) } as unknown as AiSettingsService
    const retryDraft = new DraftService(core, search, gateway as unknown as AiGateway, settings)
    const request = { requestId: 'retry', kind: 'homework' as const, studentId, lessonId, sources: [{ fileId, text: 'retry context' }], maxChars: 100, maxTokens: 100 }
    await expect(retryDraft.generate(request)).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })
    expect(core.getOverview().notes.map((note) => note.id)).toEqual([existing.id])
    const result = await retryDraft.generate({ ...request, requestId: 'retry-2' })
    expect(result.bodyMd).toBe('重试后的作业')
    expect(core.getOverview().notes).toHaveLength(2)
  })
})
