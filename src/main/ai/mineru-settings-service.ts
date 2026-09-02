import {
  MINERU_KEY_STORAGE_MODES,
  type MineruKeyStorageMode,
  type MineruSettings,
  type UpdateMineruSettingsRequest,
} from '../../shared/mineru-contracts'
import { decodeSecureKey, encodeSecureKey, type SecureStoragePort } from './secure-storage'

/**
 * V16-D：MinerU token 设置服务（复制 AiSettingsService 的 Key 处理模式）。
 * 无 DB 行、无 endpoint/model；token 与 AI Key 同一套 safeStorage 安全待遇（不回显、不进日志/备份）。
 */
export class MineruSettingsService {
  private sessionToken: string | undefined

  constructor(
    private readonly secureStorage: SecureStoragePort,
    sessionToken?: string,
  ) {
    this.sessionToken = sessionToken
  }

  getSettings(): MineruSettings {
    const storage = this.getTokenStorageMode()
    return {
      tokenConfigured: storage === MINERU_KEY_STORAGE_MODES.secure || storage === MINERU_KEY_STORAGE_MODES.session,
      tokenStorage: storage,
    }
  }

  updateSettings(request: UpdateMineruSettingsRequest): MineruSettings {
    if (request.clearToken === true) {
      return this.clearToken()
    }
    if (request.token !== undefined) {
      this.setToken(request.token)
    }
    return this.getSettings()
  }

  getToken(): string | undefined {
    if (this.sessionToken !== undefined) {
      return this.sessionToken
    }
    if (!this.secureStorage.isAvailable()) return undefined
    const encrypted = this.secureStorage.read()
    if (encrypted === undefined) return undefined
    try {
      return decodeSecureKey(this.secureStorage, encrypted)
    } catch {
      return undefined
    }
  }

  clearToken(): MineruSettings {
    this.secureStorage.clear()
    this.sessionToken = undefined
    return this.getSettings()
  }

  private setToken(token: string): void {
    const trimmed = token.trim()
    if (trimmed === '') {
      this.clearToken()
      return
    }
    this.sessionToken = undefined
    if (this.secureStorage.isAvailable()) {
      const encrypted = encodeSecureKey(this.secureStorage, trimmed)
      this.secureStorage.write(encrypted)
      return
    }
    this.sessionToken = trimmed
  }

  private getTokenStorageMode(): MineruKeyStorageMode {
    if (this.sessionToken !== undefined) {
      return MINERU_KEY_STORAGE_MODES.session
    }
    if (!this.secureStorage.isAvailable()) return MINERU_KEY_STORAGE_MODES.unavailable
    return this.secureStorage.read() === undefined ? MINERU_KEY_STORAGE_MODES.none : MINERU_KEY_STORAGE_MODES.secure
  }
}
