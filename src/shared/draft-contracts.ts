import { isRecord } from './ipc-contracts'
import { isSearchPosition, type SearchPosition } from './search-contracts'

export const DRAFT_KINDS = {
  lecture: 'lecture',
  example: 'example',
  homework: 'homework',
} as const

export type DraftKind = (typeof DRAFT_KINDS)[keyof typeof DRAFT_KINDS]

export const DRAFT_PROMPT_VERSION = 'l09-v1'
export const DRAFT_DEFAULT_MAX_CHARS = 12_000
export const DRAFT_DEFAULT_MAX_TOKENS = 2_000
export const DRAFT_MAX_CHARS = 100_000
export const DRAFT_MAX_TOKENS = 32_000

export interface DraftSourceSelection {
  readonly fileId: string
  readonly text?: string
  readonly position?: SearchPosition
}

export interface DraftSourceRef {
  readonly fileId: string
  readonly position?: SearchPosition
  readonly charsSent: number
}

export interface DraftNoteMetadata {
  readonly kind: DraftKind
  readonly promptVersion: string
  readonly provider: string
  readonly model: string
  readonly sources: readonly DraftSourceRef[]
  readonly inputChars: number
  readonly maxChars: number
  readonly maxTokens: number
}

export interface GenerateDraftRequest {
  readonly requestId: string
  readonly kind: DraftKind
  readonly studentId: string
  readonly lessonId?: string
  readonly sources: readonly DraftSourceSelection[]
  readonly maxChars: number
  readonly maxTokens: number
}

export interface GenerateDraftResult {
  readonly noteId: string
  readonly kind: DraftKind
  readonly bodyMd: string
  readonly metadata: DraftNoteMetadata
}

export function isDraftKind(value: unknown): value is DraftKind {
  return value === DRAFT_KINDS.lecture || value === DRAFT_KINDS.example || value === DRAFT_KINDS.homework
}

export function isDraftSourceSelection(value: unknown): value is DraftSourceSelection {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['fileId'], ['text', 'position']) &&
    isNonEmptyString(value.fileId, 128) &&
    (value.text === undefined || isNonEmptyString(value.text, DRAFT_MAX_CHARS)) &&
    (value.position === undefined || isSearchPosition(value.position))
  )
}

export function isGenerateDraftRequest(value: unknown): value is GenerateDraftRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['requestId', 'kind', 'studentId', 'sources', 'maxChars', 'maxTokens'], ['lessonId']) &&
    isNonEmptyString(value.requestId, 128) &&
    isDraftKind(value.kind) &&
    isNonEmptyString(value.studentId, 128) &&
    (value.lessonId === undefined || isNonEmptyString(value.lessonId, 128)) &&
    Array.isArray(value.sources) &&
    value.sources.length > 0 &&
    value.sources.length <= 100 &&
    value.sources.every(isDraftSourceSelection) &&
    isSafeLimit(value.maxChars, DRAFT_MAX_CHARS) &&
    isSafeLimit(value.maxTokens, DRAFT_MAX_TOKENS)
  )
}

export function isDraftNoteMetadata(value: unknown): value is DraftNoteMetadata {
  return (
    isRecord(value) &&
    isDraftKind(value.kind) &&
    isNonEmptyString(value.promptVersion, 64) &&
    isNonEmptyString(value.provider, 128) &&
    isNonEmptyString(value.model, 200) &&
    Array.isArray(value.sources) &&
    value.sources.every(isDraftSourceRef) &&
    isSafeLimit(value.inputChars, DRAFT_MAX_CHARS) &&
    isSafeLimit(value.maxChars, DRAFT_MAX_CHARS) &&
    isSafeLimit(value.maxTokens, DRAFT_MAX_TOKENS)
  )
}

export function isGenerateDraftResult(value: unknown): value is GenerateDraftResult {
  return (
    isRecord(value) &&
    isNonEmptyString(value.noteId, 128) &&
    isDraftKind(value.kind) &&
    isNonEmptyString(value.bodyMd, DRAFT_MAX_CHARS) &&
    isDraftNoteMetadata(value.metadata)
  )
}

function isDraftSourceRef(value: unknown): value is DraftSourceRef {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['fileId', 'charsSent'], ['position']) &&
    isNonEmptyString(value.fileId, 128) &&
    (value.position === undefined || isSearchPosition(value.position)) &&
    isSafeLimit(value.charsSent, DRAFT_MAX_CHARS)
  )
}

function isSafeLimit(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maximum
}

function isNonEmptyString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum
}

function hasOnlyKeys(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  const keys = Object.keys(value)
  return requiredKeys.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key))
}
