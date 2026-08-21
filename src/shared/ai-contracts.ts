import { isRecord } from './ipc-contracts'

export const AI_PROVIDERS = {
  openaiCompatible: 'openai-compatible',
} as const

export type AiProvider = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS]

export const AI_KEY_STORAGE_MODES = {
  secure: 'secure',
  session: 'session',
  none: 'none',
  unavailable: 'unavailable',
} as const

export type AiKeyStorageMode = (typeof AI_KEY_STORAGE_MODES)[keyof typeof AI_KEY_STORAGE_MODES]

export interface AiSettings {
  readonly provider: AiProvider
  readonly model: string
  readonly endpoint: string
  readonly keyConfigured: boolean
  readonly keyStorage: AiKeyStorageMode
}

export interface UpdateAiSettingsRequest {
  readonly provider: AiProvider
  readonly model: string
  readonly endpoint: string
  readonly apiKey?: string
  readonly clearApiKey?: boolean
}

export interface AiRequestIdRequest {
  readonly requestId: string
}

export interface AiTextRequest extends AiRequestIdRequest {
  readonly prompt: string
  readonly maxTokens?: number
}

export interface AiConnectionTestResult {
  readonly provider: AiProvider
  readonly model: string
  readonly latencyMs: number
}

export interface AiTextResult {
  readonly text: string
  readonly model: string
}

export interface AiCancelResult {
  readonly cancelled: boolean
}

export const DEFAULT_AI_SETTINGS = {
  provider: AI_PROVIDERS.openaiCompatible,
  model: 'gpt-4o-mini',
  endpoint: 'https://api.openai.com/v1',
} as const

export function isAiProvider(value: unknown): value is AiProvider {
  return value === AI_PROVIDERS.openaiCompatible
}

export function isAiKeyStorageMode(value: unknown): value is AiKeyStorageMode {
  return typeof value === 'string' && Object.values(AI_KEY_STORAGE_MODES).includes(value as AiKeyStorageMode)
}

export function isAiSettings(value: unknown): value is AiSettings {
  return (
    isRecord(value) &&
    isAiProvider(value.provider) &&
    isNonEmptyString(value.model, 200) &&
    isEndpoint(value.endpoint) &&
    typeof value.keyConfigured === 'boolean' &&
    isAiKeyStorageMode(value.keyStorage)
  )
}

export function isUpdateAiSettingsRequest(value: unknown): value is UpdateAiSettingsRequest {
  if (!isRecord(value) || !hasOnlyKeys(value, ['provider', 'model', 'endpoint', 'apiKey', 'clearApiKey']) || !isAiProvider(value.provider) || !isNonEmptyString(value.model, 200) || !isEndpoint(value.endpoint)) {
    return false
  }
  if ('apiKey' in value && value.apiKey !== undefined && (typeof value.apiKey !== 'string' || value.apiKey.length > 4096)) {
    return false
  }
  return !('clearApiKey' in value) || value.clearApiKey === undefined || typeof value.clearApiKey === 'boolean'
}

export function isAiRequestIdRequest(value: unknown): value is AiRequestIdRequest {
  return isRecord(value) && hasOnlyKeys(value, ['requestId']) && isNonEmptyString(value.requestId, 128)
}

export function isAiTextRequest(value: unknown): value is AiTextRequest {
  if (!isRecord(value) || !hasOnlyKeys(value, ['requestId', 'prompt', 'maxTokens']) || !isNonEmptyString(value.requestId, 128)) {
    return false
  }
  const record = value as unknown as AiTextRequest
  if (!isNonEmptyString(record.prompt, 200_000)) return false
  return (
    (!('maxTokens' in record) ||
    record.maxTokens === undefined ||
    (typeof record.maxTokens === 'number' && Number.isInteger(record.maxTokens) && record.maxTokens > 0 && record.maxTokens <= 32_000))
  )
}

export function isAiConnectionTestResult(value: unknown): value is AiConnectionTestResult {
  return (
    isRecord(value) &&
    isAiProvider(value.provider) &&
    isNonEmptyString(value.model, 200) &&
    typeof value.latencyMs === 'number' &&
    Number.isFinite(value.latencyMs) &&
    value.latencyMs >= 0
  )
}

export function isAiTextResult(value: unknown): value is AiTextResult {
  return isRecord(value) && isNonEmptyString(value.text, 200_000) && isNonEmptyString(value.model, 200)
}

export function isAiCancelResult(value: unknown): value is AiCancelResult {
  return isRecord(value) && typeof value.cancelled === 'boolean'
}

export function normalizeAiEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '')
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function isEndpoint(value: unknown): value is string {
  if (!isNonEmptyString(value, 2_048)) {
    return false
  }
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== '' && url.username === '' && url.password === ''
  } catch {
    return false
  }
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}
