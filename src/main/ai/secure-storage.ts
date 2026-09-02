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

export type SecureStorageSlot = 'ai' | 'mineru'

/** V16-D：多槽路径。ai 槽维持历史文件名（不迁移不改名）；mineru 槽走通用 `<slot>-key` 模式。 */
export function secureSlotKeyPath(slot: SecureStorageSlot): string {
  const fileName = slot === 'ai'
    ? 'teacher-workbench-ai-key.bin'
    : `teacher-workbench-${slot}-key.bin`
  return join(app.getPath('userData'), fileName)
}

export function createElectronSecureStorage(slot: SecureStorageSlot): SecureStoragePort {
  const secureKeyPath = (): string => secureSlotKeyPath(slot)
  return {
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
      const temporaryPath = join(directory, `.teacher-workbench-${slot}-key-${process.pid}-${Date.now()}.tmp`)
      writeFileSync(temporaryPath, value, { flag: 'wx' })
      renameSync(temporaryPath, path)
    },
    clear: () => {
      const path = secureKeyPath()
      if (existsSync(path)) unlinkSync(path)
    },
  }
}

/** V16-D 之前的历史单槽实例（ai 槽，保持既有引用不变）。 */
export const electronSecureStorage: SecureStoragePort = createElectronSecureStorage('ai')

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
