import type { ManagedFileRecord } from '../../shared/file-contracts'
import { isManagedFileRecord } from '../../shared/file-contracts'
import type {
  QuestionBankDetail,
  QuestionBankLessonCopyRequest,
  QuestionBankQuestionRequest,
  QuestionBankSearchRequest,
  QuestionBankSearchResult,
  QuestionBankSummary,
} from '../../shared/question-bank-contracts'
import {
  isQuestionBankDetail,
  isQuestionBankLessonCopyRequest,
  isQuestionBankQuestionRequest,
  isQuestionBankSearchRequest,
  isQuestionBankSearchResult,
  isQuestionBankSummary,
} from '../../shared/question-bank-contracts'
import {
  failure,
  IPC_ERROR_CODES,
  isEmptyIpcRequest,
  QUESTION_BANK_IPC_CHANNELS,
  success,
  type IpcChannel,
  type IpcResponse,
} from '../../shared/ipc-contracts'
import { ManagedFileError } from '../files/managed-file-service'
import { QuestionBankError, type QuestionBankService } from '../question-bank/question-bank-service'
import type { WorkspaceActivityGate } from '../workspace/activity-gate'
import { WorkspaceActivityError } from '../workspace/activity-gate'
import type { IpcLogger, IpcMainPort } from './app-ipc'

export interface QuestionBankIpcDependencies {
  readonly getService: () => QuestionBankService
  readonly chooseSnapshotPath: () => Promise<string | null>
  readonly enqueueIndex?: (fileId: string) => void
  readonly activityGate?: WorkspaceActivityGate
}
export const QUESTION_BANK_CHANNELS: readonly IpcChannel[] = Object.values(
  QUESTION_BANK_IPC_CHANNELS,
)

class QuestionBankIpcRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuestionBankIpcRequestError'
  }
}

export function registerQuestionBankIpc(
  ipcMain: IpcMainPort,
  dependencies: QuestionBankIpcDependencies,
  logger: IpcLogger,
): () => void {
  for (const channel of QUESTION_BANK_CHANNELS) {
    ipcMain.handle(channel, (_event, payload) => {
      const dispatch = () => dispatchQuestionBankIpc(channel, payload, dependencies, logger)
      return dependencies.activityGate === undefined
        ? dispatch()
        : dependencies.activityGate.run(dispatch).catch((error: unknown) => {
          if (error instanceof WorkspaceActivityError) {
            return failure(IPC_ERROR_CODES.WORKSPACE_BUSY, error.message)
          }
          throw error
        })
    })
  }
  return () => {
    for (const channel of QUESTION_BANK_CHANNELS) ipcMain.removeHandler(channel)
  }
}

export async function dispatchQuestionBankIpc(
  channel: string,
  payload: unknown,
  dependencies: QuestionBankIpcDependencies,
  logger: IpcLogger,
): Promise<IpcResponse<unknown>> {
  if (!QUESTION_BANK_CHANNELS.includes(channel as IpcChannel)) {
    logger.log('warn', 'ipc.unknown_question_bank_channel', { channel })
    return failure(IPC_ERROR_CODES.UNKNOWN_CHANNEL, '未知的 IPC 通道。')
  }
  try {
    const service = dependencies.getService()
    switch (channel) {
      case QUESTION_BANK_IPC_CHANNELS.getSummary:
        assertRequest(payload, isEmptyIpcRequest)
        return ensureResponse<QuestionBankSummary>(service.getSummary(), isQuestionBankSummary)
      case QUESTION_BANK_IPC_CHANNELS.chooseAndImport: {
        assertRequest(payload, isEmptyIpcRequest)
        const sourcePath = await dependencies.chooseSnapshotPath()
        if (sourcePath === null) return success(null)
        return ensureResponse<QuestionBankSummary>(
          await service.importSnapshot(sourcePath),
          isQuestionBankSummary,
        )
      }
      case QUESTION_BANK_IPC_CHANNELS.search:
        assertRequest(payload, isQuestionBankSearchRequest)
        return ensureResponse<QuestionBankSearchResult>(
          service.search(payload as QuestionBankSearchRequest),
          isQuestionBankSearchResult,
        )
      case QUESTION_BANK_IPC_CHANNELS.getQuestion:
        assertRequest(payload, isQuestionBankQuestionRequest)
        return ensureResponse<QuestionBankDetail>(
          service.getQuestion((payload as QuestionBankQuestionRequest).questionId),
          isQuestionBankDetail,
        )
      case QUESTION_BANK_IPC_CHANNELS.copyToLibrary: {
        assertRequest(payload, isQuestionBankQuestionRequest)
        const imported = service.copyToLibrary((payload as QuestionBankQuestionRequest).questionId)
        dependencies.enqueueIndex?.(imported.id)
        return ensureResponse<ManagedFileRecord>(imported, isManagedFileRecord)
      }
      case QUESTION_BANK_IPC_CHANNELS.copyToLesson: {
        assertRequest(payload, isQuestionBankLessonCopyRequest)
        const request = payload as QuestionBankLessonCopyRequest
        const imported = service.copyToLesson(request.questionId, request.lessonId)
        dependencies.enqueueIndex?.(imported.id)
        return ensureResponse<ManagedFileRecord>(imported, isManagedFileRecord)
      }
    }
    throw new Error('Unhandled question bank IPC channel')
  } catch (error) {
    const response = mapQuestionBankIpcError(error)
    logger.error('ipc.question_bank_request_failed', error, {
      channel,
      code: response.ok ? undefined : response.error.code,
    })
    return response
  }
}

function assertRequest<T>(
  payload: unknown,
  guard: (value: unknown) => value is T,
): asserts payload is T {
  if (!guard(payload)) throw new QuestionBankIpcRequestError('请求参数无效。')
}

function ensureResponse<T>(value: T, guard: (candidate: unknown) => candidate is T): IpcResponse<T> {
  if (!guard(value)) throw new Error('Question bank service returned an invalid response')
  return success(value)
}

function mapQuestionBankIpcError(error: unknown): IpcResponse<never> {
  if (error instanceof QuestionBankIpcRequestError) {
    return failure(IPC_ERROR_CODES.INVALID_PAYLOAD, error.message)
  }
  if (error instanceof QuestionBankError) {
    return failure(IPC_ERROR_CODES.QUESTION_BANK_ERROR, error.message)
  }
  if (error instanceof ManagedFileError) {
    return failure(IPC_ERROR_CODES.MANAGED_FILE_ERROR, error.message)
  }
  return failure(IPC_ERROR_CODES.INTERNAL_ERROR, '无法完成题库操作，请稍后重试。')
}
