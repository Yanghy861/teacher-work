import { isRecord } from './ipc-contracts'
import { isSearchPosition, type SearchPosition } from './search-contracts'
import { SKILL_NAME_MAX_CHARS, SKILL_PROMPT_MAX_CHARS } from './skill-contracts'
import { isManagedFileRecord, type ManagedFileRecord } from './file-contracts'

export const DRAFT_KINDS = {
  lecture: 'lecture',
  example: 'example',
  homework: 'homework',
} as const

export type DraftKind = (typeof DRAFT_KINDS)[keyof typeof DRAFT_KINDS]

export const DRAFT_PROMPT_VERSION = 'v11-03-v1'
export const DRAFT_DEFAULT_MAX_CHARS = 30_000
export const DRAFT_DEFAULT_MAX_TOKENS = 16_000
export const DRAFT_MAX_CHARS = 100_000
export const DRAFT_MAX_TOKENS = 32_000
export const DRAFT_REQUIREMENT_MAX_CHARS = 4_000
export const DRAFT_MAX_REFERENCE_FILES = 10
export const DRAFT_MAX_SOURCE_FILES = 32

export const DRAFT_BANK_PLAN_MIN_TARGET_COUNT = 1
export const DRAFT_BANK_PLAN_MAX_TARGET_COUNT = 20
export const DRAFT_BANK_PLAN_DEFAULT_TARGET_COUNT = 5

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
  readonly modification?: DraftModificationScope
  readonly bankSelection?: DraftBankSelection
  /** D31：双版输出时标识教师版/学生版（缺省 = 单版输出，无徽标）。 */
  readonly variant?: 'teacher' | 'student'
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

export type DraftModificationMode = 'single' | 'lesson'

export const DRAFT_MODIFICATION_SCOPE_VERSION = 1
export const DRAFT_MODIFICATION_PLAN_MAX_CHARS = 800

export interface DraftModificationScope {
  readonly scopeVersion: typeof DRAFT_MODIFICATION_SCOPE_VERSION
  readonly mode: DraftModificationMode
  readonly baselineCount: number
  readonly targetFileId?: string
  readonly targetName?: string
  readonly teacherRequirement: string
  readonly confirmedPlan?: string
}

/** D30：AI 检索计划（QuestionBankSearchRequest 的子集 + 目标题数），阶段一由 AI 输出、Main 校验。 */
export interface DraftBankPlan {
  readonly text?: string
  readonly tags?: readonly string[]
  readonly grade?: string
  readonly type?: string
  readonly difficultyMin?: number
  readonly difficultyMax?: number
  readonly targetCount: number
}

/** D30：题库候选审计留痕（只存计划/数量/ID，不存题目全文——全文固化在 note body）。 */
export interface DraftBankSelection {
  readonly plan: DraftBankPlan
  readonly retrievedCount: number
  readonly sentCount: number
  readonly candidateIds: readonly string[]
}

export interface GenerateDraftRequest {
  readonly requestId: string
  readonly kind: DraftKind
  readonly lessonId: string
  readonly studentId?: string
  readonly skillId?: string
  readonly requirement?: string
  readonly modification?: DraftModificationScope
  readonly bankPlan?: DraftBankPlan
  readonly dualVersion?: true
  /** D30：过目步确认后的候选题 ID 集合（已剔除不要的题）；缺省 = Main 按计划自行检索。 */
  readonly bankQuestionIds?: readonly string[]
  readonly sources: readonly DraftSourceSelection[]
  readonly maxChars: number
  readonly maxTokens: number
}

export interface GenerateDraftResult {
  readonly noteId: string
  readonly kind: DraftKind
  readonly bodyMd: string
  readonly metadata: DraftNoteMetadata
  readonly studentNoteId?: string
}

export interface DraftIdRequest {
  readonly noteId: string
}

export interface RegenerateDraftRequest extends DraftIdRequest {
  readonly requestId: string
}

export interface SaveDraftRequest extends DraftIdRequest {
  readonly bodyMd?: string
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
      ['studentId', 'skillId', 'requirement', 'modification', 'bankPlan', 'dualVersion', 'bankQuestionIds'],
    ) &&
    isNonEmptyString(value.requestId, 128) &&
    isDraftKind(value.kind) &&
    isNonEmptyString(value.lessonId, 128) &&
    (value.studentId === undefined || isNonEmptyString(value.studentId, 128)) &&
    (value.skillId === undefined || isNonEmptyString(value.skillId, 128)) &&
    (value.requirement === undefined || isNonEmptyString(value.requirement, DRAFT_REQUIREMENT_MAX_CHARS)) &&
    (value.modification === undefined || isDraftModificationScope(value.modification)) &&
    (value.bankPlan === undefined || isDraftBankPlan(value.bankPlan)) &&
    (value.dualVersion === undefined || value.dualVersion === true) &&
    (value.bankQuestionIds === undefined || isBankQuestionIds(value.bankQuestionIds)) &&
    Array.isArray(value.sources) &&
    value.sources.length > 0 &&
    value.sources.length <= DRAFT_MAX_SOURCE_FILES &&
    value.sources.every(isDraftSourceSelection) &&
    isSafeLimit(value.maxChars, DRAFT_MAX_CHARS) &&
    isSafeLimit(value.maxTokens, DRAFT_MAX_TOKENS)
  )
}

export function isDraftIdRequest(value: unknown): value is DraftIdRequest {
  return hasOnlyKeys(value, ['noteId']) && isNonEmptyString(value.noteId, 128)
}

export function isRegenerateDraftRequest(value: unknown): value is RegenerateDraftRequest {
  return (
    hasOnlyKeys(value, ['requestId', 'noteId']) &&
    isNonEmptyString(value.requestId, 128) &&
    isNonEmptyString(value.noteId, 128)
  )
}

