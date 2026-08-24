import { isRecord } from './ipc-contracts'

export interface QuestionBankFacetValue {
  readonly value: string
  readonly label: string
  readonly count: number
}
export interface QuestionBankSummary {
  readonly installed: boolean
  readonly packageId: string | null
  readonly sourceName: string | null
  readonly exportedAt: string | null
  readonly questionCount: number
  readonly paperCount: number
  readonly assetCount: number
  readonly grades: readonly QuestionBankFacetValue[]
  readonly years: readonly QuestionBankFacetValue[]
  readonly months: readonly QuestionBankFacetValue[]
  readonly types: readonly QuestionBankFacetValue[]
  readonly tags: readonly QuestionBankFacetValue[]
  readonly difficultyMin: number | null
  readonly difficultyMax: number | null
}

export interface QuestionBankSearchRequest {
  readonly text?: string
  readonly grade?: string
  readonly year?: number
  readonly month?: number
  readonly type?: string
  readonly tag?: string
  readonly difficultyMin?: number
  readonly difficultyMax?: number
  readonly limit?: number
  readonly offset?: number
}

export interface QuestionBankSearchItem {
  readonly id: string
  readonly questionNo: string | null
  readonly type: string
  readonly typeLabel: string
  readonly subject: string
  readonly grade: string | null
  readonly contentPreview: string
  readonly difficulty: number | null
  readonly score: number | null
  readonly paperTitle: string | null
  readonly year: number | null
  readonly month: number | null
  readonly examType: string | null
  readonly tags: readonly string[]
  readonly hasAssets: boolean
}

export interface QuestionBankSearchResult {
  readonly total: number
  readonly limit: number
  readonly offset: number
  readonly items: readonly QuestionBankSearchItem[]
}

export interface QuestionBankOption {
  readonly key: string
  readonly text: string
}

export interface QuestionBankAsset {
  readonly id: number
  readonly role: string
  readonly mimeType: string
  readonly dataUrl: string
}

export interface QuestionBankDetail {
  readonly id: string
  readonly questionNo: string | null
  readonly type: string
  readonly typeLabel: string
  readonly subject: string
  readonly grade: string | null
  readonly section: string | null
  readonly content: string
  readonly options: readonly QuestionBankOption[]
  readonly answer: string
  readonly analysis: string
  readonly difficulty: number | null
  readonly score: number | null
  readonly contentHash: string | null
  readonly paperTitle: string | null
  readonly year: number | null
  readonly month: number | null
  readonly region: string | null
  readonly examType: string | null
  readonly semester: string | null
  readonly tags: readonly string[]
  readonly assets: readonly QuestionBankAsset[]
}

export interface QuestionBankQuestionRequest {
  readonly questionId: string
}

export interface QuestionBankLessonCopyRequest extends QuestionBankQuestionRequest {
  readonly lessonId: string
}

export function isQuestionBankFacetValue(value: unknown): value is QuestionBankFacetValue {
  return isRecord(value) && hasOnlyKeys(value, ['value', 'label', 'count']) &&
    isBoundedString(value.value, 256, false) &&
    isBoundedString(value.label, 256, false) &&
    isNonNegativeInteger(value.count)
}

export function isQuestionBankSummary(value: unknown): value is QuestionBankSummary {
  return isRecord(value) && hasOnlyKeys(value, [
    'installed', 'packageId', 'sourceName', 'exportedAt', 'questionCount', 'paperCount',
    'assetCount', 'grades', 'years', 'months', 'types', 'tags', 'difficultyMin',
    'difficultyMax',
  ]) && typeof value.installed === 'boolean' &&
    isNullableBoundedString(value.packageId, 256) &&
    isNullableBoundedString(value.sourceName, 512) &&
    isNullableBoundedString(value.exportedAt, 64) &&
    isNonNegativeInteger(value.questionCount) &&
    isNonNegativeInteger(value.paperCount) &&
    isNonNegativeInteger(value.assetCount) &&
    isFacetArray(value.grades) && isFacetArray(value.years) && isFacetArray(value.months) &&
    isFacetArray(value.types) && isFacetArray(value.tags) &&
    isNullableDifficulty(value.difficultyMin) && isNullableDifficulty(value.difficultyMax)
}

export function isQuestionBankSearchRequest(value: unknown): value is QuestionBankSearchRequest {
  if (!isRecord(value) || !hasOnlyOptionalKeys(value, [
    'text', 'grade', 'year', 'month', 'type', 'tag', 'difficultyMin',
    'difficultyMax', 'limit', 'offset',
  ])) return false
  return optionalString(value.text, 256) && optionalString(value.grade, 64) &&
    optionalInteger(value.year, 1900, 2200) && optionalInteger(value.month, 1, 12) &&
    optionalString(value.type, 64) && optionalString(value.tag, 128) &&
    optionalInteger(value.difficultyMin, 0, 100) &&
    optionalInteger(value.difficultyMax, 0, 100) &&
    optionalInteger(value.limit, 1, 100) && optionalInteger(value.offset, 0, 1_000_000)
}

