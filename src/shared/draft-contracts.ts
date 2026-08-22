import { isRecord } from './ipc-contracts'
import { isSearchPosition, type SearchPosition } from './search-contracts'
import { SKILL_NAME_MAX_CHARS, SKILL_PROMPT_MAX_CHARS } from './skill-contracts'

export const DRAFT_KINDS = {
  lecture: 'lecture',
  example: 'example',
  homework: 'homework',
} as const

export type DraftKind = (typeof DRAFT_KINDS)[keyof typeof DRAFT_KINDS]

export const DRAFT_PROMPT_VERSION = 'v11-03-v1'
export const DRAFT_DEFAULT_MAX_CHARS = 12_000
export const DRAFT_DEFAULT_MAX_TOKENS = 2_000
export const DRAFT_MAX_CHARS = 100_000
export const DRAFT_MAX_TOKENS = 32_000
export const DRAFT_REQUIREMENT_MAX_CHARS = 4_000

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
  readonly lesson?: DraftLessonSnapshot
  readonly skill?: DraftSkillSnapshot
  readonly requirement?: string
}

export interface DraftLessonSnapshot {
  readonly courseId: string
  readonly courseTitle: string
  readonly courseMode: 'class' | 'one_to_one'
  readonly periodTitle: string
  readonly lessonId: string
  readonly lessonTitle: string
  readonly studentId?: string
  readonly studentName?: string
}

export interface DraftSkillSnapshot {
  readonly id: string
  readonly name: string
  readonly prompt: string
}

export interface GenerateDraftRequest {
  readonly requestId: string
  readonly kind: DraftKind
  readonly lessonId: string
  readonly studentId?: string
  readonly skillId?: string
  readonly requirement?: string
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
    hasOnlyKeys(
      value,
      ['requestId', 'kind', 'lessonId', 'sources', 'maxChars', 'maxTokens'],
      ['studentId', 'skillId', 'requirement'],
    ) &&
    isNonEmptyString(value.requestId, 128) &&
    isDraftKind(value.kind) &&
    isNonEmptyString(value.lessonId, 128) &&
    (value.studentId === undefined || isNonEmptyString(value.studentId, 128)) &&
    (value.skillId === undefined || isNonEmptyString(value.skillId, 128)) &&
    (value.requirement === undefined || isNonEmptyString(value.requirement, DRAFT_REQUIREMENT_MAX_CHARS)) &&
    Array.isArray(value.sources) &&
    value.sources.length > 0 &&
    value.sources.length <= 100 &&
    value.sources.every(isDraftSourceSelection) &&
    isSafeLimit(value.maxChars, DRAFT_MAX_CHARS) &&
    isSafeLimit(value.maxTokens, DRAFT_MAX_TOKENS)
  )
}

function isDraftLessonSnapshot(value: unknown): value is DraftLessonSnapshot {
  return (
    isRecord(value) &&
    hasOnlyKeys(
      value,
      ['courseId', 'courseTitle', 'courseMode', 'periodTitle', 'lessonId', 'lessonTitle'],
      ['studentId', 'studentName'],
    ) &&
    isNonEmptyString(value.courseId, 128) &&
    isNonEmptyString(value.courseTitle, 500) &&
    (value.courseMode === 'class' || value.courseMode === 'one_to_one') &&
    isNonEmptyString(value.periodTitle, 500) &&
    isNonEmptyString(value.lessonId, 128) &&
    isNonEmptyString(value.lessonTitle, 500) &&
    (value.studentId === undefined || isNonEmptyString(value.studentId, 128)) &&
    (value.studentName === undefined || isNonEmptyString(value.studentName, 500))
  )
}

function isDraftSkillSnapshot(value: unknown): value is DraftSkillSnapshot {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['id', 'name', 'prompt']) &&
    isNonEmptyString(value.id, 128) &&
    isNonEmptyString(value.name, SKILL_NAME_MAX_CHARS) &&
    isNonEmptyString(value.prompt, SKILL_PROMPT_MAX_CHARS)
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
    isSafeLimit(value.maxTokens, DRAFT_MAX_TOKENS) &&
    (value.lesson === undefined || isDraftLessonSnapshot(value.lesson)) &&
    (value.skill === undefined || isDraftSkillSnapshot(value.skill)) &&
    (value.requirement === undefined || isNonEmptyString(value.requirement, DRAFT_REQUIREMENT_MAX_CHARS))
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
