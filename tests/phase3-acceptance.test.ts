import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { AiGateway, type AiFetch, type AiFetchResponse } from '../src/main/ai/ai-gateway'
import { AiSettingsService } from '../src/main/ai/ai-settings-service'
import type { SecureStoragePort } from '../src/main/ai/secure-storage'
import { CoreDataService } from '../src/main/data/core-data-service'
import { DraftService } from '../src/main/draft/draft-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { dispatchCoreIpc } from '../src/main/ipc/core-ipc'
import { dispatchDraftIpc } from '../src/main/ipc/draft-ipc'
import { openSearchDatabase } from '../src/main/search/search-database'
import { SearchService } from '../src/main/search/search-service'
import { CORE_IPC_CHANNELS, DRAFT_IPC_CHANNELS, IPC_ERROR_CODES } from '../src/shared/ipc-contracts'
import { isGenerateDraftResult, type GenerateDraftResult } from '../src/shared/draft-contracts'
import type { IpcLogger } from '../src/main/ipc/app-ipc'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'

const roots: string[] = []
const workspaces: WorkspaceHandle[] = []
const searchDatabases: Array<{ close(): void }> = []

class AcceptanceLogger implements IpcLogger {
  readonly lines: string[] = []

  log(_level: 'info' | 'warn' | 'error', event: string, details: Record<string, unknown> = {}): void {
    this.lines.push(JSON.stringify({ event, details }))
  }

  error(event: string, error: unknown, details: Record<string, unknown> = {}): void {
    this.lines.push(JSON.stringify({ event, error: error instanceof Error ? error.message : String(error), details }))
  }
}

type ProviderMode = 'success' | 'network' | 'empty' | 'cancel'

interface AcceptanceFixture {
  readonly workspace: WorkspaceHandle
  readonly core: CoreDataService
  readonly draft: DraftService
  readonly gateway: AiGateway
  readonly fileId: string
  readonly studentId: string
  readonly lessonId: string
  readonly selectedText: string
  readonly secretKey: string
  readonly logger: AcceptanceLogger
  readonly requests: Array<{ readonly authorization: string | undefined; readonly prompt: string; readonly maxTokens: number | undefined }>
  setProviderMode(mode: ProviderMode): void
}

function fixture(): AcceptanceFixture {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-l10-'))
  roots.push(root)
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  workspaces.push(workspace)
  const searchDb = openSearchDatabase(workspace.paths)
  searchDatabases.push(searchDb)

  const core = new CoreDataService(workspace.database.raw)
  const files = new ManagedFileService(workspace.database.raw, workspace.paths)
  const search = new SearchService(workspace.database.raw, searchDb.raw, workspace.paths)
  let encryptedKey: Buffer | undefined
  const secure: SecureStoragePort = {
    isAvailable: () => true,
    encrypt: (value) => Buffer.from(`cipher:${value}`, 'utf8'),
    decrypt: (value) => value.toString('utf8').slice('cipher:'.length),
    read: () => encryptedKey,
    write: (value) => { encryptedKey = value },
    clear: () => { encryptedKey = undefined },
  }
  const settings = new AiSettingsService(workspace.database.raw, { secureStorage: secure })
  const secretKey = 'L10_ACCEPTANCE_SECRET_KEY'
  settings.updateSettings({
    provider: 'openai-compatible',
    model: 'fake-model',
    endpoint: 'https://fake.local/v1',
    apiKey: secretKey,
  })

  let providerMode: ProviderMode = 'success'
  let responseNumber = 0
  const requests: Array<{ authorization: string | undefined; prompt: string; maxTokens: number | undefined }> = []
  const fetcher: AiFetch = async (_url, init) => {
    const body = JSON.parse(init.body) as {
      messages: Array<{ content: string }>
      max_tokens?: number
    }
    requests.push({
      authorization: init.headers.Authorization,
      prompt: body.messages[0]?.content ?? '',
      maxTokens: body.max_tokens,
    })
    if (providerMode === 'network') {
      throw new Error('fake network failure')
    }
    if (providerMode === 'cancel') {
      return new Promise<AiFetchResponse>((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('fake cancellation')), { once: true })
      })
    }
    const content = providerMode === 'empty' ? '   ' : `# Fake draft ${++responseNumber}`
    return {
      ok: true,
      status: 200,
      json: async () => ({ model: 'fake-model', choices: [{ message: { content } }] }),
      text: async () => JSON.stringify({ model: 'fake-model', choices: [{ message: { content } }] }),
    }
  }
  const logger = new AcceptanceLogger()
  const gateway = new AiGateway(settings, { fetch: fetcher, timeoutMs: 200, logger })
  const draft = new DraftService(core, search, gateway, settings)

  const course = core.nodes.createCourse('L10 验收课程', 'one_to_one')
  const period = core.nodes.createPeriod(course.id, '阶段一')
  const lesson = core.nodes.createLesson(period.id, '一次函数')
  const student = core.createStudentForCourse(course.id, '学生甲')
  const selectedText = 'SELECTED_L10_SOURCE_TEXT'
  const sourcePath = join(root, 'selected.txt')
  writeFileSync(sourcePath, selectedText, 'utf8')
  const file = files.importFile(sourcePath)
  search.indexFile({
    id: file.id,
    originalName: file.originalName,
    chunks: [{ text: selectedText, position: { type: 'line', value: 1 } }],
    status: 'indexed',
    contentHash: 'selected-hash',
  })
  const unselectedPath = join(root, 'unselected.txt')
  writeFileSync(unselectedPath, 'UNSELECTED_L10_SECRET_CONTEXT', 'utf8')
  const unselected = files.importFile(unselectedPath)
  search.indexFile({
    id: unselected.id,
    originalName: unselected.originalName,
    chunks: [{ text: 'UNSELECTED_L10_SECRET_CONTEXT' }],
    status: 'indexed',
    contentHash: 'unselected-hash',
  })

  return {
    workspace,
    core,
    draft,
    gateway,
    fileId: file.id,
    studentId: student.id,
    lessonId: lesson.id,
    selectedText,
    secretKey,
    logger,
    requests,
    setProviderMode: (mode) => { providerMode = mode },
  }
}

