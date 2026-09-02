import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import {
  isAiStreamEvent,
  isAiTextRequest,
  type AiStreamEvent,
} from '../src/shared/ai-contracts'
import { AI_IPC_EVENTS } from '../src/shared/ipc-contracts'
import { AiGateway, type AiGatewayStreamChunk } from '../src/main/ai/ai-gateway'
import { AiSettingsService } from '../src/main/ai/ai-settings-service'
import { dispatchAiIpc, type AiIpcDependencies } from '../src/main/ipc/ai-ipc'
import { dispatchDraftIpc, type DraftIpcDependencies } from '../src/main/ipc/draft-ipc'
import type { IpcEventSender, IpcLogger } from '../src/main/ipc/app-ipc'
import type { SecureStoragePort } from '../src/main/ai/secure-storage'
import type { DraftService } from '../src/main/draft/draft-service'
import type { ManagedFileService } from '../src/main/files/managed-file-service'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'

const roots: string[] = []
const workspaces: WorkspaceHandle[] = []

afterEach(() => {
  for (const workspace of workspaces.splice(0)) workspace.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

class RecordingSender implements IpcEventSender {
  readonly pushes: Array<{ channel: string; payload: unknown }> = []

  send(channel: string, ...args: readonly unknown[]): void {
    this.pushes.push({ channel, payload: args.at(-1) })
  }
}

const logger: IpcLogger = { log: () => undefined, error: () => undefined }

function fixture(): { service: AiSettingsService } {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-v16c-ipc-'))
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

function sseBody(lines: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line))
      controller.close()
    },
  })
}

describe('V16-C streaming IPC push and contracts (D22)', () => {
  it('keeps the contract guards strict for stream flags and stream events', () => {
    expect(isAiTextRequest({ requestId: 'r1', prompt: 'p', maxTokens: 100, stream: true })).toBe(true)
    expect(isAiTextRequest({ requestId: 'r1', prompt: 'p', stream: true })).toBe(true)
    expect(isAiTextRequest({ requestId: 'r1', prompt: 'p', stream: false })).toBe(false)
    expect(isAiTextRequest({ requestId: 'r1', prompt: 'p', stream: 'yes' })).toBe(false)

    expect(isAiStreamEvent({ requestId: 'r1', kind: 'reasoning', chars: 12 })).toBe(true)
    expect(isAiStreamEvent({ requestId: 'r1', kind: 'text', text: '片段' })).toBe(true)
    expect(isAiStreamEvent({ requestId: 'r1', kind: 'done', chars: 5, model: 'm' })).toBe(true)
    expect(isAiStreamEvent({ requestId: 'r1', kind: 'unknown' })).toBe(false)
    expect(isAiStreamEvent({ requestId: '', kind: 'text', text: 'x' })).toBe(false)
    expect(isAiStreamEvent({ requestId: 'r1', kind: 'text', text: 3 })).toBe(false)
    expect(isAiStreamEvent({ requestId: 'r1', kind: 'reasoning', chars: -1 })).toBe(false)
  })

  it('streams requestText chunks over ai:stream-event and still resolves the full result', async () => {
    const { service } = fixture()
    const gateway = new AiGateway(service, {
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => undefined,
        text: async () => '',
        body: sseBody([
          'data: {"model":"deepseek-thinking","choices":[{"delta":{"reasoning_content":"思考一"}}]}\n\n',
          'data: {"choices":[{"delta":{"reasoning_content":"思考二"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"# 新讲义"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"正文"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      }),
    })
    const dependencies: AiIpcDependencies = { getSettingsService: () => service, getGateway: () => gateway }
    const sender = new RecordingSender()

    const response = await dispatchAiIpc(
      'ai:request-text',
      { requestId: 'relay-1', prompt: '生成讲义', maxTokens: 16_000, stream: true },
      dependencies,
      logger,
      sender,
    )

    expect(response.ok).toBe(true)
    expect(response.ok && response.data).toEqual({ text: '# 新讲义正文', model: 'deepseek-thinking' })
    const events = sender.pushes.map((push) => push.payload as AiStreamEvent)
    expect(sender.pushes.every((push) => push.channel === AI_IPC_EVENTS.streamEvent)).toBe(true)
    expect(events.every((event) => isAiStreamEvent(event))).toBe(true)
    // reasoning 事件按累计字符计数转发（不携带思维链原文）
    expect(events[0]).toEqual({ requestId: 'relay-1', kind: 'reasoning', chars: 3 })
    expect(events[1]).toEqual({ requestId: 'relay-1', kind: 'reasoning', chars: 6 })
    expect(events[2]).toEqual({ requestId: 'relay-1', kind: 'text', text: '# 新讲义' })
    expect(events[3]).toEqual({ requestId: 'relay-1', kind: 'text', text: '正文' })
    expect(events[4]).toEqual({ requestId: 'relay-1', kind: 'done', chars: '# 新讲义正文'.length, model: 'deepseek-thinking' })
  })

  it('does not push anything when stream is not requested', async () => {
    const { service } = fixture()
    const gateway = new AiGateway(service, {
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ model: 'deepseek-thinking', choices: [{ message: { content: '普通结果' } }] }),
        text: async () => '',
      }),
    })
    const dependencies: AiIpcDependencies = { getSettingsService: () => service, getGateway: () => gateway }
    const sender = new RecordingSender()

    const response = await dispatchAiIpc('ai:request-text', { requestId: 'plain-1', prompt: 'p' }, dependencies, logger, sender)
    expect(response.ok && response.data).toEqual({ text: '普通结果', model: 'deepseek-thinking' })
    expect(sender.pushes).toEqual([])
  })

  it('forwards generation stream events through the draft channel and pushes a done event', async () => {
    const received: AiGatewayStreamChunk[] = []
    const fakeDraftService = {
      generate: async (_request: unknown, onStream?: (chunk: AiGatewayStreamChunk) => void) => {
        onStream?.({ kind: 'reasoning', chars: 4 })
        onStream?.({ kind: 'text', text: '第一句。' })
        received.push(...received)
        return {
          noteId: 'note-1',
          kind: 'lecture',
          bodyMd: '第一句。',
          metadata: {
            kind: 'lecture',
            promptVersion: 'v11-03-v1',
            provider: 'openai-compatible',
            model: 'deepseek-thinking',
            sources: [],
            inputChars: 1,
            maxChars: 30_000,
            maxTokens: 16_000,
          },
        }
      },
    } as unknown as DraftService
    const dependencies: DraftIpcDependencies = {
      getDraftService: () => fakeDraftService,
      getManagedFiles: () => ({}) as unknown as ManagedFileService,
    }
    const sender = new RecordingSender()

    const response = await dispatchDraftIpc(
      'draft:generate',
      {
        requestId: 'draft-relay-1',
        kind: 'lecture',
        lessonId: 'lesson-1',
        sources: [{ fileId: 'file-1' }],
        maxChars: 30_000,
        maxTokens: 16_000,
      },
      dependencies,
      logger,
      sender,
    )

    expect(response.ok).toBe(true)
    const events = sender.pushes.map((push) => push.payload as AiStreamEvent)
    expect(events[0]).toEqual({ requestId: 'draft-relay-1', kind: 'reasoning', chars: 4 })
    expect(events[1]).toEqual({ requestId: 'draft-relay-1', kind: 'text', text: '第一句。' })
    expect(events[2]).toEqual({ requestId: 'draft-relay-1', kind: 'done', chars: '第一句。'.length, model: 'deepseek-thinking' })
  })
})

