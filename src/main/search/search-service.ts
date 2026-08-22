import { resolveManagedObjectPath } from '../files/managed-file-service'
import type { SqliteDatabase } from '../db/migrations'
import type { WorkspacePaths } from '../workspace/workspace-paths'
import type {
  SearchChunkInput,
  SearchFileInput,
  SearchHit,
  SearchIndexStatus,
  SearchNodeInput,
  SearchNoteInput,
  SearchPosition,
  SearchQuery,
  SearchSourceType,
  SearchIndexStatusSummary,
} from '../../shared/search-contracts'
import {
  isShortSearchText,
  normalizeSearchText,
  quoteFtsPhrase,
} from './search-normalizer'

export type { SearchChunkInput, SearchFileInput, SearchHit, SearchIndexStatus, SearchNodeInput, SearchNoteInput, SearchPosition, SearchQuery, SearchSourceType }

export interface SearchFileContext {
  readonly fileId: string
  readonly chunks: readonly SearchChunkInput[]
}

export type SearchServiceErrorCode =
  | 'INVALID_QUERY'
  | 'INVALID_SOURCE'
  | 'FILE_NOT_FOUND'
  | 'FILE_DELETED'
  | 'SEARCH_INDEX_FAILED'

export class SearchServiceError extends Error {
  readonly code: SearchServiceErrorCode

  constructor(code: SearchServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SearchServiceError'
    this.code = code
  }
}

interface FileRow {
  readonly id: string
  readonly original_name: string
  readonly content_hash: string | null
  readonly indexed_hash: string | null
  readonly index_status: SearchIndexStatus
  readonly deleted_at: string | null
}

interface NodeRow {
  readonly id: string
  readonly parent_id: string | null
  readonly title: string
  readonly content_md: string
  readonly deleted_at: string | null
}

interface NoteRow {
  readonly id: string
  readonly student_id: string | null
  readonly lesson_id: string | null
  readonly body_md: string
  readonly deleted_at: string | null
}

interface SearchDocumentRow {
  readonly document_id: string
  readonly source_type: SearchSourceType
  readonly source_id: string
  readonly file_id: string | null
  readonly title: string
  readonly filename: string | null
  readonly path: string | null
  readonly content_hash: string | null
  readonly index_status: SearchIndexStatus
}

interface SearchChunkRow {
  readonly chunk_id: number
  readonly document_id: string
  readonly position_type: string | null
  readonly position_value: string | null
  readonly position_value_type: 'string' | 'number' | null
  readonly original_text: string
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const MAX_QUERY_LENGTH = 2048

export class SearchService {
  constructor(
    private readonly workspaceDatabase: SqliteDatabase,
    private readonly searchDatabase: SqliteDatabase,
    private readonly paths: WorkspacePaths,
  ) {}

  indexFile(input: SearchFileInput): void {
    const file = this.requireFile(input.id)
    const status = input.status ?? (input.chunks?.some((chunk) => chunk.text.trim()) ? 'indexed' : 'pending')
    const contentHash = input.contentHash ?? file.content_hash
    const originalName = file.original_name
    const title = input.title?.trim() || originalName
    const chunks = normalizeChunks(input.chunks ?? [])
    const documentId = makeDocumentId('file', input.id)

    if (
      file.indexed_hash === contentHash &&
      file.index_status === status &&
      this.hasDocument(documentId)
    ) {
      return
    }

    this.replaceDocument(
      {
        documentId,
        sourceType: 'file',
        sourceId: input.id,
        fileId: input.id,
        title,
        filename: originalName,
        path: resolveManagedObjectPath(this.paths, input.id).contentPath,
        contentHash,
        indexStatus: status,
      },
      chunks,
      this.resolveFileScopes(input.id),
    )

    this.workspaceDatabase
      .prepare(
        `UPDATE files
            SET indexed_hash = ?, index_status = ?
          WHERE id = ?`,
      )
      .run(contentHash, status, input.id)
  }

