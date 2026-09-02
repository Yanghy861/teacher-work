import {
  normalizeAiEndpoint,
  type AiConnectionTestResult,
  type AiProvider,
  type AiTextResult,
} from '../../shared/ai-contracts'
import type { IpcLogger } from '../ipc/app-ipc'
import { AiSettingsService } from './ai-settings-service'

export type AiGatewayErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_INVALID_ENDPOINT'
  | 'AI_UNAUTHORIZED'
  | 'AI_RATE_LIMITED'
  | 'AI_UPSTREAM'
  | 'AI_TIMEOUT'
  | 'AI_CANCELLED'
  | 'AI_NETWORK'
  | 'AI_INVALID_RESPONSE'

export class AiGatewayError extends Error {
  readonly code: AiGatewayErrorCode
  readonly status?: number

  constructor(code: AiGatewayErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'AiGatewayError'
    this.code = code
    this.status = status
  }
}

export interface AiFetchResponse {
  readonly ok: boolean
  readonly status: number
  readonly json: () => Promise<unknown>
  readonly text: () => Promise<string>
}

export type AiFetch = (input: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<AiFetchResponse>

// thinking 型后端（reasoning_content 计入输出）需要远高于普通请求的等待窗口，默认超时放大到 120s（D21）。
export const DEFAULT_AI_TIMEOUT_MS = 120_000

export interface AiGatewayOptions {
  readonly fetch?: AiFetch
  readonly timeoutMs?: number
  readonly logger?: IpcLogger
}

interface OpenAiChatResponse {
  readonly choices?: readonly { readonly message?: { readonly content?: unknown } }[]
  readonly model?: unknown
}

export class AiGateway {
  private readonly fetcher: AiFetch
  private readonly timeoutMs: number
  private readonly logger?: IpcLogger
  private readonly controllers = new Map<string, AbortController>()
  private readonly cancelled = new Set<string>()

  constructor(
    private readonly settings: AiSettingsService,
    options: AiGatewayOptions = {},
  ) {
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init))
    this.timeoutMs = options.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS
    this.logger = options.logger
  }

  async testConnection(requestId: string): Promise<AiConnectionTestResult> {
    const settings = this.settings.getSettings()
    const startedAt = Date.now()
    await this.request(requestId, settings.provider, settings.model, settings.endpoint, 'ping', 1, 'structure')
    return { provider: settings.provider, model: settings.model, latencyMs: Date.now() - startedAt }
  }

  async requestText(requestId: string, prompt: string, maxTokens?: number): Promise<AiTextResult> {
    const settings = this.settings.getSettings()
    const result = await this.request(requestId, settings.provider, settings.model, settings.endpoint, prompt, maxTokens)
    return { text: result.text, model: result.model }
  }

  cancel(requestId: string): boolean {
    const controller = this.controllers.get(requestId)
    if (controller === undefined) {
      return false
    }
    this.cancelled.add(requestId)
    controller.abort()
    return true
  }

  private async request(
    requestId: string,
    provider: AiProvider,
    model: string,
    endpoint: string,
    prompt: string,
    maxTokens?: number,
    responseParsing: 'text' | 'structure' = 'text',
  ): Promise<{ readonly text: string; readonly model: string }> {
    if (provider !== 'openai-compatible') {
      throw new AiGatewayError('AI_UPSTREAM', '当前仅支持 OpenAI-compatible provider。')
    }
    const apiKey = this.settings.getApiKey()
    if (apiKey === undefined) {
      throw new AiGatewayError('AI_NOT_CONFIGURED', '请先配置 API Key。')
    }
    const url = buildChatCompletionsUrl(endpoint)
    const controller = new AbortController()
    this.controllers.set(requestId, controller)
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      let response: AiFetchResponse
      try {
        response = await this.fetcher(url, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
          }),
          signal: controller.signal,
        })
      } catch {
        if (controller.signal.aborted) {
          throw new AiGatewayError(
            this.cancelled.has(requestId) ? 'AI_CANCELLED' : 'AI_TIMEOUT',
            this.cancelled.has(requestId) ? 'AI 请求已取消。' : 'AI 请求超时，请稍后重试。',
          )
        }
        this.logger?.log('warn', 'ai.gateway_network_failed', { requestId })
        throw new AiGatewayError('AI_NETWORK', '无法连接 AI 服务，请检查网络或地址设置。')
      }

      if (!response.ok) {
        throw mapHttpError(response.status)
      }
      const payload = await response.json().catch(() => undefined)
      const parsed = parseChatResponse(payload, responseParsing)
      return {
        text: parsed.text,
        model: typeof parsed.model === 'string' && parsed.model.trim() !== '' ? parsed.model : model,
      }
    } catch (error) {
      const mapped = error instanceof AiGatewayError ? error : new AiGatewayError('AI_NETWORK', 'AI 请求失败，请稍后重试。')
      this.logger?.log('warn', 'ai.gateway_request_failed', { requestId, code: mapped.code, status: mapped.status })
      throw mapped
    } finally {
      clearTimeout(timeout)
      this.controllers.delete(requestId)
      this.cancelled.delete(requestId)
    }
  }
}

function buildChatCompletionsUrl(endpoint: string): string {
  const normalized = normalizeAiEndpoint(endpoint)
  try {
    const url = new URL(normalized)
    if (url.username !== '' || url.password !== '') {
      throw new AiGatewayError('AI_INVALID_ENDPOINT', 'AI Endpoint 地址不能包含账号或密码。')
    }
    return `${normalized}/chat/completions`
  } catch (error: unknown) {
    if (errorIsGateway(error)) {
      throw error
    }
    throw new AiGatewayError('AI_INVALID_ENDPOINT', 'AI Endpoint 地址无效。')
  }
}

function errorIsGateway(value: unknown): value is AiGatewayError {
  return value instanceof AiGatewayError
}

function mapHttpError(status: number): AiGatewayError {
  if (status === 401 || status === 403) {
    return new AiGatewayError('AI_UNAUTHORIZED', 'AI 服务认证失败，请检查 API Key。', status)
  }
  if (status === 429) {
    return new AiGatewayError('AI_RATE_LIMITED', 'AI 服务请求过于频繁，请稍后重试。', status)
  }
  if (status >= 500) {
    return new AiGatewayError('AI_UPSTREAM', 'AI 服务暂时不可用，请稍后重试。', status)
  }
  return new AiGatewayError('AI_UPSTREAM', 'AI 服务拒绝了请求。', status)
}

function parseChatResponse(
  payload: unknown,
  parsing: 'text' | 'structure' = 'text',
): { readonly text: string; readonly model?: string } {
  if (typeof payload !== 'object' || payload === null) {
    throw new AiGatewayError('AI_INVALID_RESPONSE', 'AI 服务返回了无法识别的响应。')
  }
  const candidate = payload as OpenAiChatResponse
  if (!Array.isArray(candidate.choices) || candidate.choices.length === 0) {
    throw new AiGatewayError('AI_INVALID_RESPONSE', 'AI 服务返回了无法识别的响应。')
  }
  if (parsing === 'structure') {
    // 连通性检查与正文质量解耦：思考型后端在 max_tokens 极小时 content 为空属正常行为。
    return { text: '', model: typeof candidate.model === 'string' ? candidate.model : undefined }
  }
  const content = candidate.choices[0]?.message?.content
  if (typeof content !== 'string' || content.trim() === '') {
    throw new AiGatewayError('AI_INVALID_RESPONSE', 'AI 服务返回了空响应。')
  }
  return { text: content, model: typeof candidate.model === 'string' ? candidate.model : undefined }
}
