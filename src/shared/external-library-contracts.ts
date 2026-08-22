import { isRecord } from './ipc-contracts'

export type ExternalEntryKind = 'folder' | 'file'

export interface ExternalRootSummary {
  readonly id: string
  readonly name: string
  readonly available: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ExternalEntry {
  readonly rootId: string
  readonly relativePath: string
  readonly name: string
  readonly kind: ExternalEntryKind
  readonly extension: string | null
  readonly sizeBytes: number | null
  readonly modifiedAt: string
}

export interface ExternalDirectoryListing {
  readonly root: ExternalRootSummary
  readonly directoryRelativePath: string
  readonly entries: readonly ExternalEntry[]
}

export interface ExternalPathRequest {
  readonly rootId: string
  readonly relativePath: string
}

export interface ExternalActionResult {
  readonly accepted: true
}

export function isExternalRootSummary(value: unknown): value is ExternalRootSummary {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['id', 'name', 'available', 'createdAt', 'updatedAt']) &&
    isNonEmptyString(value.id, 128) &&
    isNonEmptyString(value.name, 512) &&
    typeof value.available === 'boolean' &&
    isNonEmptyString(value.createdAt, 64) &&
    isNonEmptyString(value.updatedAt, 64)
  )
}

export function isNullableExternalRootSummary(
  value: unknown,
): value is ExternalRootSummary | null {
  return value === null || isExternalRootSummary(value)
}

export function isExternalEntry(value: unknown): value is ExternalEntry {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'rootId',
      'relativePath',
      'name',
      'kind',
      'extension',
      'sizeBytes',
      'modifiedAt',
    ]) &&
    isNonEmptyString(value.rootId, 128) &&
    isSafeRelativePath(value.relativePath, false) &&
    isNonEmptyString(value.name, 512) &&
    (value.kind === 'folder' || value.kind === 'file') &&
    (value.extension === null || isNonEmptyString(value.extension, 64)) &&
    (value.sizeBytes === null || isNonNegativeInteger(value.sizeBytes)) &&
    isNonEmptyString(value.modifiedAt, 64)
  )
}

export function isExternalDirectoryListing(
  value: unknown,
): value is ExternalDirectoryListing {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['root', 'directoryRelativePath', 'entries']) &&
    isExternalRootSummary(value.root) &&
    isSafeRelativePath(value.directoryRelativePath, true) &&
    Array.isArray(value.entries) &&
    value.entries.every(isExternalEntry)
  )
}

export function isExternalPathRequest(value: unknown): value is ExternalPathRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['rootId', 'relativePath']) &&
    isNonEmptyString(value.rootId, 128) &&
    isSafeRelativePath(value.relativePath, true)
  )
}

export function isExternalActionResult(value: unknown): value is ExternalActionResult {
  return isRecord(value) && hasOnlyKeys(value, ['accepted']) && value.accepted === true
}

function isSafeRelativePath(value: unknown, allowEmpty: boolean): value is string {
  if (typeof value !== 'string' || value.length > 4_096 || value.includes('\0')) {
    return false
  }
  if (value === '') {
    return allowEmpty
  }
  if (
    value.startsWith('/') ||
    value.startsWith('\\') ||
    /^[a-zA-Z]:[\\/]/.test(value)
  ) {
    return false
  }
  return !value.split(/[\\/]+/).some((segment) => segment === '..')
}

function isNonEmptyString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key)) &&
    allowed.every((key) => Object.hasOwn(value, key))
}
