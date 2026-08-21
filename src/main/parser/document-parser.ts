import { Worker } from 'node:worker_threads'

import { resolveManagedObjectPath } from '../files/managed-file-service'
import type { SqliteDatabase } from '../db/migrations'
import type { WorkspacePaths } from '../workspace/workspace-paths'
import { SearchService } from '../search/search-service'
import type { SearchChunkInput, SearchIndexStatus } from '../../shared/search-contracts'

export interface DocumentParserPosition {
  readonly type: string
  readonly value?: string | number
}

export interface ParsedDocumentChunk {
  readonly text: string
  readonly position?: DocumentParserPosition
  readonly heading?: string
  readonly ordinal: number
}

export interface ParsedDocument {
  readonly text: string
  readonly chunks: readonly ParsedDocumentChunk[]
  readonly parseStatus: SearchIndexStatus
  readonly contentHash: string | null
  readonly sizeBytes: number | null
  readonly mtimeMs: number | null
  readonly parserErrorCode?: string
}

interface FileRow {
  readonly id: string
  readonly original_name: string
  readonly deleted_at: string | null
}

interface WorkerResult extends ParsedDocument {
  readonly type: 'result'
  readonly requestId: number
}

interface WorkerFailure {
  readonly type: 'failure'
  readonly requestId: number
  readonly message: string
}

type WorkerMessage = WorkerResult | WorkerFailure

interface WorkerRequest {
  readonly type: 'parse'
  readonly requestId: number
  readonly filePath: string
  readonly originalName: string
}

export interface IndexedFileResult {
  readonly fileId: string
  readonly status: SearchIndexStatus
  readonly contentHash: string | null
  readonly chunkCount: number
  readonly parserErrorCode?: string
}

interface QueueTask {
  readonly fileId: string
  readonly resolve: (result: IndexedFileResult) => void
  readonly reject: (error: unknown) => void
}

export interface DocumentIndexWorkerOptions {
  readonly workerFactory?: () => Worker
}

/**
 * One sequential parser/index worker. The queue is intentionally in memory;
 * startup rescans workspace files so a crashed item can be retried from zero.
 */
export class DocumentIndexWorker {
  private readonly queue: QueueTask[] = []
  private readonly pendingByFile = new Map<string, Promise<IndexedFileResult>>()
  private readonly workerFactory: () => Worker
  private worker: Worker | null = null
  private activeRequest: {
    readonly requestId: number
    readonly resolve: (result: ParsedDocument) => void
    readonly reject: (error: unknown) => void
  } | null = null
  private requestSequence = 0
  private pumping = false
  private closed = false
  private paused = false

  constructor(
    private readonly workspaceDatabase: SqliteDatabase,
    private readonly searchService: SearchService,
    private readonly paths: WorkspacePaths,
    options: DocumentIndexWorkerOptions = {},
  ) {
    this.workerFactory = options.workerFactory ?? (() => new Worker(DOCUMENT_PARSER_WORKER_SOURCE, { eval: true }))
  }

  enqueue(fileId: string): Promise<IndexedFileResult> {
    if (this.closed || this.paused) {
      return Promise.reject(new Error('Document index worker is closed'))
    }
    const existing = this.pendingByFile.get(fileId)
    if (existing !== undefined) {
      return existing
    }

    const promise = new Promise<IndexedFileResult>((resolve, reject) => {
      this.queue.push({ fileId, resolve, reject })
      void this.pump()
    })
    this.pendingByFile.set(fileId, promise)
    void promise.then(
      () => this.clearPending(fileId, promise),
      () => this.clearPending(fileId, promise),
    )
    return promise
  }

  private clearPending(fileId: string, promise: Promise<IndexedFileResult>): void {
    if (this.pendingByFile.get(fileId) === promise) {
      this.pendingByFile.delete(fileId)
    }
  }

  enqueueIfNeeded(fileId: string): Promise<IndexedFileResult> | null {
    const row = this.workspaceDatabase
      .prepare(
        `SELECT content_hash, indexed_hash, index_status, deleted_at
           FROM files
          WHERE id = ?`,
      )
      .get(fileId) as {
      content_hash: string | null
      indexed_hash: string | null
      index_status: SearchIndexStatus
      deleted_at: string | null
    } | undefined
    if (
      row === undefined ||
      row.deleted_at !== null ||
      (row.indexed_hash !== null &&
        row.content_hash !== null &&
        row.indexed_hash === row.content_hash &&
        row.index_status !== 'pending')
    ) {
      return null
    }
    return this.enqueue(fileId)
  }

