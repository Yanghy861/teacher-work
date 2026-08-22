import { isRecord } from './ipc-contracts'

export const SKILL_NAME_MAX_CHARS = 100
export const SKILL_PROMPT_MAX_CHARS = 20_000

export interface SkillRecord {
  readonly id: string
  readonly name: string
  readonly prompt: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly deletedAt: string | null
}

export interface CreateSkillRequest {
  readonly name: string
  readonly prompt: string
}

export interface UpdateSkillRequest extends CreateSkillRequest {
  readonly skillId: string
}

export interface SkillIdRequest {
  readonly skillId: string
}

export function isSkillRecord(value: unknown): value is SkillRecord {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['id', 'name', 'prompt', 'createdAt', 'updatedAt', 'deletedAt']) &&
    isNonEmptyString(value.id, 128) &&
    isNonEmptyString(value.name, SKILL_NAME_MAX_CHARS) &&
    isNonEmptyString(value.prompt, SKILL_PROMPT_MAX_CHARS) &&
    isNonEmptyString(value.createdAt, 64) &&
    isNonEmptyString(value.updatedAt, 64) &&
    (value.deletedAt === null || isNonEmptyString(value.deletedAt, 64))
  )
}

export function isCreateSkillRequest(value: unknown): value is CreateSkillRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['name', 'prompt']) &&
    isNonEmptyString(value.name, SKILL_NAME_MAX_CHARS) &&
    isNonEmptyString(value.prompt, SKILL_PROMPT_MAX_CHARS)
  )
}

export function isUpdateSkillRequest(value: unknown): value is UpdateSkillRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['skillId', 'name', 'prompt']) &&
    isNonEmptyString(value.skillId, 128) &&
    isNonEmptyString(value.name, SKILL_NAME_MAX_CHARS) &&
    isNonEmptyString(value.prompt, SKILL_PROMPT_MAX_CHARS)
  )
}

export function isSkillIdRequest(value: unknown): value is SkillIdRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['skillId']) &&
    isNonEmptyString(value.skillId, 128)
  )
}

function isNonEmptyString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum
}

function hasOnlyKeys(value: Record<string, unknown>, requiredKeys: readonly string[]): boolean {
  const keys = Object.keys(value)
  const allowed = new Set(requiredKeys)
  return requiredKeys.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key))
}
