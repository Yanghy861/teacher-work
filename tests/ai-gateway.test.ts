import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { AiGateway, AiGatewayError, DEFAULT_AI_TIMEOUT_MS, type AiFetch, type AiFetchResponse } from '../src/main/ai/ai-gateway'
import { AiSettingsService } from '../src/main/ai/ai-settings-service'
import type { SecureStoragePort } from '../src/main/ai/secure-storage'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'

const roots: string[] = []
const workspaces: WorkspaceHandle[] = []

afterEach(() => {
  for (const workspace of workspaces.splice(0)) workspace.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(available = true): { service: AiSettingsService; secure: SecureStoragePort; workspace: WorkspaceHandle } {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-l08-'))
  roots.push(root)
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  workspaces.push(workspace)
  let encryptedValue: Buffer | undefined
  const secure: SecureStoragePort = {
    isAvailable: () => available,
    encrypt: (value) => Buffer.from(value.split('').reverse().join(''), 'utf8'),
    decrypt: (value) => value.toString('utf8').split('').reverse().join(''),
    read: () => encryptedValue,
    write: (value) => { encryptedValue = value },
    clear: () => { encryptedValue = undefined },
  }
  return { service: new AiSettingsService(workspace.database.raw, { secureStorage: secure }), secure, workspace }
}

function response(status: number, payload: unknown): AiFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }
}