  async rebuildPending(): Promise<IndexedFileResult[]> {
    const rows = this.workspaceDatabase
      .prepare(
        `SELECT id
           FROM files
          WHERE deleted_at IS NULL
            AND (
              index_status = 'pending'
              OR indexed_hash IS NULL
              OR content_hash IS NULL
              OR indexed_hash <> content_hash
            )
          ORDER BY created_at, id`,
      )
      .all() as Array<{ id: string }>
    const results: IndexedFileResult[] = []
    for (const row of rows) {
      results.push(await this.enqueue(row.id))
    }
    return results
  }

  async close(): Promise<void> {
    this.closed = true
    this.queue.splice(0).forEach((task) => {
      task.reject(new Error('Document index worker closed'))
    })
    if (this.activeRequest !== null) {
      this.activeRequest.reject(new Error('Document index worker closed'))
      this.activeRequest = null
    }
    if (this.worker !== null) {
      this.worker.removeAllListeners()
      await this.worker.terminate()
      this.worker = null
    }
  }

  async pause(): Promise<void> {
    this.paused = true
    while (this.pumping) {
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
  }

  resume(): void {
    if (this.closed) return
    this.paused = false
    void this.pump()
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.closed || this.paused) {
      return
    }
    this.pumping = true
    try {
      while (!this.closed && !this.paused && this.queue.length > 0) {
        const task = this.queue.shift()!
        try {
          task.resolve(await this.processFile(task.fileId))
        } catch (error) {
          task.reject(error)
        }
      }
    } finally {
      this.pumping = false
    }
  }

  private async processFile(fileId: string): Promise<IndexedFileResult> {
    const file = this.workspaceDatabase
      .prepare('SELECT id, original_name, deleted_at FROM files WHERE id = ?')
      .get(fileId) as FileRow | undefined
    if (file === undefined) {
      throw new Error('登记的文件不存在。')
    }
    if (file.deleted_at !== null) {
      throw new Error('文件已删除。')
    }

    const contentPath = resolveManagedObjectPath(this.paths, file.id).contentPath
    let parsed: ParsedDocument
    try {
      parsed = await this.runWorker(contentPath, file.original_name)
    } catch (error) {
      parsed = {
        text: '',
        chunks: [],
        parseStatus: 'parse_failed',
        contentHash: null,
        sizeBytes: null,
        mtimeMs: null,
        parserErrorCode: error instanceof Error ? error.name : 'WORKER_FAILURE',
      }
    }
    if (this.closed) {
      throw new Error('Document index worker closed')
    }

    if (parsed.contentHash !== null && parsed.sizeBytes !== null && parsed.mtimeMs !== null) {
      this.workspaceDatabase
        .prepare(
          `UPDATE files
              SET size_bytes = ?, mtime_ms = ?, content_hash = ?
            WHERE id = ?`,
        )
        .run(parsed.sizeBytes, parsed.mtimeMs, parsed.contentHash, file.id)
    }

    const chunks: SearchChunkInput[] = parsed.chunks.map((chunk) => ({
      text: chunk.text,
      ordinal: chunk.ordinal,
      ...(chunk.position === undefined ? {} : { position: chunk.position }),
    }))
    this.searchService.indexFile({
      id: file.id,
      originalName: file.original_name,
      contentHash: parsed.contentHash,
      chunks,
      status: parsed.parseStatus,
    })
    return {
      fileId: file.id,
      status: parsed.parseStatus,
      contentHash: parsed.contentHash,
      chunkCount: chunks.length,
      ...(parsed.parserErrorCode === undefined ? {} : { parserErrorCode: parsed.parserErrorCode }),
    }
  }

  private runWorker(filePath: string, originalName: string): Promise<ParsedDocument> {
    const worker = this.ensureWorker()
    const requestId = ++this.requestSequence
    return new Promise<ParsedDocument>((resolve, reject) => {
      this.activeRequest = { requestId, resolve, reject }
      const onMessage = (message: WorkerMessage): void => {
        if (message.requestId !== requestId || this.activeRequest?.requestId !== requestId) {
          return
        }
        worker.off('message', onMessage)
        worker.off('error', onError)
        worker.off('exit', onExit)
        this.activeRequest = null
        if (message.type === 'failure') {
          reject(new Error(message.message))
        } else {
          resolve(message)
        }
      }
      const onError = (error: Error): void => {
        if (this.activeRequest?.requestId !== requestId) {
          return
        }
        worker.off('message', onMessage)
        worker.off('error', onError)
        worker.off('exit', onExit)
        this.activeRequest = null
        this.worker = null
        reject(error)
      }
      const onExit = (code: number): void => {
        if (code !== 0 && this.activeRequest?.requestId === requestId) {
          onError(new Error(`Document parser worker exited with code ${code}`))
        }
      }
      worker.on('message', onMessage)
      worker.on('error', onError)
      worker.on('exit', onExit)
      const request: WorkerRequest = { type: 'parse', requestId, filePath, originalName }
      worker.postMessage(request)
    })
  }

