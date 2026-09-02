import { isRecord } from './ipc-contracts'

export const MINERU_KEY_STORAGE_MODES = {
  secure: 'secure',
  session: 'session',
  none: 'none',
  unavailable: 'unavailable',
} as const

export type MineruKeyStorageMode = (typeof MINERU_KEY_STORAGE_MODES)[keyof typeof MINERU_KEY_STORAGE_MODES]

export interface MineruSettings {
  readonly tokenConfigured: boolean
  readonly tokenStorage: MineruKeyStorageMode
}

export interface UpdateMineruSettingsRequest {
  readonly token?: string
  readonly clearToken?: boolean
}

export interface MineruTokenRequest {
  readonly token: string
}

export interface MineruEnhanceRequest {
  readonly fileId: string
}

export interface MineruFileIdRequest {
  readonly fileId: string
}

export type MineruTaskState = 'queued' | 'running' | 'done' | 'failed'

export interface MineruStatus {
  readonly state: MineruTaskState
  readonly message?: string
}

export interface MineruConnectionTestResult {
  readonly latencyMs: number
}

export interface MineruEnhanceResult {
  readonly accepted: true
  readonly state: MineruTaskState
}

export function isMineruSettings(value: unknown): value is MineruSettings {
  return (
    isRecord(value) &&
    typeof value.tokenConfigured === 'boolean' &&
    isMineruKeyStorageMode(value.tokenStorage)
  )
}

export function isMineruKeyStorageMode(value: unknown): value is MineruKeyStorageMode {
  return typeof value === 'string' && Object.values(MINERU_KEY_STORAGE_MODES).includes(value as MineruKeyStorageMode)
}

export function isUpdateMineruSettingsRequest(value: unknown): value is UpdateMineruSettingsRequest {
  if (!isRecord(value) || !hasOnlyKeys(value, ['token', 'clearToken'])) {
    return false
  }
  if ('token' in value && value.token !== undefined && (typeof value.token !== 'string' || value.token.length > 4096)) {
    return false
  }
  return !('clearToken' in value) || value.clearToken === undefined || value.clearToken === true
}

export function isMineruTokenRequest(value: unknown): value is MineruTokenRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['token']) &&
    typeof value.token === 'string' &&
    value.token.trim().length > 0 &&
    value.token.length <= 4096
  )
}

export function isMineruFileIdRequest(value: unknown): value is MineruFileIdRequest {
  return isRecord(value) && hasOnlyKeys(value, ['fileId']) && isNonEmptyString(value.fileId, 128)
}

export function isMineruStatus(value: unknown): value is MineruStatus {
  if (!isRecord(value) || !hasOnlyKeys(value, ['state', 'message'])) {
    return false
  }
  if (value.state !== 'queued' && value.state !== 'running' && value.state !== 'done' && value.state !== 'failed') {
    return false
  }
  return value.message === undefined || isNonEmptyString(value.message, 500)
}

export function isMineruConnectionTestResult(value: unknown): value is MineruConnectionTestResult {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['latencyMs']) &&
    typeof value.latencyMs === 'number' &&
    Number.isFinite(value.latencyMs) &&
    value.latencyMs >= 0
  )
}

export function isMineruEnhanceResult(value: unknown): value is MineruEnhanceResult {
  return isRecord(value) && hasOnlyKeys(value, ['accepted', 'state']) && value.accepted === true &&
    (value.state === 'queued' || value.state === 'running')
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}