describe('L08 secure settings and AI gateway', () => {
  it('keeps ordinary settings in SQLite but never stores the API key plaintext', () => {
    const { service, workspace } = fixture(true)
    const configured = service.updateSettings({
      provider: 'openai-compatible',
      model: 'fake-model',
      endpoint: 'https://fake.local/v1/',
      apiKey: 'L08_SECRET_KEY',
    })
    expect(configured).toMatchObject({ model: 'fake-model', endpoint: 'https://fake.local/v1', keyConfigured: true, keyStorage: 'secure' })
    expect(service.getApiKey()).toBe('L08_SECRET_KEY')
    expect(workspace.database.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_secure_key'").get()).toBeUndefined()
    expect(JSON.stringify(configured)).not.toContain('L08_SECRET_KEY')

    service.updateSettings({ provider: 'openai-compatible', model: 'fake-model-2', endpoint: 'https://fake.local/v1', apiKey: 'L08_SECRET_KEY_2' })
    expect(service.getApiKey()).toBe('L08_SECRET_KEY_2')
    expect(service.clearApiKey()).toMatchObject({ keyConfigured: false })
    expect(service.getApiKey()).toBeUndefined()
  })

  it('uses session-only key storage when safe storage is unavailable', () => {
    const { service } = fixture(false)
    expect(service.updateSettings({ provider: 'openai-compatible', model: 'fake', endpoint: 'http://127.0.0.1:1/v1', apiKey: 'SESSION_ONLY_KEY' })).toMatchObject({ keyConfigured: true, keyStorage: 'session' })
    expect(service.getApiKey()).toBe('SESSION_ONLY_KEY')
  })

  it('handles fake provider success and common HTTP failures without logging credentials', async () => {
    const { service } = fixture(true)
    service.updateSettings({ provider: 'openai-compatible', model: 'fake-model', endpoint: 'https://fake.local/v1', apiKey: 'FAKE_SECRET' })
    const seen: Array<{ url: string; authorization: string | undefined }> = []
    const fetcher: AiFetch = async (url, init) => {
      seen.push({ url, authorization: init.headers.Authorization })
      return response(200, { model: 'fake-model', choices: [{ message: { content: 'fake answer' } }] })
    }
    const gateway = new AiGateway(service, { fetch: fetcher, timeoutMs: 100 })
    await expect(gateway.requestText('success-1', 'hello')).resolves.toEqual({ text: 'fake answer', model: 'fake-model' })
    await expect(gateway.testConnection('success-2')).resolves.toMatchObject({ provider: 'openai-compatible', model: 'fake-model' })
    expect(seen[0]).toMatchObject({ url: 'https://fake.local/v1/chat/completions', authorization: 'Bearer FAKE_SECRET' })

    for (const [status, code] of [[401, 'AI_UNAUTHORIZED'], [429, 'AI_RATE_LIMITED'], [503, 'AI_UPSTREAM']] as const) {
      const failing = new AiGateway(service, { fetch: async () => response(status, { error: { message: 'do not expose' } }), timeoutMs: 100 })
      await expect(failing.requestText(`status-${status}`, 'hello')).rejects.toMatchObject({ code })
    }
  })

  it('maps timeout and explicit cancellation separately', async () => {
    const { service } = fixture(true)
    service.updateSettings({ provider: 'openai-compatible', model: 'fake', endpoint: 'https://fake.local/v1', apiKey: 'TIMEOUT_SECRET' })
    const hanging: AiFetch = (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })
    const gateway = new AiGateway(service, { fetch: hanging, timeoutMs: 20 })
    await expect(gateway.requestText('timeout-1', 'hello')).rejects.toMatchObject({ code: 'AI_TIMEOUT' })

    const cancelPromise = gateway.requestText('cancel-1', 'hello')
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(gateway.cancel('cancel-1')).toBe(true)
    await expect(cancelPromise).rejects.toMatchObject({ code: 'AI_CANCELLED' })
    expect(gateway.cancel('missing')).toBe(false)
  })

  it('rejects missing key and invalid endpoint before making a request', async () => {
    const { service } = fixture(true)
    const fetcher: AiFetch = async () => response(200, {})
    const gateway = new AiGateway(service, { fetch: fetcher })
    await expect(gateway.requestText('missing-key', 'hello')).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' })
    service.updateSettings({ provider: 'openai-compatible', model: 'fake', endpoint: 'not-a-url', apiKey: 'KEY' })
    await expect(gateway.requestText('bad-endpoint', 'hello')).rejects.toMatchObject({ code: 'AI_INVALID_ENDPOINT' })
    expect(new AiGatewayError('AI_NETWORK', 'safe')).toBeInstanceOf(Error)
  })

  it('exposes a 120s default timeout constant for thinking-mode backends (V16-A)', () => {
    expect(DEFAULT_AI_TIMEOUT_MS).toBe(120_000)
  })

  it('treats a structurally valid chat.completion with empty content as a passing connection test (V16-A)', async () => {
    const { service } = fixture(true)
    service.updateSettings({ provider: 'openai-compatible', model: 'deepseek-thinking', endpoint: 'https://fake.local/v1', apiKey: 'KEY' })
    const fetcher: AiFetch = async () => response(200, {
      model: 'deepseek-thinking',
      choices: [{ message: { content: '', reasoning_content: 'pong' } }],
    })
    const gateway = new AiGateway(service, { fetch: fetcher, timeoutMs: 100 })
    await expect(gateway.testConnection('thinking-ping')).resolves.toMatchObject({
      provider: 'openai-compatible',
      model: 'deepseek-thinking',
    })
  })

  it('still rejects empty business responses but requires a real chat.completion shape for connection tests (V16-A)', async () => {
    const { service } = fixture(true)
    service.updateSettings({ provider: 'openai-compatible', model: 'fake', endpoint: 'https://fake.local/v1', apiKey: 'KEY' })
    const emptyContent: AiFetch = async () => response(200, { model: 'fake', choices: [{ message: { content: '' } }] })
    const business = new AiGateway(service, { fetch: emptyContent, timeoutMs: 100 })
    await expect(business.requestText('empty-body', 'hello')).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })

    const notChatCompletion: AiFetch = async () => response(200, { ok: true })
    const connection = new AiGateway(service, { fetch: notChatCompletion, timeoutMs: 100 })
    await expect(connection.testConnection('bad-structure')).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })

    const noChoices: AiFetch = async () => response(200, { model: 'fake', choices: [] })
    const emptyChoices = new AiGateway(service, { fetch: noChoices, timeoutMs: 100 })
    await expect(emptyChoices.testConnection('empty-choices')).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })
  })
})
