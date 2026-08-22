import type { AiSettingsService } from '../ai/ai-settings-service'
import { AiGateway } from '../ai/ai-gateway'
import type { CoreDataService } from '../data/core-data-service'
import type { SearchChunkInput } from '../../shared/search-contracts'
import {
  DRAFT_PROMPT_VERSION,
  type DraftKind,
  type DraftNoteMetadata,
  type DraftSourceRef,
  type DraftSourceSelection,
  type GenerateDraftRequest,
  type GenerateDraftResult,
} from '../../shared/draft-contracts'
import type { SearchService } from '../search/search-service'

export type DraftServiceErrorCode =
  | 'DRAFT_INVALID_REQUEST'
  | 'DRAFT_SOURCE_UNAVAILABLE'
  | 'DRAFT_EMPTY_CONTEXT'
  | 'DRAFT_SAVE_FAILED'

export class DraftServiceError extends Error {
  readonly code: DraftServiceErrorCode

  constructor(code: DraftServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DraftServiceError'
    this.code = code
  }
}

interface ContextBuildResult {
  readonly text: string
  readonly sources: readonly DraftSourceRef[]
  readonly inputChars: number
}

export class DraftService {
  constructor(
    private readonly coreData: CoreDataService,
    private readonly search: SearchService,
    private readonly aiGateway: AiGateway,
    private readonly aiSettings: AiSettingsService,
  ) {}

  async generate(request: GenerateDraftRequest): Promise<GenerateDraftResult> {
    if (request.sources.length === 0) {
      throw new DraftServiceError('DRAFT_INVALID_REQUEST', '请至少选择一份资料或文本片段。')
    }

    const context = this.buildContext(request.sources, request.maxChars)
    if (context.text.trim() === '') {
      throw new DraftServiceError('DRAFT_EMPTY_CONTEXT', '所选资料没有可发送的文本。')
    }

    const settings = this.aiSettings.getSettings()
    const prompt = buildPrompt(request.kind, context.text)
    const result = await this.aiGateway.requestText(request.requestId, prompt, request.maxTokens)

    const metadata: DraftNoteMetadata = {
      kind: request.kind,
      promptVersion: DRAFT_PROMPT_VERSION,
      provider: settings.provider,
      model: result.model,
      sources: context.sources,
      inputChars: context.inputChars,
      maxChars: request.maxChars,
      maxTokens: request.maxTokens,
    }

    try {
      const note = this.coreData.createLessonDraft(
        request.lessonId,
        result.text,
        { noteKind: request.kind, aiMetadata: metadata },
        request.studentId,
      )
      return {
        noteId: note.id,
        kind: request.kind,
        bodyMd: note.bodyMd,
        metadata,
      }
    } catch (error) {
      throw new DraftServiceError('DRAFT_SAVE_FAILED', '草稿生成成功，但保存记录失败。', { cause: error })
    }
  }

  private buildContext(
    selections: readonly DraftSourceSelection[],
    maxChars: number,
  ): ContextBuildResult {
    let remaining = maxChars
    let inputChars = 0
    const parts: string[] = []
    const refs: DraftSourceRef[] = []

    for (const selection of selections) {
      if (remaining <= 0) break
      try {
        this.search.assertFileAvailable(selection.fileId)
      } catch (error) {
        throw new DraftServiceError('DRAFT_SOURCE_UNAVAILABLE', '所选资料不可用，请刷新后重试。', { cause: error })
      }
      const chunks = selection.text === undefined
        ? this.getFileChunks(selection.fileId)
        : [{ text: selection.text, ...(selection.position === undefined ? {} : { position: selection.position }) }]
      for (const chunk of chunks) {
        if (remaining <= 0) break
        const text = chunk.text
        if (text.trim() === '') continue
        const piece = text.slice(0, remaining)
        if (piece.length === 0) continue
        parts.push(piece)
        refs.push({
          fileId: selection.fileId,
          ...(chunk.position === undefined ? {} : { position: chunk.position }),
          charsSent: piece.length,
        })
        inputChars += piece.length
        remaining -= piece.length
      }
    }

    return { text: parts.join('\n\n'), sources: refs, inputChars }
  }

  private getFileChunks(fileId: string): readonly SearchChunkInput[] {
    try {
      const context = this.search.getFileContext(fileId)
      if (context.chunks.length === 0) {
        throw new DraftServiceError('DRAFT_SOURCE_UNAVAILABLE', '所选资料尚未准备好可提取文本。')
      }
      return context.chunks
    } catch (error) {
      if (error instanceof DraftServiceError) throw error
      throw new DraftServiceError('DRAFT_SOURCE_UNAVAILABLE', '所选资料不可用，请刷新后重试。', { cause: error })
    }
  }
}

function buildPrompt(kind: DraftKind, context: string): string {
  const instruction = kind === 'lecture'
    ? '请将资料整理成结构清晰、可直接编辑的课堂讲义，包含目标、重点、例子和易错提醒。'
    : kind === 'example'
      ? '请基于资料编写分层例题，给出题目、解题思路和简洁答案，保持数学表达准确。'
      : '请基于资料编写可直接布置的作业，包含题目、必要说明和答案或提示，避免虚构资料之外的事实。'
  return [
    instruction,
    '只使用下面明确选择的资料内容，不要引用未提供的文件或隐私信息。输出普通 Markdown，不要输出元数据或系统说明。',
    '--- selected context ---',
    context,
    '--- end selected context ---',
  ].join('\n\n')
}