  private ensureWorker(): Worker {
    if (this.worker === null) {
      this.worker = this.workerFactory()
    }
    return this.worker
  }
}

const DOCUMENT_PARSER_WORKER_SOURCE = String.raw`
const { parentPort } = require('node:worker_threads')
const { createHash } = require('node:crypto')
const { createReadStream, readFileSync, statSync } = require('node:fs')
const { extname } = require('node:path')

function hashFile(filePath) {
  const hash = createHash('sha256')
  const stream = createReadStream(filePath)
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function textChunks(text) {
  return text
    .split(/\r?\n/gu)
    .map((line, index) => ({
      text: line,
      ordinal: index,
      position: { type: 'line', value: index + 1 },
    }))
    .filter((chunk) => chunk.text.trim().length > 0)
}

function parserPosition(metadata, sourceType) {
  if (typeof metadata?.pageNumber === 'number') return { type: 'page', value: metadata.pageNumber }
  if (typeof metadata?.slideNumber === 'number') return { type: 'slide', value: metadata.slideNumber }
  if (typeof metadata?.sheetName === 'string') return { type: 'sheet', value: metadata.sheetName }
  if (typeof metadata?.closestHeading === 'string') return { type: 'heading', value: metadata.closestHeading }
  return { type: sourceType }
}

function parserFileType(originalName) {
  const extension = extname(originalName).toLowerCase().slice(1)
  return ['docx', 'pptx', 'pdf', 'xlsx'].includes(extension) ? extension : null
}

async function parseOffice(filePath, originalName) {
  const { OfficeParser } = require('officeparser')
  const fileType = parserFileType(originalName)
  const ast = await OfficeParser.parseOffice(filePath, {
    ocr: false,
    extractAttachments: false,
    includeRawContent: false,
    ignoreSlideMasters: true,
    ...(fileType === null ? {} : { fileType }),
  })
  const textResult = await ast.to('text', {
    includeImages: false,
    renderMetadata: false,
    textConfig: { preserveLayout: true },
  })
  const chunkResult = await ast.to('chunks', {
    strategy: 'document-structure',
    maxChunkSize: 1000,
    chunkOverlap: 0,
    includeMetadata: true,
  })
  const text = typeof textResult.value === 'string' ? textResult.value : ''
  const chunks = Array.isArray(chunkResult.value)
    ? chunkResult.value
        .filter((chunk) => typeof chunk?.text === 'string' && chunk.text.trim().length > 0)
        .map((chunk, index) => ({
          text: chunk.text,
          ordinal: index,
          position: parserPosition(chunk.metadata, ast.type),
          heading: typeof chunk.metadata?.closestHeading === 'string' ? chunk.metadata.closestHeading : undefined,
        }))
    : []
  return { text, chunks }
}

async function parseFile(filePath, originalName) {
  const extension = extname(originalName).toLowerCase()
  if (extension === '.txt' || extension === '.md') {
    const text = readFileSync(filePath, 'utf8')
    return { text, chunks: textChunks(text) }
  }
  return parseOffice(filePath, originalName)
}

parentPort.on('message', async (request) => {
  if (request?.type !== 'parse') return
  let stats
  let contentHash
  try {
    stats = statSync(request.filePath)
    contentHash = await hashFile(request.filePath)
  } catch (error) {
    parentPort.postMessage({
      type: 'result',
      requestId: request.requestId,
      text: '',
      chunks: [],
      parseStatus: 'parse_failed',
      contentHash: null,
      sizeBytes: null,
      mtimeMs: null,
      parserErrorCode: typeof error?.name === 'string' ? error.name : 'HASH_FAILED',
    })
    return
  }
  try {
    const parsed = await parseFile(request.filePath, request.originalName)
    const hasText = parsed.text.trim().length > 0 || parsed.chunks.some((chunk) => chunk.text.trim().length > 0)
    parentPort.postMessage({
      type: 'result',
      requestId: request.requestId,
      text: parsed.text,
      chunks: parsed.chunks,
      parseStatus: hasText ? 'indexed' : 'no_text',
      contentHash,
      sizeBytes: stats.size,
      mtimeMs: stats.mtimeMs,
    })
  } catch (error) {
    parentPort.postMessage({
      type: 'result',
      requestId: request.requestId,
      text: '',
      chunks: [],
      parseStatus: 'parse_failed',
      contentHash,
      sizeBytes: stats.size,
      mtimeMs: stats.mtimeMs,
      parserErrorCode: typeof error?.name === 'string' ? error.name : 'PARSE_FAILED',
    })
  }
})
`
