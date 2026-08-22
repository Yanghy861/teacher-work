import {
  SKILL_IPC_CHANNELS,
  failure,
  IPC_ERROR_CODES,
  isEmptyIpcRequest,
  success,
  type IpcChannel,
  type IpcResponse,
} from '../../shared/ipc-contracts'
import {
  isCreateSkillRequest,
  isSkillIdRequest,
  isSkillRecord,
  isUpdateSkillRequest,
  type CreateSkillRequest,
  type SkillIdRequest,
  type UpdateSkillRequest,
} from '../../shared/skill-contracts'
import { SkillService, SkillServiceError } from '../skills/skill-service'
import type { WorkspaceActivityGate } from '../workspace/activity-gate'
import { WorkspaceActivityError } from '../workspace/activity-gate'
import type { IpcLogger, IpcMainPort } from './app-ipc'

export interface SkillIpcDependencies {
  readonly getSkillService: () => SkillService
  readonly activityGate?: WorkspaceActivityGate
}

export const SKILL_CHANNELS: readonly IpcChannel[] = Object.values(SKILL_IPC_CHANNELS)

class SkillIpcRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkillIpcRequestError'
  }
}

export function registerSkillIpc(
  ipcMain: IpcMainPort,
  dependencies: SkillIpcDependencies,
  logger: IpcLogger,
): () => void {
  for (const channel of SKILL_CHANNELS) {
    ipcMain.handle(channel, (_event, payload) =>
      dependencies.activityGate === undefined
        ? dispatchSkillIpc(channel, payload, dependencies, logger)
        : dependencies.activityGate.run(() => dispatchSkillIpc(channel, payload, dependencies, logger)).catch((error: unknown) => {
          if (error instanceof WorkspaceActivityError) {
            return failure(IPC_ERROR_CODES.WORKSPACE_BUSY, error.message)
          }
          throw error
        }),
    )
  }

  return () => {
    for (const channel of SKILL_CHANNELS) ipcMain.removeHandler(channel)
  }
}

export async function dispatchSkillIpc(
  channel: string,
  payload: unknown,
  dependencies: SkillIpcDependencies,
  logger: IpcLogger,
): Promise<IpcResponse<unknown>> {
  if (!SKILL_CHANNELS.includes(channel as IpcChannel)) {
    logger.log('warn', 'ipc.unknown_skill_channel', { channel })
    return failure(IPC_ERROR_CODES.UNKNOWN_CHANNEL, '未知的 IPC 通道。')
  }

  try {
    const service = dependencies.getSkillService()
    switch (channel) {
      case SKILL_IPC_CHANNELS.list:
        assertRequest(payload, isEmptyIpcRequest)
        return ensureResponse(service.listSkills(), isSkillList)
      case SKILL_IPC_CHANNELS.create: {
        assertRequest(payload, isCreateSkillRequest)
        const request = payload as CreateSkillRequest
        return ensureResponse(service.createSkill(request.name, request.prompt), isSkillRecord)
      }
      case SKILL_IPC_CHANNELS.update: {
        assertRequest(payload, isUpdateSkillRequest)
        const request = payload as UpdateSkillRequest
        return ensureResponse(
          service.updateSkill(request.skillId, request.name, request.prompt),
          isSkillRecord,
        )
      }
      case SKILL_IPC_CHANNELS.softDelete:
        assertRequest(payload, isSkillIdRequest)
        return ensureResponse(
          service.softDeleteSkill((payload as SkillIdRequest).skillId),
          isSkillRecord,
        )
    }
    throw new Error('Unhandled skill IPC channel')
  } catch (error) {
    const response = mapSkillIpcError(error)
    logger.error('ipc.skill_request_failed', error, {
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
  if (!guard(payload)) throw new SkillIpcRequestError('请求参数无效。')
}

function ensureResponse<T>(value: T, guard: (candidate: unknown) => candidate is T): IpcResponse<T> {
  if (!guard(value)) throw new Error('Skill service returned an invalid response')
  return success(value)
}

function isSkillList(value: unknown): value is readonly import('../../shared/skill-contracts').SkillRecord[] {
  return Array.isArray(value) && value.every(isSkillRecord)
}

function mapSkillIpcError(error: unknown): IpcResponse<never> {
  if (error instanceof SkillIpcRequestError) {
    return failure(IPC_ERROR_CODES.INVALID_PAYLOAD, error.message)
  }
  if (error instanceof SkillServiceError) {
    return failure(IPC_ERROR_CODES.SKILL_ERROR, error.message)
  }
  return failure(IPC_ERROR_CODES.INTERNAL_ERROR, '无法完成 Skill 操作，请稍后重试。')
}
