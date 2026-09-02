import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'

import { unzipSync } from 'fflate'

import type { SqliteDatabase } from '../db/migrations'
import { resolveManagedObjectPath } from '../files/managed-file-service'
import type { WorkspacePaths } from '../workspace/workspace-paths'
import type { SearchService } from '../search/search-service'
import type { MineruSettingsService } from '../ai/mineru-settings-service'
import type { MineruTaskState } from '../../shared/mineru-contracts'

export type MineruErrorCode =
  | 'MINERU_NOT_CONFIGURED'
  | 'MINERU_FILE_INVALID'
  | 'MINERU_FILE_TOO_LARGE'
  | 'MINERU_ALREADY_RUNNING'
  | 'MINERU_UPLOAD_FAILED'
  | 'MINERU_UPSTREAM'
  | 'MINERU_TIMEOUT'
  | 'MINERU_INVALID_RESPONSE'
  | 'MINERU_RESULT_INVALID'

export class MineruError extends Error {
  readonly code: MineruErrorCode

  constructor(code: MineruErrorCode, message: string) {
    super(message)
    this.name = 'MineruError'
    this.code = code
  }
}

export const MINERU_DEFAULT_API_BASE = 'https://mineru.net/api/v4'
export const MINERU_MAX_FILE_BYTES = 200 * 1024 * 1024
export const MINERU_POLL_INTERVAL_MS = 5_000
export const MINERU_POLL_TIMEOUT_MS = 30 * 60 * 1000

/** 上传对象仅限 managed 副本的 office/pdf/图片；外部根目录只读资料不经由此服务。 */
const ENHANCEABLE_MIME_PREFIXES = ['application/pdf', 'image/']
const ENHANCEABLE_MIME_EXACT = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

export interface MineruFetchResponse {
  readonly ok: boolean
  readonly status: number
  readonly arrayBuffer?: () => Promise<ArrayBuffer>
}

export interface MineruFetchLike {
  json<T>(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<T>
  data(url: string, init: { method: string; headers: Record<string, string>; body?: Buffer }): Promise<MineruFetchResponse>
}

export interface MineruServiceOptions {
  readonly apiBase?: string
  readonly pollIntervalMs?: number
  readonly pollTimeoutMs?: number
  readonly fetcher?: MineruFetchLike
  /** 测试注入：任务受理后同步推进（跳过真实定时器）。 */
  readonly pollDriver?: (poll: () => Promise<void>) => Promise<void>
}

interface TaskEntry {
  readonly fileId: string
  state: MineruTaskState
  message?: string
  timer?: ReturnType<typeof setTimeout>
  startedAt: number
}

interface BatchUploadResponse {
  readonly batch_id?: string
  readonly file_urls?: readonly string[]
  readonly code?: number
}

interface ExtractTaskResponse {
  readonly batch_id?: string
  readonly code?: number
}

interface ExtractResultResponse {
  readonly state?: string
  readonly err_msg?: string
  readonly full_zip_url?: string
  readonly code?: number
}

/** 下载域白名单：MinerU 官方域与实测 CDN 域（实现时以真实响应核实记录）。 */
const DOWNLOAD_HOST_ALLOWLIST: readonly ((host: string) => boolean)[] = [
  (host) => host === 'mineru.net' || host.endsWith('.mineru.net'),
  (host) => host.endsWith('.aliyuncs.com'),
]

export class MineruService {
  private readonly tasks = new Map<string, TaskEntry>()
  private closed = false

  constructor(
    private readonly database: SqliteDatabase,
    private readonly paths: WorkspacePaths,
    private readonly search: SearchService,
    private readonly settings: MineruSettingsService,
    private readonly options: MineruServiceOptions = {},
  ) {}

  close(): void {
    this.closed = true
    for (const task of this.tasks.values()) {
      if (task.timer !== undefined) clearTimeout(task.timer)
    }
    this.tasks.clear()
  }

  getStatus(fileId: string): { state: MineruTaskState; message?: string } {
    const task = this.tasks.get(fileId)
    if (task !== undefined) {
      return { state: task.state, ...(task.message === undefined ? {} : { message: task.message }) }
    }
    const row = this.database
      .prepare('SELECT index_status FROM files WHERE id = ? AND deleted_at IS NULL')
      .get(fileId) as { index_status: string } | undefined
    if (row === undefined) throw new MineruError('MINERU_FILE_INVALID', '文件不存在或已删除。')
    if (row.index_status === 'mineru_ready') return { state: 'done' }
    return { state: 'queued', message: '尚未进行增强解析。' }
  }