export function isSaveDraftRequest(value: unknown): value is SaveDraftRequest {
  return (
    hasOnlyKeys(value, ['noteId'], ['bodyMd']) &&
    isNonEmptyString(value.noteId, 128) &&
    (value.bodyMd === undefined || isNonEmptyString(value.bodyMd, DRAFT_MAX_CHARS))
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

export function isDraftModificationScope(value: unknown): value is DraftModificationScope {
  if (!isRecord(value)) return false
  const record = value as Record<string, unknown>
  if (
    record.scopeVersion !== DRAFT_MODIFICATION_SCOPE_VERSION ||
    (record.mode !== 'single' && record.mode !== 'lesson') ||
    typeof record.baselineCount !== 'number' ||
    !Number.isInteger(record.baselineCount) ||
    record.baselineCount < 1 ||
    record.baselineCount > 100 ||
    typeof record.teacherRequirement !== 'string' ||
    record.teacherRequirement.length > DRAFT_REQUIREMENT_MAX_CHARS
  ) {
    return false
  }
  const allowedKeys = new Set([
    'scopeVersion', 'mode', 'baselineCount', 'teacherRequirement',
    'targetFileId', 'targetName', 'confirmedPlan',
  ])
  const keys = Object.keys(record)
  if (!keys.every((key) => allowedKeys.has(key))) return false
  return (
    (record.targetFileId === undefined || isNonEmptyString(record.targetFileId, 128)) &&
    (record.targetName === undefined || isNonEmptyString(record.targetName, 500)) &&
    (record.confirmedPlan === undefined || isNonEmptyString(record.confirmedPlan, DRAFT_MODIFICATION_PLAN_MAX_CHARS))
  )
}

export function isDraftBankPlan(value: unknown): value is DraftBankPlan {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      ['targetCount'],
      ['text', 'tags', 'grade', 'type', 'difficultyMin', 'difficultyMax'],
    ) ||
    !isBankTargetCount(value.targetCount) ||
    (value.text !== undefined && !isNonEmptyString(value.text, 256)) ||
    (value.grade !== undefined && !isNonEmptyString(value.grade, 64)) ||
    (value.type !== undefined && !isNonEmptyString(value.type, 64)) ||
    !isBankDifficulty(value.difficultyMin) ||
    !isBankDifficulty(value.difficultyMax) ||
    (value.difficultyMin !== undefined &&
      value.difficultyMax !== undefined &&
      value.difficultyMin > value.difficultyMax)
  ) {
    return false
  }
  if (value.tags === undefined) return true
  if (!Array.isArray(value.tags) || value.tags.length > 20) return false
  const normalized = value.tags.map((tag) => (typeof tag === 'string' ? tag.trim() : tag))
  if (!normalized.every((tag): tag is string => isNonEmptyString(tag, 128))) return false
  return new Set(normalized).size === normalized.length
}

function isBankTargetCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= DRAFT_BANK_PLAN_MIN_TARGET_COUNT &&
    value <= DRAFT_BANK_PLAN_MAX_TARGET_COUNT
  )
}

export function isDraftBankSelection(value: unknown): value is DraftBankSelection {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['plan', 'retrievedCount', 'sentCount', 'candidateIds']) &&
    isDraftBankPlan(value.plan) &&
    isSafeCount(value.retrievedCount) &&
    isSafeCount(value.sentCount) &&
    value.sentCount <= value.retrievedCount &&
    Array.isArray(value.candidateIds) &&
    value.candidateIds.length <= 100 &&
    value.candidateIds.every((id) => isNonEmptyString(id, 512)) &&
    value.sentCount <= value.candidateIds.length
  )
}

function isBankDifficulty(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100)
  )
}

function isSafeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100
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
    (value.requirement === undefined || isNonEmptyString(value.requirement, DRAFT_REQUIREMENT_MAX_CHARS)) &&
    (value.modification === undefined || isDraftModificationScope(value.modification)) &&
    (value.bankSelection === undefined || isDraftBankSelection(value.bankSelection)) &&
    (value.variant === undefined || value.variant === 'teacher' || value.variant === 'student')
  )
}

/** D30：过目步剔除后的候选题 ID 集合（1..60 道非空短字符串）。 */
export function isBankQuestionIds(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 60 &&
    value.every((id) => isNonEmptyString(id, 512))
  )
}

export function isGenerateDraftResult(value: unknown): value is GenerateDraftResult {
  return (
    isRecord(value) &&
    hasOnlyKeys(
      value,
      ['noteId', 'kind', 'bodyMd', 'metadata'],
      ['studentNoteId'],
    ) &&
    isNonEmptyString(value.noteId, 128) &&
    isDraftKind(value.kind) &&
    isNonEmptyString(value.bodyMd, DRAFT_MAX_CHARS) &&
    isDraftNoteMetadata(value.metadata) &&
    (value.studentNoteId === undefined || isNonEmptyString(value.studentNoteId, 128))
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

export interface PublishDraftVersionRequest {
  readonly requestId: string
  readonly noteId: string
}

export interface PublishDraftVersionResult {
  readonly file: ManagedFileRecord
  readonly version: number
}

export function isPublishDraftVersionRequest(value: unknown): value is PublishDraftVersionRequest {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.requestId === 'string' && record.requestId.trim() !== '' &&
    typeof record.noteId === 'string' && record.noteId.trim() !== ''
}

export function isPublishDraftVersionResult(value: unknown): value is PublishDraftVersionResult {
  if (!isRecord(value)) return false
  const record = value as Record<string, unknown>
  return isManagedFileRecord(record.file) && typeof record.version === 'number' && Number.isInteger(record.version) && record.version >= 1
}
