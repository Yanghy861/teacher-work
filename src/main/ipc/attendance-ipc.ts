import type {
  LessonIdRequest,
  SaveLessonAttendanceRequest,
  UpdateLessonScheduleRequest,
} from '../../shared/core-contracts'
import {
  isLessonAttendanceRecord,
  isLessonIdRequest,
  isSaveLessonAttendanceRequest,
  isUpdateLessonScheduleRequest,
} from '../../shared/core-contracts'
import {
  ATTENDANCE_IPC_CHANNELS,
  failure,
  IPC_ERROR_CODES,
  success,
  type IpcChannel,
  type IpcResponse,
} from '../../shared/ipc-contracts'
import { AttendanceError, AttendanceService } from '../data/attendance-service'
import type { WorkspaceActivityGate } from '../workspace/activity-gate'
import { WorkspaceActivityError } from '../workspace/activity-gate'
import type { IpcLogger, IpcMainPort } from './app-ipc'

export interface AttendanceIpcDependencies {
  readonly getAttendanceService: () => AttendanceService
  readonly activityGate?: WorkspaceActivityGate
}

export const ATTENDANCE_CHANNELS: readonly IpcChannel[] = Object.values(ATTENDANCE_IPC_CHANNELS)

class AttendanceIpcRequestError extends Error {}

export function registerAttendanceIpc(
  ipcMain: IpcMainPort,
  dependencies: AttendanceIpcDependencies,
  logger: IpcLogger,
): () => void {
  for (const channel of ATTENDANCE_CHANNELS) {
    ipcMain.handle(channel, (_event, payload) =>
      dependencies.activityGate === undefined
        ? dispatchAttendanceIpc(channel, payload, dependencies, logger)
        : dependencies.activityGate
          .run(() => dispatchAttendanceIpc(channel, payload, dependencies, logger))
          .catch((error: unknown) => {
            if (error instanceof WorkspaceActivityError) {
              return failure(IPC_ERROR_CODES.WORKSPACE_BUSY, error.message)
            }
            throw error
          }),
    )
  }
  return () => ATTENDANCE_CHANNELS.forEach((channel) => ipcMain.removeHandler(channel))
}

export async function dispatchAttendanceIpc(
  channel: string,
  payload: unknown,
  dependencies: AttendanceIpcDependencies,
  logger: IpcLogger,
): Promise<IpcResponse<unknown>> {
  if (!ATTENDANCE_CHANNELS.includes(channel as IpcChannel)) {
    return failure(IPC_ERROR_CODES.UNKNOWN_CHANNEL, '未知的 IPC 通道。')
  }
  try {
    const service = dependencies.getAttendanceService()
    switch (channel) {
      case ATTENDANCE_IPC_CHANNELS.updateSchedule:
        assertRequest(payload, isUpdateLessonScheduleRequest)
        return ensureResponse(service.updateLessonSchedule(
          (payload as UpdateLessonScheduleRequest).lessonId,
          (payload as UpdateLessonScheduleRequest).scheduledAt,
        ), isLessonAttendanceRecord)
      case ATTENDANCE_IPC_CHANNELS.getLesson:
        assertRequest(payload, isLessonIdRequest)
        return ensureResponse(
          service.getLessonAttendance((payload as LessonIdRequest).lessonId),
          isLessonAttendanceRecord,
        )
      case ATTENDANCE_IPC_CHANNELS.saveLesson:
        assertRequest(payload, isSaveLessonAttendanceRequest)
        return ensureResponse(service.saveLessonAttendance(
          (payload as SaveLessonAttendanceRequest).lessonId,
          (payload as SaveLessonAttendanceRequest).entries,
        ), isLessonAttendanceRecord)
    }
    throw new Error('Unhandled attendance IPC channel')
  } catch (error) {
    const response = mapAttendanceIpcError(error)
    logger.error('ipc.attendance_request_failed', error, {
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
  if (!guard(payload)) throw new AttendanceIpcRequestError('请求参数无效。')
}

function mapAttendanceIpcError(error: unknown): IpcResponse<never> {
  if (error instanceof AttendanceIpcRequestError) {
    return failure(IPC_ERROR_CODES.INVALID_PAYLOAD, error.message)
  }
  if (error instanceof AttendanceError) {
    return failure(IPC_ERROR_CODES.ATTENDANCE_ERROR, error.message)
  }
  return failure(IPC_ERROR_CODES.INTERNAL_ERROR, '无法完成请求，请稍后重试。')
}

function ensureResponse<T>(
  value: T,
  guard: (candidate: unknown) => candidate is T,
): IpcResponse<T> {
  if (!guard(value)) throw new Error('Attendance service returned an invalid response')
  return success(value)
}