  getFileContext(fileId: string): SearchFileContext {
    this.requireFile(fileId)
    const documentId = makeDocumentId('file', fileId)
    const rows = this.searchDatabase
      .prepare(
        `SELECT ordinal, position_type, position_value, position_value_type, original_text
           FROM search_chunks
          WHERE document_id = ?
          ORDER BY ordinal, chunk_id`,
      )
      .all(documentId) as Array<{
        ordinal: number
        position_type: string | null
        position_value: string | null
        position_value_type: 'string' | 'number' | null
        original_text: string
      }>
    return {
      fileId,
      chunks: rows.map((row) => ({
        text: row.original_text,
        ordinal: row.ordinal,
        ...(row.position_type === null
          ? {}
          : { position: toSearchPosition(row.position_type, row.position_value, row.position_value_type) }),
      })),
    }
  }

  assertFileAvailable(fileId: string): void {
    this.requireFile(fileId)
  }

  indexNode(input: SearchNodeInput): void {
    const node = this.findNode(input.id)
    if (node === undefined || node.deleted_at !== null) {
      this.removeFromIndex('node', input.id)
      return
    }
    const title = node.title
    const body = node.content_md
    this.replaceDocument(
      {
        documentId: makeDocumentId('node', input.id),
        sourceType: 'node',
        sourceId: input.id,
        fileId: null,
        title,
        filename: null,
        path: this.resolveNodePath(input.id),
        contentHash: null,
        indexStatus: body.trim() ? 'indexed' : 'no_text',
      },
      body.trim() ? [{ text: body, ordinal: 0 }] : [],
      this.resolveNodeScopes(input.id),
    )
  }

  indexNote(input: SearchNoteInput): void {
    const note = this.findNote(input.id)
    if (note === undefined || note.deleted_at !== null) {
      this.removeFromIndex('note', input.id)
      return
    }
    const title = input.title?.trim() || '记录'
    const body = note.body_md
    this.replaceDocument(
      {
        documentId: makeDocumentId('note', input.id),
        sourceType: 'note',
        sourceId: input.id,
        fileId: null,
        title,
        filename: null,
        path: this.resolveNotePath(input.id),
        contentHash: null,
        indexStatus: body.trim() ? 'indexed' : 'no_text',
      },
      body.trim() ? [{ text: body, ordinal: 0 }] : [],
      this.resolveNoteScopes(input.id),
    )
  }

  replaceFileChunks(
    fileId: string,
    contentHash: string | null,
    chunks: readonly SearchChunkInput[],
    status: SearchIndexStatus = chunks.some((chunk) => chunk.text.trim()) ? 'indexed' : 'no_text',
  ): void {
    const file = this.requireFile(fileId)
    this.indexFile({
      id: file.id,
      originalName: file.original_name,
      contentHash,
      chunks,
      status,
    })
  }

  removeFromIndex(sourceType: SearchSourceType, sourceId: string): void {
    if (!isSourceType(sourceType) || typeof sourceId !== 'string' || sourceId.trim() === '') {
      throw new SearchServiceError('INVALID_SOURCE', '搜索来源无效。')
    }
    const documentId = makeDocumentId(sourceType, sourceId)
    this.withSearchTransaction(() => this.deleteDocument(documentId))
    if (sourceType === 'file') {
      this.workspaceDatabase
        .prepare(
          `UPDATE files
              SET indexed_hash = NULL, index_status = 'pending'
            WHERE id = ?`,
        )
        .run(sourceId)
    }
  }

  removeFileFromIndex(fileId: string): void {
    this.removeFromIndex('file', fileId)
  }

  getIndexState(fileId: string): { readonly indexedHash: string | null; readonly status: SearchIndexStatus } {
    const row = this.requireFile(fileId)
    return { indexedHash: row.indexed_hash, status: row.index_status }
  }

