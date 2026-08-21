import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface SecureStoragePort {
  readonly isAvailable: () => boolean
  readonly encrypt: (value: string) => Buffer
  readonly decrypt: (value: Buffer) => string
  readonly read: () => Buffer | undefined
  readonly write: (value: Buffer) => void
  readonly clear: () => void
}

export interface StoredApiKey {
  readonly mode: 'secure' | 'session' | 'none' | 'unavailable'
  readonly value?: string
}

export const electronSecureStorage: SecureStoragePort = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (value) => safeStorage.encryptString(value),
  decrypt: (value) => safeStorage.decryptString(value),
  read: () => {
    const path = secureKeyPath()
    return existsSync(path) ? readFileSync(path) : undefined
  },
  write: (value) => {
    const path = secureKeyPath()
    const directory = app.getPath('userData')
    mkdirSync(directory, { recursive: true })
    const temporaryPath = join(directory, `.teacher-workbench-ai-key-${process.pid}-${Date.now()}.tmp`)
    writeFileSync(temporaryPath, value, { flag: 'wx' })
    renameSync(temporaryPath, path)
  },
  clear: () => {
    const path = secureKeyPath()
    if (existsSync(path)) unlinkSync(path)
  },
}

export function encodeSecureKey(storage: SecureStoragePort, value: string): Buffer {
  if (!storage.isAvailable()) {
    throw new Error('Secure storage is unavailable')
  }
  return storage.encrypt(value)
}

export function decodeSecureKey(storage: SecureStoragePort, value: Buffer): string {
  if (!storage.isAvailable()) {
    throw new Error('Secure storage is unavailable')
  }
  return storage.decrypt(value)
}

function secureKeyPath(): string {
  return join(app.getPath('userData'), 'teacher-workbench-ai-key.bin')
}
