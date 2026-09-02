import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import {
  AI_STREAM_IDLE_TIMEOUT_MS,
  AiGateway,
  type AiFetch,
  type AiFetchResponse,
  type AiGatewayStreamChunk,
} from '../src/main/ai/ai-gateway'
import { AiSettingsService } from '../src/main/ai/ai-settings-service'
import type { SecureStoragePort } from '../src/main/ai/secure-storage'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'

const roots: string[] = []
const workspaces: WorkspaceHandle[] = []

afterEach(() => {
  for (const workspace of workspaces.splice(0)) workspace.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(): { service: AiSettingsService } {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-v16c-'))
  roots.push(root)
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  workspaces.push(workspace)
  let encryptedValue: Buffer | undefined
  const secure: SecureStoragePort = {
    isAvailable: () => true,
    encrypt: (value) => Buffer.from(value.split('').reverse().join(''), 'utf8'),
    decrypt: (value) => value.toString('utf8').split('').reverse().join(''),
    read: () => encryptedValue,
    write: (value) => { encryptedValue = value },
    clear: () => { encryptedValue = undefined },
  }
  const service = new AiSettingsService(workspace.database.raw, { secureStorage: secure })
  service.updateSettings({ provider: 'openai-compatible', model: 'deepseek-thinking', endpoint: 'https://fake.local/v1', apiKey: 'STREAM_KEY' })
  return { service }
}

function sseResponse(chunks: readonly string[], delayMs = 0): AiFetchResponse {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
  return {
    ok: true,
    status: 200,
    json: async () => { throw new Error('json() not expected on stream') },
    text: async () => chunks.join(''),
    body: stream,
  }
}

describe('V16-C AI gateway streaming (D22)', () => {
  it('parses SSE chunks, counts reasoning progress and assembles the full text', async () => {
    const { service } = fixture()
    const events: AiGatewayStreamChunk[] = []
    const fetcher: AiFetch = async () => sseResponse([
      'data: {"model":"deepseek-thinking","choices":[{"delta":{"reasoning_content":"让我想想"}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"再想想"}}]}\n\n',
      ': heartbeat keep-alive\n\n',
      'data: not-json-garbage\n\n',
      'data: {"choices":[{"delta":{"content":"# 讲义\\n"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"正文内容。"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    const gateway = new AiGateway(service, { fetch: fetcher })
    const result = await gateway.requestStreamText('stream-1', 'prompt', 16_000, (chunk) => events.push(chunk))

    expect(result).toEqual({ text: '# 讲义\n正文内容。', model: 'deepseek-thinking' })
    expect(events).toEqual([
      { kind: 'reasoning', chars: 4 },
      { kind: 'reasoning', chars: 3 },
      { kind: 'text', text: '# 讲义\n' },
      { kind: 'text', text: '正文内容。' },
    ])
  })

  it('splits SSE events arriving within one network chunk and across chunk boundaries', async () => {
    const { service } = fixture()
    const texts: string[] = []
    const fetcher: AiFetch = async () => sseResponse([
      'data: {"choices":[{"delta":{"content":"A"}}]}\ndata: {"choices":[{"delta":{"content":"B"}}]}\n',
      '\ndata: {"choices":[{"delta":{"content":"C"}}]}\n\n',
    ])
    const gateway = new AiGateway(service, { fetch: fetcher })
    const result = await gateway.requestStreamText('stream-2', 'prompt', undefined, (chunk) => {
      if (chunk.kind === 'text') texts.push(chunk.text)
    })
    expect(result.text).toBe('ABC')
    expect(texts).toEqual(['A', 'B', 'C'])
  })

  it('rejects an empty streamed body with AI_INVALID_RESPONSE', async () => {
    const { service } = fixture()
    const fetcher: AiFetch = async () => sseResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"只有思维链"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    const gateway = new AiGateway(service, { fetch: fetcher })
    await expect(gateway.requestStreamText('stream-3', 'prompt', 100, () => undefined))
      .rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })
  })

  it('supports cancellation through the shared AbortController', async () => {
    const { service } = fixture()
    const fetcher: AiFetch = (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })
    const gateway = new AiGateway(service, { fetch: fetcher })
    const pending = gateway.requestStreamText('cancel-1', 'prompt', 100, () => undefined)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(gateway.cancel('cancel-1')).toBe(true)
    await expect(pending).rejects.toMatchObject({ code: 'AI_CANCELLED' })
  })

  it('aborts with AI_TIMEOUT after the idle window with no chunks', async () => {
    const { service } = fixture()
    expect(AI_STREAM_IDLE_TIMEOUT_MS).toBe(30_000)
    const hanging: AiFetch = (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })
    const gateway = new AiGateway(service, { fetch: hanging, idleTimeoutMs: 30 })
    await expect(gateway.requestStreamText('idle-1', 'prompt', 100, () => undefined))
      .rejects.toMatchObject({ code: 'AI_TIMEOUT' })
  })

  it('resets the idle timer whenever a chunk arrives', async () => {
    const { service } = fixture()
    const fetcher: AiFetch = async () => sseResponse([
      'data: {"choices":[{"delta":{"content":"1"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"2"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"3"}}]}\n\n',
      'data: [DONE]\n\n',
    ], 40)
    const gateway = new AiGateway(service, { fetch: fetcher })
    const result = await gateway.requestStreamText('idle-2', 'prompt', 100, () => undefined)
    expect(result.text).toBe('123')
  })
})