  getIndexStatusSummary(): SearchIndexStatusSummary {
    const counts = this.workspaceDatabase
      .prepare(
        `SELECT index_status AS status, COUNT(*) AS count
           FROM files
          WHERE deleted_at IS NULL
          GROUP BY index_status`,
      )
      .all() as Array<{ status: SearchIndexStatus; count: number }>
    const byStatus = new Map(counts.map((row) => [row.status, row.count]))
    return {
      total: counts.reduce((sum, row) => sum + row.count, 0),
      pending: byStatus.get('pending') ?? 0,
      indexed: byStatus.get('indexed') ?? 0,
      noText: byStatus.get('no_text') ?? 0,
      parseFailed: byStatus.get('parse_failed') ?? 0,
      updatedAt: new Date().toISOString(),
    }
  }

  clearDerivedIndex(): void {
    this.withSearchTransaction(() => {
      this.searchDatabase.exec(`
        DELETE FROM search_chunks_fts;
        DELETE FROM search_chunks;
        DELETE FROM search_document_scopes;
        DELETE FROM search_documents;
      `)
    })
    this.workspaceDatabase.exec(
      `UPDATE files SET indexed_hash = NULL, index_status = 'pending' WHERE deleted_at IS NULL`,
    )
  }

  rebuildCoreSources(): void {
    const nodes = this.workspaceDatabase
      .prepare('SELECT id FROM nodes WHERE deleted_at IS NULL ORDER BY created_at, id')
      .pluck()
      .all() as string[]
    for (const id of nodes) {
      this.indexNode({ id, title: '' })
    }
    const notes = this.workspaceDatabase
      .prepare('SELECT id, body_md FROM notes WHERE deleted_at IS NULL ORDER BY created_at, id')
      .all() as Array<{ id: string; body_md: string }>
    for (const note of notes) {
      this.indexNote({ id: note.id, bodyMd: note.body_md })
    }
  }

  async search(query: SearchQuery): Promise<SearchHit[]> {
    return this.searchInternal(query)
  }

  searchSync(query: SearchQuery): SearchHit[] {
    return this.searchInternal(query)
  }