  async enhanceFile(fileId: string): Promise<{ accepted: true; state: MineruTaskState }> {
    if (this.closed) throw new MineruError('MINERU_UPSTREAM', '服务已关闭。')
    const existing = this.tasks.get(fileId)
    if (existing !== undefined && (existing.state === 'queued' || existing.state === 'running')) {
      throw new MineruError('MINERU_ALREADY_RUNNING', '该文件正在增强解析中。')
    }
    const token = this.settings.getToken()
    if (token === undefined) {
      throw new MineruError('MINERU_NOT_CONFIGURED', '请先在设置中配置 MinerU token。')
    }
    const file = this.requireEnhanceableFile(fileId)

    const entry: TaskEntry = { fileId, state: 'running', startedAt: Date.now() }
    this.tasks.set(fileId, entry)

    try {
      const contentPath = resolveManagedObjectPath(this.paths, fileId).contentPath
      const content = readFileSync(contentPath)
      const upload = await this.requestJson<BatchUploadResponse>('/file/upload-urls', {
        method: 'POST',
        headers: this.authHeaders(token),
        body: JSON.stringify({
          enable_formula: true,
          enable_table: true,
          model: 'vlm',
          language: 'ch',
          is_ocr: true,
          files: [{ name: file.originalName, size: content.byteLength }],
        }),
      })
      if (upload.code !== 0 || upload.batch_id === undefined || upload.file_urls?.[0] === undefined) {
        throw new MineruError('MINERU_UPLOAD_FAILED', '申请上传链接失败，请稍后重试。')
      }
      const uploadUrl = this.assertAllowedUrl(upload.file_urls[0])
      const putResponse = await this.fetcher.data(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.mimeType },
        body: content,
      })
      if (!putResponse.ok || putResponse.status >= 300) {
        throw new MineruError('MINERU_UPLOAD_FAILED', '上传文件失败，请稍后重试。')
      }
      const task = await this.requestJson<ExtractTaskResponse>('/extract/task', {
        method: 'POST',
        headers: this.authHeaders(token),
        body: JSON.stringify({ batch_id: upload.batch_id }),
      })
      if (task.code !== 0 || task.batch_id === undefined) {
        throw new MineruError('MINERU_UPSTREAM', '创建解析任务失败，请稍后重试。')
      }