export function isQuestionBankSearchItem(value: unknown): value is QuestionBankSearchItem {
  return isRecord(value) && hasOnlyKeys(value, [
    'id', 'questionNo', 'type', 'typeLabel', 'subject', 'grade', 'contentPreview',
    'difficulty', 'score', 'paperTitle', 'year', 'month', 'examType', 'tags', 'hasAssets',
  ]) && isQuestionId(value.id) && isNullableBoundedString(value.questionNo, 128) &&
    isBoundedString(value.type, 64, false) && isBoundedString(value.typeLabel, 128, false) &&
    isBoundedString(value.subject, 128, false) && isNullableBoundedString(value.grade, 64) &&
    isBoundedString(value.contentPreview, 2_048, true) && isNullableDifficulty(value.difficulty) &&
    isNullableFiniteNumber(value.score) && isNullableBoundedString(value.paperTitle, 1_024) &&
    isNullableInteger(value.year) && isNullableInteger(value.month) &&
    isNullableBoundedString(value.examType, 128) && isStringArray(value.tags, 128, 128) &&
    typeof value.hasAssets === 'boolean'
}

export function isQuestionBankSearchResult(value: unknown): value is QuestionBankSearchResult {
  return isRecord(value) && hasOnlyKeys(value, ['total', 'limit', 'offset', 'items']) &&
    isNonNegativeInteger(value.total) && isIntegerBetween(value.limit, 1, 100) &&
    isNonNegativeInteger(value.offset) && Array.isArray(value.items) &&
    value.items.every(isQuestionBankSearchItem)
}

export function isQuestionBankOption(value: unknown): value is QuestionBankOption {
  return isRecord(value) && hasOnlyKeys(value, ['key', 'text']) &&
    isBoundedString(value.key, 32, false) && isBoundedString(value.text, 8_192, true)
}

export function isQuestionBankAsset(value: unknown): value is QuestionBankAsset {
  return isRecord(value) && hasOnlyKeys(value, ['id', 'role', 'mimeType', 'dataUrl']) &&
    isNonNegativeInteger(value.id) && isBoundedString(value.role, 64, false) &&
    isBoundedString(value.mimeType, 128, false) && isDataUrl(value.dataUrl)
}

export function isQuestionBankDetail(value: unknown): value is QuestionBankDetail {
  return isRecord(value) && hasOnlyKeys(value, [
    'id', 'questionNo', 'type', 'typeLabel', 'subject', 'grade', 'section', 'content',
    'options', 'answer', 'analysis', 'difficulty', 'score', 'contentHash', 'paperTitle',
    'year', 'month', 'region', 'examType', 'semester', 'tags', 'assets',
  ]) && isQuestionId(value.id) && isNullableBoundedString(value.questionNo, 128) &&
    isBoundedString(value.type, 64, false) && isBoundedString(value.typeLabel, 128, false) &&
    isBoundedString(value.subject, 128, false) && isNullableBoundedString(value.grade, 64) &&
    isNullableBoundedString(value.section, 4_096) && isBoundedString(value.content, 100_000, true) &&
    Array.isArray(value.options) && value.options.every(isQuestionBankOption) &&
    isBoundedString(value.answer, 100_000, true) && isBoundedString(value.analysis, 300_000, true) &&
    isNullableDifficulty(value.difficulty) && isNullableFiniteNumber(value.score) &&
    isNullableBoundedString(value.contentHash, 128) && isNullableBoundedString(value.paperTitle, 1_024) &&
    isNullableInteger(value.year) && isNullableInteger(value.month) &&
    isNullableBoundedString(value.region, 256) && isNullableBoundedString(value.examType, 128) &&
    isNullableBoundedString(value.semester, 128) && isStringArray(value.tags, 128, 128) &&
    Array.isArray(value.assets) && value.assets.length <= 100 && value.assets.every(isQuestionBankAsset)
}

export function isQuestionBankQuestionRequest(value: unknown): value is QuestionBankQuestionRequest {
  return isRecord(value) && hasOnlyKeys(value, ['questionId']) && isQuestionId(value.questionId)
}

export function isQuestionBankLessonCopyRequest(value: unknown): value is QuestionBankLessonCopyRequest {
  return isRecord(value) && hasOnlyKeys(value, ['questionId', 'lessonId']) &&
    isQuestionId(value.questionId) && isBoundedString(value.lessonId, 128, false)
}

function isQuestionId(value: unknown): value is string {
  return isBoundedString(value, 512, false) && !value.includes('\0')
}

function isFacetArray(value: unknown): value is readonly QuestionBankFacetValue[] {
  return Array.isArray(value) && value.length <= 2_000 && value.every(isQuestionBankFacetValue)
}

function isStringArray(value: unknown, maximumItems: number, maximumLength: number): value is readonly string[] {
  return Array.isArray(value) && value.length <= maximumItems &&
    value.every((item) => isBoundedString(item, maximumLength, false))
}

function isDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 20_000_000 &&
    /^data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[a-z0-9+/=]*$/i.test(value)
}

function isBoundedString(value: unknown, maximum: number, allowEmpty: boolean): value is string {
  return typeof value === 'string' && value.length <= maximum && (allowEmpty || value.trim().length > 0)
}

function isNullableBoundedString(value: unknown, maximum: number): value is string | null {
  return value === null || isBoundedString(value, maximum, true)
}

function optionalString(value: unknown, maximum: number): boolean {
  return value === undefined || isBoundedString(value, maximum, true)
}

function optionalInteger(value: unknown, minimum: number, maximum: number): boolean {
  return value === undefined || isIntegerBetween(value, minimum, maximum)
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value))
}

function isNonNegativeInteger(value: unknown): value is number {
  return isIntegerBetween(value, 0, Number.MAX_SAFE_INTEGER)
}

function isIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

function isNullableDifficulty(value: unknown): value is number | null {
  return value === null || isIntegerBetween(value, 0, 100)
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function hasOnlyOptionalKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}