  private searchInternal(query: SearchQuery): SearchHit[] {
    const normalizedQuery = normalizeQuery(query)
    const limit = normalizeLimit(query.limit)
    const scopeIds = query.scope === undefined ? [] : this.resolveScopeIds(query.scope)
    if (query.scope !== undefined && scopeIds.length === 0) {
      return []
    }

    const hits: SearchHit[] = []
    const scopeClause = scopeIds.length > 0
      ? ` AND EXISTS (
          SELECT 1 FROM search_document_scopes AS ds
           WHERE ds.document_id = d.document_id
             AND ds.scope_node_id IN (${scopeIds.map(() => '?').join(', ')})
        )`
      : ''
    const scopeParams = scopeIds

    const exactRows = this.searchDatabase
      .prepare(
        `SELECT d.document_id, d.source_type, d.source_id, d.file_id,
                d.title, d.filename, d.path, d.content_hash, d.index_status,
                CASE
                  WHEN d.source_type = 'file' AND d.filename_normalized LIKE ? ESCAPE '\\' THEN 'exact-filename'
                  WHEN d.title_normalized = ? OR d.title_normalized LIKE ? ESCAPE '\\' THEN 'exact-title'
                  ELSE 'exact-filename'
                END AS match_source,
                CASE
                  WHEN d.source_type = 'file' AND d.filename_normalized LIKE ? ESCAPE '\\' THEN d.filename
                  WHEN d.title_normalized = ? OR d.title_normalized LIKE ? ESCAPE '\\' THEN d.title
                  ELSE d.filename
                END AS matched_text
           FROM search_documents AS d
          WHERE (d.title_normalized LIKE ? ESCAPE '\\' OR d.filename_normalized LIKE ? ESCAPE '\\')
            ${scopeClause}
          ORDER BY
            CASE WHEN d.title_normalized = ? THEN 0 ELSE 1 END,
            d.title COLLATE NOCASE,
            d.document_id
          LIMIT ?`,
      )
      .all(
        `%${escapeLike(normalizedQuery)}%`,
        normalizedQuery,
        `%${escapeLike(normalizedQuery)}%`,
        `%${escapeLike(normalizedQuery)}%`,
        normalizedQuery,
        `%${escapeLike(normalizedQuery)}%`,
        `%${escapeLike(normalizedQuery)}%`,
        `%${escapeLike(normalizedQuery)}%`,
        ...scopeParams,
        normalizedQuery,
        limit,
      ) as Array<SearchDocumentRow & { match_source: 'exact-title' | 'exact-filename'; matched_text: string | null }>

    for (const row of exactRows) {
      const source = row.match_source
      const snippet = row.matched_text ?? row.title
      hits.push({
        sourceType: row.source_type,
        sourceId: row.source_id,
        ...(row.file_id === null ? {} : { fileId: row.file_id }),
        title: row.title,
        ...(row.path === null ? {} : { path: row.path }),
        snippet,
        source,
        contentHash: row.content_hash,
        indexStatus: row.index_status,
      })
    }

    const bodyRows = isShortSearchText(normalizedQuery)
      ? this.searchShortWord(normalizedQuery, scopeClause, scopeParams, limit)
      : this.searchBody(normalizedQuery, scopeClause, scopeParams, limit)
    for (const row of bodyRows) {
      hits.push({
        sourceType: row.source_type,
        sourceId: row.source_id,
        ...(row.file_id === null ? {} : { fileId: row.file_id }),
        title: row.title,
        ...(row.path === null ? {} : { path: row.path }),
        snippet: row.original_text,
        ...(row.position_type === null
          ? {}
          : { position: toSearchPosition(row.position_type, row.position_value, row.position_value_type) }),
        source: isShortSearchText(normalizedQuery) ? 'short-word' : 'body-fts',
        contentHash: row.content_hash,
        indexStatus: row.index_status,
      })
    }

    return dedupeAndLimit(hits, limit)
  }

  private searchShortWord(
    normalizedQuery: string,
    scopeClause: string,
    scopeParams: readonly string[],
    limit: number,
  ): SearchChunkRowWithDocument[] {
    return this.searchDatabase
      .prepare(
        `SELECT c.chunk_id, c.document_id, c.position_type, c.position_value,
                c.position_value_type, c.original_text,
                d.source_type, d.source_id, d.file_id, d.title, d.path,
                d.content_hash, d.index_status
           FROM search_chunks AS c
           JOIN search_documents AS d ON d.document_id = c.document_id
          WHERE c.normalized_text LIKE ? ESCAPE '\\'
            ${scopeClause}
          ORDER BY d.title COLLATE NOCASE, c.ordinal, c.chunk_id
          LIMIT ?`,
      )
      .all(`%${escapeLike(normalizedQuery)}%`, ...scopeParams, limit) as SearchChunkRowWithDocument[]
  }

  private searchBody(
    normalizedQuery: string,
    scopeClause: string,
    scopeParams: readonly string[],
    limit: number,
  ): SearchChunkRowWithDocument[] {
    const sql = `SELECT c.chunk_id, c.document_id, c.position_type, c.position_value,
                        c.position_value_type, c.original_text,
                        d.source_type, d.source_id, d.file_id, d.title, d.path,
                        d.content_hash, d.index_status
                   FROM search_chunks_fts AS f
                   JOIN search_chunks AS c ON c.chunk_id = f.rowid
                   JOIN search_documents AS d ON d.document_id = c.document_id
                  WHERE f.search_chunks_fts MATCH ?
                    ${scopeClause}
                  ORDER BY d.title COLLATE NOCASE, c.ordinal, c.chunk_id
                  LIMIT ?`
    try {
      return this.searchDatabase
        .prepare(sql)
        .all(quoteFtsPhrase(normalizedQuery), ...scopeParams, limit) as SearchChunkRowWithDocument[]
    } catch {
      // A malformed token should never escape the search API. The normalized
      // LIKE path is slower but deterministic and still returns safe results.
      return this.searchShortWord(normalizedQuery, scopeClause, scopeParams, limit)
    }
  }