      this.tasks.set(fileId, { ...entry, state: 'running' })
      const poll = async (): Promise<void> => this.pollOnce(fileId, token, upload.batch_id!)
      if (this.options.pollDriver !== undefined) {
        await this.options.pollDriver(poll)
      } else {
        this.schedulePoll(fileId, token, upload.batch_id)
      }
      return { accepted: true, state: 'running' }
    } catch (error) {
      const task = this.tasks.get(fileId)
      if (task !== undefined) this.tasks.set(fileId, { ...task, state: 'failed', message: errorMessage(error) })
      throw error
    }
  }

  private schedulePoll(fileId: string, token: string, batchId: string): void {
    const interval = this.options.pollIntervalMs ?? MINERU_POLL_INTERVAL_MS
    const timeout = this.options.pollTimeoutMs ?? MINERU_POLL_TIMEOUT_MS
    const timer = setTimeout(() => {
      void (async () => {
        const entry = this.tasks.get(fileId)
        if (entry === undefined || this.closed) return
        if (Date.now() - entry.startedAt > timeout) {
          this.finishFailure(fileId, 'MINERU_TIMEOUT', '解析超时（超过 30 分钟），已按解析失败处理。')
          return
        }
        await this.pollOnce(fileId, token, batchId).catch(() => {
          this.schedulePoll(fileId, token, batchId)
        })
      })()
    }, interval)
    const entry = this.tasks.get(fileId)
    if (entry !== undefined) this.tasks.set(fileId, { ...entry, timer })
  }

  private async pollOnce(fileId: string, token: string, batchId: string): Promise<void> {
    const result = await this.requestJson<ExtractResultResponse>(
      `/extract-results/batch/${encodeURIComponent(batchId)}`,
      { method: 'GET', headers: this.authHeaders(token) },
    )
    if (result.code !== 0) {
      throw new MineruError('MINERU_UPSTREAM', `查询解析结果失败（code ${result.code}）。`)
    }
    if (result.state === 'running' || result.state === 'pending') {
      const entry = this.tasks.get(fileId)
      if (entry !== undefined) this.tasks.set(fileId, { ...entry, state: 'running' })
      this.schedulePoll(fileId, token, batchId)
      return
    }
    if (result.state === 'done' && result.full_zip_url !== undefined) {
      await this.ingestResult(fileId, token, result.full_zip_url)
      return
    }
    if (result.state === 'failed') {
      this.finishFailure(fileId, 'MINERU_UPSTREAM', result.err_msg?.trim() || '云端解析失败。')
      return
    }
    // 未知状态：保持轮询，由 pollTimeout 兜底。
    this.schedulePoll(fileId, token, batchId)
  }

  private async ingestResult(fileId: string, token: string, zipUrl: string): Promise<void> {
    const allowedUrl = this.assertAllowedUrl(zipUrl)
    const response = await this.fetcher.data(allowedUrl, { method: 'GET', headers: this.authHeaders(token) })
    if (!response.ok || response.status >= 300 || response.arrayBuffer === undefined) {
      this.finishFailure(fileId, 'MINERU_RESULT_INVALID', '下载解析结果失败。')
      return
    }
    const zip = new Uint8Array(await response.arrayBuffer())
    let fullMd: string | null = null
    const tempDir = mkdtempSync(join(this.paths.cacheDirectory, 'mineru-'))
    try {
      // 解压在临时目录内进行；条目路径 resolve 后必须仍在临时目录内（防穿越）。
      const entries = unzipSync(zip)
      for (const [name, data] of Object.entries(entries)) {
        const target = resolve(tempDir, name)
        const relativePath = relative(tempDir, target)
        if (relativePath === '' || relativePath.startsWith('..') || /^[a-zA-Z]:/.test(relativePath)) {
          continue
        }
        if (name === 'full.md') {
          fullMd = new TextDecoder().decode(data)
        }
      }
      if (fullMd === null || fullMd.trim() === '') {
        this.finishFailure(fileId, 'MINERU_RESULT_INVALID', '解析结果缺少 full.md。')
        return
      }
      this.ingestMarkdown(fileId, fullMd)
      const entry = this.tasks.get(fileId)
      if (entry !== undefined) this.tasks.set(fileId, { ...entry, state: 'done' })
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }

  private ingestMarkdown(fileId: string, markdown: string): void {
    const file = this.requireEnhanceableFile(fileId)
    const contentHash = createHash('sha256').update(markdown, 'utf8').digest('hex')
    this.search.indexFile({
      id: file.id,
      originalName: file.originalName,
      contentHash,
      status: 'mineru_ready',
      chunks: buildMarkdownChunks(markdown),
    })
  }

  private finishFailure(fileId: string, code: MineruErrorCode, message: string): void {
    const entry = this.tasks.get(fileId)
    if (entry !== undefined) {
      if (entry.timer !== undefined) clearTimeout(entry.timer)
      this.tasks.set(fileId, { ...entry, state: 'failed', message })
    }
    if (code === 'MINERU_TIMEOUT') {
      const file = this.database
        .prepare('SELECT original_name FROM files WHERE id = ?')
        .get(fileId) as { original_name: string } | undefined
      this.search.indexFile({ id: fileId, originalName: file?.original_name ?? fileId, status: 'parse_failed' })
    }
  }

  private requireEnhanceableFile(fileId: string): { readonly id: string; readonly originalName: string; readonly sizeBytes: number; readonly mimeType: string } {
    const record = this.database
      .prepare('SELECT id, original_name, size_bytes, mime_type, deleted_at FROM files WHERE id = ?')
      .get(fileId) as { id: string; original_name: string; size_bytes: number; mime_type: string; deleted_at: string | null } | undefined
    if (record === undefined || record.deleted_at !== null) {
      throw new MineruError('MINERU_FILE_INVALID', '文件不存在或已删除。')
    }
    if (record.size_bytes > MINERU_MAX_FILE_BYTES) {
      throw new MineruError('MINERU_FILE_TOO_LARGE', '文件超过 200MB，暂不支持增强解析。')
    }
    const enhanceable = ENHANCEABLE_MIME_PREFIXES.some((prefix) => record.mime_type.startsWith(prefix)) ||
      ENHANCEABLE_MIME_EXACT.has(record.mime_type)
    if (!enhanceable) {
      throw new MineruError('MINERU_FILE_INVALID', '仅支持对 Office/PDF/图片文件进行增强解析。')
    }
    return {
      id: record.id,
      originalName: record.original_name,
      sizeBytes: record.size_bytes,
      mimeType: record.mime_type,
    }
  }

  private authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` }
  }

  private assertAllowedUrl(rawUrl: string): string {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new MineruError('MINERU_RESULT_INVALID', '解析结果地址协议不受支持。')
    }
    if (!DOWNLOAD_HOST_ALLOWLIST.some((allows) => allows(url.hostname))) {
      throw new MineruError('MINERU_RESULT_INVALID', '解析结果地址不在允许的下载域内。')
    }
    return url.toString()
  }

  private get fetcher(): MineruFetchLike {
    return this.options.fetcher ?? defaultMineruFetcher
  }

  private async requestJson<T>(path: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<T> {
    const base = (this.options.apiBase ?? MINERU_DEFAULT_API_BASE).replace(/\/+$/, '')
    return this.fetcher.json<T>(`${base}${path}`, init)
  }
}

/** 把 full.md 切成搜索 chunk（沿用段落切分，不引入新分词策略）。 */
function buildMarkdownChunks(markdown: string): { text: string; ordinal: number }[] {
  const paragraphs = markdown.split(/\n{2,}/u).map((part) => part.trim()).filter((part) => part !== '')
  if (paragraphs.length === 0) return [{ text: markdown, ordinal: 0 }]
  return paragraphs.map((text, index) => ({ text, ordinal: index }))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误。'
}

const defaultMineruFetcher: MineruFetchLike = {
  async json<T>(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<T> {
    const response = await fetch(url, {
      method: init.method,
      headers: { ...init.headers, ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(init.body === undefined ? {} : { body: init.body }),
    })
    return (await response.json()) as T
  },
  async data(url: string, init: { method: string; headers: Record<string, string>; body?: Buffer }): Promise<MineruFetchResponse> {
    const response = await fetch(url, {
      method: init.method,
      headers: init.headers,
      ...(init.body === undefined ? {} : { body: new Uint8Array(init.body) }),
    })
    return { ok: response.ok, status: response.status, arrayBuffer: () => response.arrayBuffer() }
  },
}
