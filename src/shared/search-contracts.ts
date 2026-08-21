export type SearchIndexStatus = 'pending' | 'indexed' | 'no_text' | 'parse_failed'

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
  readonly studentId?: string
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