function validRequest(fixtureValue: AcceptanceFixture, kind: 'lecture' | 'example' | 'homework', requestId: string) {
  return {
    requestId,
    kind,
    studentId: fixtureValue.studentId,
    lessonId: fixtureValue.lessonId,
    sources: [{ fileId: fixtureValue.fileId }],
    maxChars: 128,
    maxTokens: 256,
  } as const
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function workspaceText(root: string): string {
  const entries = readdirSync(root, { withFileTypes: true })
  return entries.map((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? workspaceText(path) : readFileSync(path).toString('utf8')
  }).join('\n')
}

afterEach(() => {
  for (const database of searchDatabases.splice(0)) database.close()
  for (const workspace of workspaces.splice(0)) workspace.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('L10 AI lesson-prep phase acceptance', () => {
  it('completes select → generate three drafts → edit → save with a fake provider', async () => {
    const value = fixture()
    const logger = value.logger
    const generated = await Promise.all((['lecture', 'example', 'homework'] as const).map((kind, index) =>
      dispatchDraftIpc(
        DRAFT_IPC_CHANNELS.generate,
        validRequest(value, kind, `l10-happy-${index}`),
        { getDraftService: () => value.draft },
        logger,
      )))

    expect(generated.every((response) => response.ok)).toBe(true)
    const results: GenerateDraftResult[] = generated.flatMap((response) => (
      response.ok && isGenerateDraftResult(response.data) ? [response.data] : []
    ))
    expect(results).toHaveLength(3)
    expect(new Set(results.map((result) => result.kind))).toEqual(new Set(['lecture', 'example', 'homework']))
    const firstResult = results[0]
    if (firstResult === undefined) throw new Error('fake provider did not return a lecture draft')
    expect(value.requests).toHaveLength(3)
    expect(value.requests.every((request) => request.prompt.includes(value.selectedText))).toBe(true)
    expect(value.requests.every((request) => !request.prompt.includes('UNSELECTED_L10_SECRET_CONTEXT'))).toBe(true)
    expect(value.requests.every((request) => request.authorization === `Bearer ${value.secretKey}`)).toBe(true)

    const edited = await dispatchCoreIpc(
      CORE_IPC_CHANNELS.updateNote,
      { noteId: firstResult.noteId, bodyMd: '# 老师修改后的讲义' },
      { getCoreData: () => value.core },
      logger,
    )
    expect(edited).toMatchObject({ ok: true, data: { bodyMd: '# 老师修改后的讲义', noteKind: 'lecture' } })
    expect(value.core.getOverview().notes).toHaveLength(3)
    expect(readFileSync(join(value.workspace.paths.objectsDirectory, value.fileId, 'content'), 'utf8')).toBe(value.selectedText)
  })

  it('does not send without selected material and enforces character/token limits at IPC', async () => {
    const value = fixture()
    const dependencies = { getDraftService: () => value.draft }
    const empty = await dispatchDraftIpc(
      DRAFT_IPC_CHANNELS.generate,
      { ...validRequest(value, 'lecture', 'l10-no-selection'), sources: [] },
      dependencies,
      value.logger,
    )
    expect(empty).toEqual({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD, message: '请求参数无效。' } })
    expect(value.requests).toHaveLength(0)

    for (const request of [
      { maxChars: 0 },
      { maxChars: 100_001 },
      { maxTokens: 0 },
      { maxTokens: 32_001 },
    ]) {
      const invalid = await dispatchDraftIpc(
        DRAFT_IPC_CHANNELS.generate,
        { ...validRequest(value, 'example', `l10-limit-${JSON.stringify(request)}`), ...request },
        dependencies,
        value.logger,
      )
      expect(invalid).toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })
    }
    expect(value.requests).toHaveLength(0)

    const truncated = await dispatchDraftIpc(
      DRAFT_IPC_CHANNELS.generate,
      { ...validRequest(value, 'example', 'l10-truncate'), maxChars: 7, maxTokens: 17 },
      dependencies,
      value.logger,
    )
    expect(truncated).toMatchObject({ ok: true, data: { metadata: { inputChars: 7, maxChars: 7, maxTokens: 17 } } })
    expect(value.requests[0]?.prompt).toContain(value.selectedText.slice(0, 7))
    expect(value.requests[0]?.prompt).not.toContain(value.selectedText.slice(7))
    expect(value.requests[0]?.maxTokens).toBe(17)
  })

  it('keeps existing notes through network, empty-response, and cancellation failures, then retries', async () => {
    const value = fixture()
    const existing = value.core.createNote(value.studentId, '已有 note', value.lessonId)
    const dependencies = { getDraftService: () => value.draft }
    const request = validRequest(value, 'homework', 'l10-failure')

    value.setProviderMode('network')
    await expect(dispatchDraftIpc(DRAFT_IPC_CHANNELS.generate, request, dependencies, value.logger)).resolves.toMatchObject({
      ok: false,
      error: { code: IPC_ERROR_CODES.AI_ERROR },
    })
    expect(value.core.getOverview().notes.map((note) => note.id)).toEqual([existing.id])

    value.setProviderMode('empty')
    await expect(dispatchDraftIpc(DRAFT_IPC_CHANNELS.generate, { ...request, requestId: 'l10-empty' }, dependencies, value.logger)).resolves.toMatchObject({
      ok: false,
      error: { code: IPC_ERROR_CODES.AI_ERROR },
    })
    expect(value.core.getOverview().notes.map((note) => note.id)).toEqual([existing.id])

    value.setProviderMode('cancel')
    const cancelled = dispatchDraftIpc(DRAFT_IPC_CHANNELS.generate, { ...request, requestId: 'l10-cancel' }, dependencies, value.logger)
    await delay(5)
    expect(value.gateway.cancel('l10-cancel')).toBe(true)
    await expect(cancelled).resolves.toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.AI_ERROR } })
    expect(value.core.getOverview().notes.map((note) => note.id)).toEqual([existing.id])

    value.setProviderMode('success')
    const retried = await dispatchDraftIpc(DRAFT_IPC_CHANNELS.generate, { ...request, requestId: 'l10-retry' }, dependencies, value.logger)
    expect(retried).toMatchObject({ ok: true, data: { kind: 'homework' } })
    expect(value.core.getOverview().notes).toHaveLength(2)
  })

  it('keeps the API key out of logs, database, IPC responses, errors, and workspace backups', async () => {
    const value = fixture()
    value.setProviderMode('network')
    const response = await dispatchDraftIpc(
      DRAFT_IPC_CHANNELS.generate,
      validRequest(value, 'lecture', 'l10-secret-audit'),
      { getDraftService: () => value.draft },
      value.logger,
    )
    const databaseRows = value.workspace.database.raw.prepare('SELECT provider, model, endpoint FROM ai_settings').all()
    expect(JSON.stringify(response)).not.toContain(value.secretKey)
    expect(value.logger.lines.join('\n')).not.toContain(value.secretKey)
    expect(JSON.stringify(databaseRows)).not.toContain(value.secretKey)
    const backupPath = join(value.workspace.paths.backupsDirectory, 'l10-security-audit.sqlite')
    await value.workspace.database.backup(backupPath)
    expect(readFileSync(backupPath).toString('utf8')).not.toContain(value.secretKey)
    expect(workspaceText(value.workspace.paths.root)).not.toContain(value.secretKey)
    expect(workspaceText(value.workspace.paths.backupsDirectory)).not.toContain(value.secretKey)
    expect(statSync(value.workspace.paths.backupsDirectory).isDirectory()).toBe(true)
  })
})
