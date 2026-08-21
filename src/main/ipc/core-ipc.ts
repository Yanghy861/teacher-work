import {
  CORE_IPC_CHANNELS,
  failure,
  IPC_ERROR_CODES,
  isEmptyIpcRequest,
  success,
  type IpcChannel,
  type IpcResponse,
} from '../../shared/ipc-contracts'
import type {
  CreateCourseRequest,
  CreateLessonRequest,
  CreateNoteRequest,
  CreatePeriodRequest,
  CreateStudentRequest,
  MoveNodeRequest,
  NodeIdRequest,
  ReorderNodeRequest,
  RenameNodeRequest,
  UpdateNoteRequest,
} from '../../shared/core-contracts'
import {
  isCoreOverview,
  isCreateCourseRequest,
  isCreateLessonRequest,
  isCreateNoteRequest,
  isCreatePeriodRequest,
  isCreateStudentRequest,
  isMoveNodeRequest,
  isNodeIdRequest,
  isNodeRecord,
  isNoteRecord,
  isReorderNodeRequest,
  isRenameNodeRequest,
  isStudentRecord,
  isUpdateNoteRequest,
} from '../../shared/core-contracts'
import { CoreDataError, CoreDataService } from '../data/core-data-service'
import { NodeServiceError } from '../data/node-service'
import type { IpcLogger, IpcMainPort } from './app-ipc'

export interface CoreIpcDependencies {
  readonly getCoreData: () => CoreDataService
}

export const CORE_CHANNELS: readonly IpcChannel[] = Object.values(CORE_IPC_CHANNELS)

class CoreIpcRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CoreIpcRequestError'
  }
}

export function registerCoreIpc(
  ipcMain: IpcMainPort,
  dependencies: CoreIpcDependencies,
  logger: IpcLogger,
): () => void {
  for (const channel of CORE_CHANNELS) {
    ipcMain.handle(channel, (_event, payload) =>
      dispatchCoreIpc(channel, payload, dependencies, logger),
    )
  }

  return () => {
    for (const channel of CORE_CHANNELS) {
      ipcMain.removeHandler(channel)
    }
  }
}

export async function dispatchCoreIpc(
  channel: string,
  payload: unknown,
  dependencies: CoreIpcDependencies,
  logger: IpcLogger,
): Promise<IpcResponse<unknown>> {
  if (!isKnownCoreChannel(channel)) {
    logger.log('warn', 'ipc.unknown_core_channel', { channel })
    return failure(IPC_ERROR_CODES.UNKNOWN_CHANNEL, '未知的 IPC 通道。')
  }

  try {
    const coreData = dependencies.getCoreData()
    switch (channel) {
      case CORE_IPC_CHANNELS.getCoreOverview:
        assertRequest(payload, isEmptyIpcRequest)
        return ensureResponse(coreData.getOverview(), isCoreOverview)
      case CORE_IPC_CHANNELS.createCourse:
        assertRequest(payload, isCreateCourseRequest)
        return ensureResponse(
          coreData.nodes.createCourse(
            (payload as CreateCourseRequest).title,
            (payload as CreateCourseRequest).mode,
          ),
          isNodeRecord,
        )
      case CORE_IPC_CHANNELS.createPeriod:
        assertRequest(payload, isCreatePeriodRequest)
        return ensureResponse(
          coreData.nodes.createPeriod(
            (payload as CreatePeriodRequest).courseId,
            (payload as CreatePeriodRequest).title,
          ),
          isNodeRecord,
        )
      case CORE_IPC_CHANNELS.createLesson:
        assertRequest(payload, isCreateLessonRequest)
        return ensureResponse(
          coreData.nodes.createLesson(
            (payload as CreateLessonRequest).periodId,
            (payload as CreateLessonRequest).title,
          ),
          isNodeRecord,
        )
      case CORE_IPC_CHANNELS.createStudent:
        assertRequest(payload, isCreateStudentRequest)
        return ensureResponse(
          coreData.createStudentForCourse(
            (payload as CreateStudentRequest).courseId,
            (payload as CreateStudentRequest).name,
          ),
          isStudentRecord,
        )
      case CORE_IPC_CHANNELS.createNote:
        assertRequest(payload, isCreateNoteRequest)
        return ensureResponse(
          coreData.createNote(
            (payload as CreateNoteRequest).studentId,
            (payload as CreateNoteRequest).bodyMd,
            (payload as CreateNoteRequest).lessonId,
          ),
          isNoteRecord,
        )
      case CORE_IPC_CHANNELS.updateNote:
        assertRequest(payload, isUpdateNoteRequest)
        return ensureResponse(
          coreData.updateNote(
            (payload as UpdateNoteRequest).noteId,
            (payload as UpdateNoteRequest).bodyMd,
          ),
          isNoteRecord,
        )
      case CORE_IPC_CHANNELS.renameNode:
        assertRequest(payload, isRenameNodeRequest)
        return ensureResponse(
          coreData.nodes.renameNode(
            (payload as RenameNodeRequest).nodeId,
            (payload as RenameNodeRequest).title,
          ),
          isNodeRecord,
        )
      case CORE_IPC_CHANNELS.moveNode:
        assertRequest(payload, isMoveNodeRequest)
        return ensureResponse(
          coreData.nodes.moveNode(
            (payload as MoveNodeRequest).nodeId,
            (payload as MoveNodeRequest).parentId,
          ),
          isNodeRecord,
        )
      case CORE_IPC_CHANNELS.reorderNode:
        assertRequest(payload, isReorderNodeRequest)
        return ensureResponse(
          coreData.nodes.reorderNode(
            (payload as ReorderNodeRequest).nodeId,
            (payload as ReorderNodeRequest).sortOrder,
          ),
          isNodeRecord,
        )
      case CORE_IPC_CHANNELS.softDeleteNode:
        assertRequest(payload, isNodeIdRequest)
        return ensureResponse(
          coreData.nodes.softDeleteNode((payload as NodeIdRequest).nodeId),
          isNodeRecord,
        )
      case CORE_IPC_CHANNELS.restoreNode:
        assertRequest(payload, isNodeIdRequest)
        return ensureResponse(
          coreData.nodes.restoreNode((payload as NodeIdRequest).nodeId),
          isNodeRecord,
        )
    }
    throw new Error('Unhandled core IPC channel')
  } catch (error) {
    const response = mapCoreIpcError(error)
    logger.error('ipc.core_request_failed', error, {
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
  if (!guard(payload)) {
    throw new CoreIpcRequestError('请求参数无效。')
  }
}

function ensureResponse<T>(value: T, guard: (candidate: unknown) => candidate is T): IpcResponse<T> {
  if (!guard(value)) {
    throw new Error('Core data service returned an invalid response')
  }
  return success(value)
}

function mapCoreIpcError(error: unknown): IpcResponse<never> {
  if (error instanceof CoreIpcRequestError) {
    return failure(IPC_ERROR_CODES.INVALID_PAYLOAD, error.message)
  }
  if (error instanceof CoreDataError || error instanceof NodeServiceError) {
    return failure(IPC_ERROR_CODES.CORE_DATA_ERROR, error.message)
  }
  return failure(IPC_ERROR_CODES.INTERNAL_ERROR, '无法完成请求，请稍后重试。')
}

function isKnownCoreChannel(channel: string): channel is IpcChannel {
  return CORE_CHANNELS.includes(channel as IpcChannel)
}