  private replaceDocument(
    document: DocumentInput,
    chunks: readonly SearchChunkInput[],
    scopes: readonly string[],
  ): void {
    const normalizedChunks = normalizeChunks(chunks)
    this.withSearchTransaction(() => {
      this.deleteDocument(document.documentId)
      this.searchDatabase
        .prepare(
          `INSERT INTO search_documents
             (document_id, source_type, source_id, file_id, title, title_normalized,
              filename, filename_normalized, path, content_hash, index_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          document.documentId,
          document.sourceType,
          document.sourceId,
          document.fileId,
          document.title,
          normalizeSearchText(document.title),
          document.filename,
          document.filename === null ? null : normalizeSearchText(document.filename),
          document.path,
          document.contentHash,
          document.indexStatus,
        )

      const insertScope = this.searchDatabase.prepare(
        `INSERT OR IGNORE INTO search_document_scopes (document_id, scope_node_id)
         VALUES (?, ?)`,
      )
      for (const scope of scopes) {
        insertScope.run(document.documentId, scope)
      }

      const insertChunk = this.searchDatabase.prepare(
        `INSERT INTO search_chunks
           (document_id, ordinal, position_type, position_value, position_value_type,
            original_text, normalized_text)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      const insertFts = this.searchDatabase.prepare(
        `INSERT INTO search_chunks_fts (rowid, normalized_text) VALUES (?, ?)`,
      )
      for (const chunk of normalizedChunks) {
        const result = insertChunk.run(
          document.documentId,
          chunk.ordinal,
          chunk.position?.type ?? null,
          chunk.position?.value === undefined ? null : String(chunk.position.value),
          chunk.position?.value === undefined ? null : typeof chunk.position.value,
          chunk.text,
          normalizeSearchText(chunk.text),
        )
        insertFts.run(result.lastInsertRowid, normalizeSearchText(chunk.text))
      }
    })
  }

  private deleteDocument(documentId: string): void {
    const chunkIds = this.searchDatabase
      .prepare('SELECT chunk_id FROM search_chunks WHERE document_id = ?')
      .pluck()
      .all(documentId) as number[]
    const deleteFts = this.searchDatabase.prepare('DELETE FROM search_chunks_fts WHERE rowid = ?')
    for (const chunkId of chunkIds) {
      deleteFts.run(chunkId)
    }
    this.searchDatabase.prepare('DELETE FROM search_chunks WHERE document_id = ?').run(documentId)
    this.searchDatabase.prepare('DELETE FROM search_documents WHERE document_id = ?').run(documentId)
  }

  private hasDocument(documentId: string): boolean {
    return this.searchDatabase
      .prepare('SELECT 1 FROM search_documents WHERE document_id = ?')
      .get(documentId) !== undefined
  }

  private requireFile(fileId: string): FileRow {
    const row = this.workspaceDatabase
      .prepare(
        `SELECT id, original_name, content_hash, indexed_hash, index_status, deleted_at
           FROM files
          WHERE id = ?`,
      )
      .get(fileId) as FileRow | undefined
    if (row === undefined) {
      throw new SearchServiceError('FILE_NOT_FOUND', '登记的文件不存在。')
    }
    if (row.deleted_at !== null) {
      throw new SearchServiceError('FILE_DELETED', '文件已删除，不能建立搜索索引。')
    }
    return row
  }

  private findNode(nodeId: string): NodeRow | undefined {
    return this.workspaceDatabase
      .prepare('SELECT id, parent_id, title, content_md, deleted_at FROM nodes WHERE id = ?')
      .get(nodeId) as NodeRow | undefined
  }

  private findNote(noteId: string): NoteRow | undefined {
    return this.workspaceDatabase
      .prepare('SELECT id, student_id, lesson_id, body_md, deleted_at FROM notes WHERE id = ?')
      .get(noteId) as NoteRow | undefined
  }

  private resolveFileScopes(fileId: string): string[] {
    const lessonIds = this.workspaceDatabase
      .prepare('SELECT lesson_id FROM lesson_files WHERE file_id = ?')
      .pluck()
      .all(fileId) as string[]
    const studentIds = this.workspaceDatabase
      .prepare('SELECT student_id FROM student_files WHERE file_id = ?')
      .pluck()
      .all(fileId) as string[]
    const courseIds = studentIds.length === 0
      ? []
      : this.workspaceDatabase
          .prepare(`SELECT course_id FROM course_students WHERE student_id IN (${studentIds.map(() => '?').join(', ')})`)
          .pluck()
          .all(...studentIds) as string[]
    return unique([...lessonIds.flatMap((id) => this.resolveNodeScopes(id)), ...courseIds.flatMap((id) => this.resolveNodeScopes(id))])
  }

  private resolveNodeScopes(nodeId: string): string[] {
    const rows = this.workspaceDatabase
      .prepare('SELECT id, parent_id FROM nodes')
      .all() as Array<{ id: string; parent_id: string | null }>
    const parents = new Map(rows.map((row) => [row.id, row.parent_id]))
    const result: string[] = []
    const visited = new Set<string>()
    let current: string | null = nodeId
    while (current !== null && !visited.has(current)) {
      result.push(current)
      visited.add(current)
      current = parents.get(current) ?? null
    }
    return result
  }

  private resolveNodePath(nodeId: string): string | null {
    const rows = this.workspaceDatabase
      .prepare('SELECT id, parent_id, title FROM nodes WHERE deleted_at IS NULL')
      .all() as Array<{ id: string; parent_id: string | null; title: string }>
    const byId = new Map(rows.map((row) => [row.id, row]))
    const titles: string[] = []
    const visited = new Set<string>()
    let current: string | null = nodeId
    while (current !== null && !visited.has(current)) {
      const row = byId.get(current)
      if (row === undefined) {
        return null
      }
      titles.unshift(row.title)
      visited.add(current)
      current = row.parent_id
    }
    return titles.join(' / ')
  }

  private resolveNotePath(noteId: string): string | null {
    const note = this.findNote(noteId)
    if (note === undefined) {
      return null
    }
    if (note.lesson_id !== null) {
      return this.resolveNodePath(note.lesson_id)
    }
    if (note.student_id === null) {
      return null
    }
    const courseId = this.workspaceDatabase
      .prepare(
        `SELECT cs.course_id
           FROM course_students AS cs
           JOIN nodes AS n ON n.id = cs.course_id
          WHERE cs.student_id = ?
            AND n.deleted_at IS NULL
          ORDER BY cs.created_at, cs.course_id
          LIMIT 1`,
      )
      .pluck()
      .get(note.student_id) as string | undefined
    return courseId === undefined ? null : this.resolveNodePath(courseId)
  }

  private resolveNoteScopes(noteId: string): string[] {
    const note = this.findNote(noteId)
    if (note === undefined) {
      return []
    }
    if (note.lesson_id !== null) {
      return this.resolveNodeScopes(note.lesson_id)
    }
    if (note.student_id === null) {
      return []
    }
    const courseIds = this.workspaceDatabase
      .prepare('SELECT course_id FROM course_students WHERE student_id = ?')
      .pluck()
      .all(note.student_id) as string[]
    return unique(courseIds.flatMap((id) => this.resolveNodeScopes(id)))
  }

  private resolveScopeIds(scopeId: string): string[] {
    const rows = this.workspaceDatabase
      .prepare('SELECT id, parent_id FROM nodes WHERE deleted_at IS NULL')
      .all() as Array<{ id: string; parent_id: string | null }>
    const children = new Map<string, string[]>()
    for (const row of rows) {
      if (row.parent_id === null) {
        continue
      }
      const siblings = children.get(row.parent_id) ?? []
      siblings.push(row.id)
      children.set(row.parent_id, siblings)
    }
    if (!rows.some((row) => row.id === scopeId)) {
      return []
    }
    const result: string[] = []
    const pending = [scopeId]
    while (pending.length > 0) {
      const current = pending.pop()!
      result.push(current)
      pending.push(...(children.get(current) ?? []))
    }
    return result
  }

  private withSearchTransaction(callback: () => void): void {
    try {
      this.searchDatabase.transaction(callback).immediate()
    } catch (error) {
      throw new SearchServiceError('SEARCH_INDEX_FAILED', '搜索索引写入失败。', { cause: error })
    }
  }
}

interface DocumentInput {
  readonly documentId: string
  readonly sourceType: SearchSourceType
  readonly sourceId: string
  readonly fileId: string | null
  readonly title: string
  readonly filename: string | null
  readonly path: string | null
  readonly contentHash: string | null
  readonly indexStatus: SearchIndexStatus
}

interface SearchChunkRowWithDocument extends SearchChunkRow {
  readonly source_type: SearchSourceType
  readonly source_id: string
  readonly file_id: string | null
  readonly title: string
  readonly path: string | null
  readonly content_hash: string | null
  readonly index_status: SearchIndexStatus
}

function normalizeQuery(query: SearchQuery): string {
  if (query === null || typeof query !== 'object' || typeof query.text !== 'string') {
    throw new SearchServiceError('INVALID_QUERY', '搜索内容无效。')
  }
  const normalized = normalizeSearchText(query.text.slice(0, MAX_QUERY_LENGTH))
  if (normalized.length === 0) {
    throw new SearchServiceError('INVALID_QUERY', '搜索内容不能为空。')
  }
  return normalized
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LIMIT
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new SearchServiceError('INVALID_QUERY', '搜索结果数量无效。')
  }
  return Math.min(limit, MAX_LIMIT)
}

function normalizeChunks(chunks: readonly SearchChunkInput[]): Array<SearchChunkInput & { readonly ordinal: number }> {
  return chunks
    .filter((chunk) => typeof chunk.text === 'string' && chunk.text.trim().length > 0)
    .map((chunk, index) => ({
      ...chunk,
      text: chunk.text,
      ordinal: Number.isInteger(chunk.ordinal) && (chunk.ordinal as number) >= 0 ? (chunk.ordinal as number) : index,
    }))
    .sort((left, right) => left.ordinal - right.ordinal)
}

function makeDocumentId(sourceType: SearchSourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`
}

function isSourceType(value: string): value is SearchSourceType {
  return value === 'file' || value === 'node' || value === 'note'
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

function toSearchPosition(
  type: string,
  value: string | null,
  valueType: 'string' | 'number' | null,
): SearchPosition {
  if (value === null) {
    return { type }
  }
  return { type, value: valueType === 'number' ? Number(value) : value }
}

function dedupeAndLimit(hits: readonly SearchHit[], limit: number): SearchHit[] {
  const rank: Record<SearchHit['source'], number> = {
    'exact-title': 0,
    'exact-filename': 1,
    'short-word': 2,
    'body-fts': 3,
  }
  const seen = new Set<string>()
  return [...hits]
    .sort((left, right) => rank[left.source] - rank[right.source] || left.title.localeCompare(right.title, 'zh-CN'))
    .filter((hit) => {
      const position = hit.position === undefined ? '' : JSON.stringify(hit.position)
      const key = `${hit.sourceType}:${hit.sourceId}:${hit.source}:${position}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .slice(0, limit)
}
