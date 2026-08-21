import type { SqliteDatabase } from '../db/migrations'
import {
  AI_KEY_STORAGE_MODES,
  DEFAULT_AI_SETTINGS,
  normalizeAiEndpoint,
  type AiKeyStorageMode,
  type AiSettings,
  type UpdateAiSettingsRequest,
} from '../../shared/ai-contracts'
import { decodeSecureKey, encodeSecureKey, type SecureStoragePort } from './secure-storage'

interface AiSettingsRow {
  readonly provider: AiSettings['provider']
  readonly model: string
  readonly endpoint: string
  readonly updated_at: string
}

export interface AiSettingsServiceOptions {
  readonly secureStorage: SecureStoragePort
  readonly initialSessionKey?: string
}

export class AiSettingsService {
  private readonly secureStorage: SecureStoragePort
  private sessionKey: string | undefined

  constructor(
    private readonly database: SqliteDatabase,
    options: AiSettingsServiceOptions,
  ) {
    this.secureStorage = options.secureStorage
    this.sessionKey = options.initialSessionKey
  }

  getSettings(): AiSettings {
    const row = this.database.prepare('SELECT provider, model, endpoint, updated_at FROM ai_settings WHERE id = 1').get() as AiSettingsRow | undefined
    const storage = this.getKeyStorageMode()
    return {
      provider: row?.provider ?? DEFAULT_AI_SETTINGS.provider,
      model: row?.model ?? DEFAULT_AI_SETTINGS.model,
      endpoint: row?.endpoint ?? DEFAULT_AI_SETTINGS.endpoint,
      keyConfigured: storage === AI_KEY_STORAGE_MODES.secure || storage === AI_KEY_STORAGE_MODES.session,
      keyStorage: storage,
    }
  }

  updateSettings(request: UpdateAiSettingsRequest): AiSettings {
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO ai_settings (id, provider, model, endpoint, updated_at)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, model = excluded.model, endpoint = excluded.endpoint, updated_at = excluded.updated_at
    `).run(request.provider, request.model.trim(), normalizeAiEndpoint(request.endpoint), now)

    if (request.clearApiKey === true) {
      return this.clearApiKey()
    }
    if (request.apiKey !== undefined) {
      this.setApiKey(request.apiKey)
    }
    return this.getSettings()
  }

  getApiKey(): string | undefined {
    if (this.sessionKey !== undefined) {
      return this.sessionKey
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

  clearApiKey(): AiSettings {
    this.secureStorage.clear()
    this.sessionKey = undefined
    return this.getSettings()
  }

  private setApiKey(apiKey: string): void {
    const trimmed = apiKey.trim()
    if (trimmed === '') {
      this.clearApiKey()
      return
    }
    this.sessionKey = undefined
    if (this.secureStorage.isAvailable()) {
      const encrypted = encodeSecureKey(this.secureStorage, trimmed)
      this.secureStorage.write(encrypted)
      return
    }
    this.sessionKey = trimmed
  }

  private getKeyStorageMode(): AiKeyStorageMode {
    if (this.sessionKey !== undefined) {
      return AI_KEY_STORAGE_MODES.session
    }
    if (!this.secureStorage.isAvailable()) return AI_KEY_STORAGE_MODES.unavailable
    return this.secureStorage.read() === undefined ? AI_KEY_STORAGE_MODES.none : AI_KEY_STORAGE_MODES.secure
  }
}
