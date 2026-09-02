export type SearchIndexStatus = 'pending' | 'indexed' | 'no_text' | 'parse_failed' | 'mineru_ready'

export type SearchSourceType = 'file' | 'node' | 'note'

export type SearchMatchSource =
  | 'body-fts'
  | 'short-word'
  | 'exact-title'
  | 'exact-filename'

export interface SearchPosition {
  readonly type: string
  readonly value?: string | number
}

export interface SearchChunkInput {
  readonly text: string
  readonly position?: SearchPosition
  readonly ordinal?: number
}

export interface SearchFileInput {
  readonly id: string
  readonly originalName: string
  readonly contentHash?: string | null
  readonly title?: string
  readonly chunks?: readonly SearchChunkInput[]
  readonly status?: SearchIndexStatus
  readonly errorMessage?: string | null
}

export interface SearchNodeInput {
  readonly id: string
  readonly title: string
  readonly contentMd?: string
  readonly parentId?: string | null
  readonly kind?: 'course' | 'period' | 'lesson'
  readonly deletedAt?: string | null
}

export interface SearchNoteInput {
  readonly id: string
  readonly title?: string
  readonly bodyMd: string
  readonly lessonId?: string | null
  readonly studentId?: string | null
  readonly deletedAt?: string | null
}

export interface SearchQuery {
  readonly text: string
  /** A course, period, lesson, or other node ID used to constrain results. */
  readonly scope?: string
  readonly limit?: number
}

export interface SearchHit {
  readonly sourceType: SearchSourceType
  readonly sourceId: string
  readonly fileId?: string
  readonly title: string
  readonly path?: string
  readonly snippet: string
  readonly position?: SearchPosition
  readonly source: SearchMatchSource
  readonly contentHash?: string | null
  readonly indexStatus?: SearchIndexStatus
}

export interface SearchIndexStatusSummary {
  readonly total: number
  readonly pending: number
  readonly indexed: number
  readonly noText: number
  readonly parseFailed: number
  readonly updatedAt: string
}

export interface SearchRebuildResult {
  readonly queuedFiles: number
  readonly indexedFiles: number
  readonly failedFiles: number
  readonly status: SearchIndexStatusSummary
}

export function isSearchQuery(value: unknown): value is SearchQuery {
  return (
    hasOnlyKeys(value, ['text'], ['scope', 'limit']) &&
    isNonEmptyString(value.text) &&
    (value.scope === undefined || isNonEmptyString(value.scope)) &&
    (value.limit === undefined || isNonNegativeInteger(value.limit))
  )
}

export function isSearchPosition(value: unknown): value is SearchPosition {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    value.type.trim().length > 0 &&
    (value.value === undefined || typeof value.value === 'string' || typeof value.value === 'number')
  )
}

export function isSearchHit(value: unknown): value is SearchHit {
  return (
    isRecord(value) &&
    isSearchSourceType(value.sourceType) &&
    isNonEmptyString(value.sourceId) &&
    (value.fileId === undefined || isNonEmptyString(value.fileId)) &&
    isNonEmptyString(value.title) &&
    (value.path === undefined || typeof value.path === 'string') &&
    typeof value.snippet === 'string' &&
    (value.position === undefined || isSearchPosition(value.position)) &&
    isSearchMatchSource(value.source) &&
    (value.contentHash === undefined || value.contentHash === null || isNonEmptyString(value.contentHash)) &&
    (value.indexStatus === undefined || isSearchIndexStatus(value.indexStatus))
  )
}

export function isSearchIndexStatusSummary(value: unknown): value is SearchIndexStatusSummary {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.total) &&
    isNonNegativeInteger(value.pending) &&
    isNonNegativeInteger(value.indexed) &&
    isNonNegativeInteger(value.noText) &&
    isNonNegativeInteger(value.parseFailed) &&
    isNonEmptyString(value.updatedAt)
  )
}

export function isSearchRebuildResult(value: unknown): value is SearchRebuildResult {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.queuedFiles) &&
    isNonNegativeInteger(value.indexedFiles) &&
    isNonNegativeInteger(value.failedFiles) &&
    isSearchIndexStatusSummary(value.status)
  )
}

function isSearchSourceType(value: unknown): value is SearchSourceType {
  return value === 'file' || value === 'node' || value === 'note'
}

function isSearchMatchSource(value: unknown): value is SearchMatchSource {
  return value === 'body-fts' || value === 'short-word' || value === 'exact-title' || value === 'exact-filename'
}

function isSearchIndexStatus(value: unknown): value is SearchIndexStatus {
  return value === 'pending' || value === 'indexed' || value === 'no_text' || value === 'parse_failed' || value === 'mineru_ready'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function hasOnlyKeys(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false
  }
  const keys = Object.keys(value)
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  return requiredKeys.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key))
}
