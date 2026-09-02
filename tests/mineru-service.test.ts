import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'

import {
  MINERU_MAX_FILE_BYTES,
  MineruError,
  MineruService,
  type MineruFetchLike,
  type MineruFetchResponse,
} from '../src/main/parser/mineru-service'
import { MineruSettingsService } from '../src/main/ai/mineru-settings-service'
import type { SecureStoragePort } from '../src/main/ai/secure-storage'
import { runMigrations, workspaceMigrations, type SqliteDatabase } from '../src/main/db/migrations'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { openSearchDatabase } from '../src/main/search/search-database'
import { SearchService } from '../src/main/search/search-service'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'

const roots: string[] = []
const workspaces: WorkspaceHandle[] = []
const searchDatabases: { close(): void }[] = []

afterEach(() => {
  for (const workspace of workspaces.splice(0)) workspace.close()
  for (const searchDatabase of searchDatabases.splice(0)) searchDatabase.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

interface Fixture {
  readonly database: SqliteDatabase
  readonly managedFiles: ManagedFileService
  readonly search: SearchService
  readonly settings: MineruSettingsService
  readonly workspace: WorkspaceHandle
  readonly sourceDir: string
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-v16d-svc-'))
  roots.push(root)
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  workspaces.push(workspace)
  runMigrations(workspace.database.raw, workspaceMigrations)
  let encryptedValue: Buffer | undefined
  const secure: SecureStoragePort = {
    isAvailable: () => true,
    encrypt: (value) => Buffer.from(value.split('').reverse().join(''), 'utf8'),
    decrypt: (value) => value.toString('utf8').split('').reverse().join(''),
    read: () => encryptedValue,
    write: (value) => { encryptedValue = value },
    clear: () => { encryptedValue = undefined },
  }
  const settings = new MineruSettingsService(secure)
  settings.updateSettings({ token: 'MINERU_TEST_TOKEN' })
  const searchDatabase = openSearchDatabase(workspace.paths)
  searchDatabases.push(searchDatabase)
  const search = new SearchService(workspace.database.raw, searchDatabase.raw, workspace.paths)
  const managedFiles = new ManagedFileService(workspace.database.raw, workspace.paths)
  const sourceDir = join(root, 'sources')
  mkdirSync(sourceDir, { recursive: true })
  return { database: workspace.database.raw, managedFiles, search, settings, workspace, sourceDir }
}

function importFile(files: ManagedFileService, sourceDir: string, name: string, content: Buffer): string {
  const source = join(sourceDir, name)
  writeFileSync(source, content)
  return files.importFile(source).id
}

/** 用 zip 构造 MinerU 结果包。 */
function buildResultZip(entries: Record<string, string>): Buffer {
  const encoded: Record<string, Uint8Array> = {}
  for (const [name, text] of Object.entries(entries)) {
    encoded[name] = new TextEncoder().encode(text)
  }
  return Buffer.from(zipSync(encoded))
}

interface Call {
  readonly url: string
  readonly method: string
  readonly body?: string
  readonly headers: Record<string, string>
}

function fakeFetcher(handlers: {
  uploadUrls?: (call: Call) => unknown
  extractTask?: (call: Call) => unknown
  extractResult?: (call: Call) => unknown
  download?: (call: Call) => MineruFetchResponse
}): { fetcher: MineruFetchLike; calls: Call[] } {
  const calls: Call[] = []
  const fetcher: MineruFetchLike = {
    async json<T>(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<T> {
      const call: Call = { url, method: init.method, body: init.body, headers: init.headers }
      calls.push(call)
      if (url.endsWith('/file/upload-urls')) {
        return (handlers.uploadUrls?.(call) ?? {
          code: 0,
          batch_id: 'batch-1',
          file_urls: ['https://cdn.mineru.net/upload-1?sig=abc'],
        }) as T
      }
      if (url.endsWith('/extract/task')) {
        return (handlers.extractTask?.(call) ?? { code: 0, batch_id: 'batch-1' }) as T
      }
      return (handlers.extractResult?.(call) ?? {
        code: 0,
        state: 'done',
        full_zip_url: 'https://cdn.mineru.net/results/batch-1.zip',
      }) as T
    },
    async data(url: string, init: { method: string; headers: Record<string, string>; body?: Buffer }): Promise<MineruFetchResponse> {
      const call: Call = { url, method: init.method, headers: init.headers }
      calls.push(call)
      if (init.method === 'PUT') {
        return { ok: true, status: 200 }
      }
      const zip = buildResultZip({
        'full.md': '# 解析结果\n\n$\\frac{1}{2}$ 公式保留。',
        'layout.pdf': 'ignored',
      })
      const buffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength)
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buffer as ArrayBuffer,
      }
    },
  }
  return { fetcher, calls }
}

describe('V16-D MineruService (D24)', () => {
  it('runs the full pipeline: upload → task → poll → zip download → full.md → search index mineru_ready', async () => {
    const { database, managedFiles, search, settings, workspace, sourceDir } = fixture()
    const fileId = importFile(managedFiles, sourceDir, '扫描习题.pdf', Buffer.from('%PDF-fake'))
    const { fetcher, calls } = fakeFetcher({})
    const service = new MineruService(database, workspace.paths, search, settings, {
      fetcher,
      pollDriver: async (poll) => { await poll() },
    })

    const accepted = await service.enhanceFile(fileId)
    expect(accepted).toEqual({ accepted: true, state: 'running' })

    const status = service.getStatus(fileId)
    expect(status).toEqual({ state: 'done' })

    // files 表进入 mineru_ready；chunk 进入 search.db
    const row = database
      .prepare('SELECT index_status FROM files WHERE id = ?')
      .get(fileId) as { index_status: string }
    expect(row.index_status).toBe('mineru_ready')

    const context = search.getFileContext(fileId)
    expect(context.chunks.length).toBeGreaterThan(0)
    expect(context.chunks.some((chunk) => chunk.text.includes('解析结果'))).toBe(true)

    // 请求序：upload-urls → PUT → extract/task → extract-results；token 仅注入 Authorization 头
    const jsonCalls = calls.filter((call) => call.url.includes('mineru.net/api/v4/'))
    expect(jsonCalls.map((call) => call.url.split('/api/v4').at(-1))).toEqual([
      '/file/upload-urls',
      '/extract/task',
      '/extract-results/batch/batch-1',
    ])
    expect(jsonCalls.every((call) => call.headers.Authorization === 'Bearer MINERU_TEST_TOKEN')).toBe(true)
    expect(calls.some((call) => call.method === 'PUT' && call.url === 'https://cdn.mineru.net/upload-1?sig=abc')).toBe(true)
    service.close()
  })

  it('rejects non-enhanceable files, oversized files, and missing token', async () => {
    const { database, managedFiles, search, settings, workspace, sourceDir } = fixture()
    const { fetcher } = fakeFetcher({})
    const service = new MineruService(database, workspace.paths, search, settings, { fetcher })

    const mdId = importFile(managedFiles, sourceDir, '笔记.md', Buffer.from('# 笔记'))
    await expect(service.enhanceFile(mdId)).rejects.toMatchObject({ code: 'MINERU_FILE_INVALID' })

    const hugeId = importFile(managedFiles, sourceDir, '巨文件.pdf', Buffer.from('%PDF'))
    database
      .prepare('UPDATE files SET size_bytes = ? WHERE id = ?')
      .run(MINERU_MAX_FILE_BYTES + 1, hugeId)
    await expect(service.enhanceFile(hugeId)).rejects.toMatchObject({ code: 'MINERU_FILE_TOO_LARGE' })

    expect(() => service.getStatus('file-not-exist')).toThrow(MineruError)

    const noTokenSettings = new MineruSettingsService({
      isAvailable: () => false,
      encrypt: () => { throw new Error('unavailable') },
      decrypt: () => { throw new Error('unavailable') },
      read: () => undefined,
      write: () => undefined,
      clear: () => undefined,
    })
    const noTokenService = new MineruService(database, workspace.paths, search, noTokenSettings, { fetcher })
    await expect(noTokenService.enhanceFile(hugeId)).rejects.toMatchObject({ code: 'MINERU_NOT_CONFIGURED' })
    service.close()
  })

  it('keeps polling while the cloud task is running and finishes when done', async () => {
    const { database, managedFiles, search, settings, workspace, sourceDir } = fixture()
    const fileId = importFile(managedFiles, sourceDir, '讲义.docx', Buffer.from('docx-bytes'))
    let polls = 0
    const { fetcher } = fakeFetcher({
      extractResult: () => {
        polls += 1
        return polls < 3 ? { code: 0, state: 'running' } : { code: 0, state: 'done', full_zip_url: 'https://cdn.mineru.net/results/batch-1.zip' }
      },
    })
    const service = new MineruService(database, workspace.paths, search, settings, {
      fetcher,
      pollDriver: async (poll) => {
        await poll()
        await poll()
        await poll()
      },
    })

    await service.enhanceFile(fileId)
    expect(polls).toBe(3)
    expect(service.getStatus(fileId)).toEqual({ state: 'done' })
    service.close()
  })

  it('marks the task failed with the cloud error message when extraction fails', async () => {
    const { database, managedFiles, search, settings, workspace, sourceDir } = fixture()
    const fileId = importFile(managedFiles, sourceDir, '坏文件.pdf', Buffer.from('%PDF'))
    const { fetcher } = fakeFetcher({
      extractResult: () => ({ code: 0, state: 'failed', err_msg: '页面无法识别' }),
    })
    const service = new MineruService(database, workspace.paths, search, settings, {
      fetcher,
      pollDriver: async (poll) => { await poll() },
    })

    await service.enhanceFile(fileId)
    const status = service.getStatus(fileId)
    expect(status.state).toBe('failed')
    expect(status.message).toBe('页面无法识别')
    service.close()
  })

  it('rejects downloads from hosts outside the allowlist', async () => {
    const { database, managedFiles, search, settings, workspace, sourceDir } = fixture()
    const fileId = importFile(managedFiles, sourceDir, '外链.pdf', Buffer.from('%PDF'))
    const { fetcher } = fakeFetcher({
      extractResult: () => ({ code: 0, state: 'done', full_zip_url: 'https://evil.example.com/results.zip' }),
    })
    const service = new MineruService(database, workspace.paths, search, settings, {
      fetcher,
      pollDriver: async (poll) => { await poll() },
    })

    await expect(service.enhanceFile(fileId)).rejects.toMatchObject({ code: 'MINERU_RESULT_INVALID' })
    expect(service.getStatus(fileId).state).toBe('failed')
    service.close()
  })

  it('blocks duplicate submissions while a task is running', async () => {
    const { database, managedFiles, search, settings, workspace, sourceDir } = fixture()
    const fileId = importFile(managedFiles, sourceDir, '重复.pdf', Buffer.from('%PDF'))
    const { fetcher } = fakeFetcher({})
    const service = new MineruService(database, workspace.paths, search, settings, {
      fetcher,
      pollDriver: async () => {
        // 模拟任务长期运行中
      },
    })

    const first = await service.enhanceFile(fileId)
    expect(first.state).toBe('running')
    await expect(service.enhanceFile(fileId)).rejects.toMatchObject({ code: 'MINERU_ALREADY_RUNNING' })
    service.close()
  })
})