describe('V16-C relay acceptance: SSE → push events → renderer progress → done', () => {
  it('replays the pushed events through the renderer state machine and assembles the note body', async () => {
    const { service } = fixture()
    const gateway = new AiGateway(service, {
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => undefined,
        text: async () => '',
        body: sseBody([
          'data: {"model":"deepseek-thinking","choices":[{"delta":{"reasoning_content":"先审题，再构思结构"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"# 二次函数"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"讲义正文。"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      }),
    })
    const dependencies: AiIpcDependencies = { getSettingsService: () => service, getGateway: () => gateway }
    const sender = new RecordingSender()

    const response = await dispatchAiIpc(
      'ai:request-text',
      { requestId: 'relay-accept', prompt: '方案', maxTokens: 16_000, stream: true },
      dependencies,
      logger,
      sender,
    )
    expect(response.ok).toBe(true)

    // 渲染层状态机回放（与 draft-panel onStreamEvent 处理一致）：reasoning 只累计计数，text 逐字上屏。
    let reasoningChars = 0
    let textPreview = ''
    let doneSeen = false
    for (const push of sender.pushes) {
      const event = push.payload as AiStreamEvent
      if (event.requestId !== 'relay-accept') continue
      if (event.kind === 'reasoning') reasoningChars = event.chars ?? reasoningChars
      if (event.kind === 'text') textPreview += event.text ?? ''
      if (event.kind === 'done') doneSeen = true
    }

    expect(reasoningChars).toBe('先审题，再构思结构'.length)
    expect(textPreview).toBe('# 二次函数讲义正文。')
    expect(doneSeen).toBe(true)
    if (response.ok) {
      const final = response.data as { text: string; model: string }
      // 最终 note 内容以 invoke 返回的完整结果为准（D22）
      expect(final.text).toBe(textPreview)
      expect(final.model).toBe('deepseek-thinking')
    }
  })
})
