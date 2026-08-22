import { randomUUID } from 'node:crypto'

import {
  SKILL_NAME_MAX_CHARS,
  SKILL_PROMPT_MAX_CHARS,
  type SkillRecord,
} from '../../shared/skill-contracts'
import type { SqliteDatabase } from '../db/migrations'

export type SkillServiceErrorCode =
  | 'SKILL_INVALID_NAME'
  | 'SKILL_INVALID_PROMPT'
  | 'SKILL_NOT_FOUND'
  | 'SKILL_DELETED'

export class SkillServiceError extends Error {
  readonly code: SkillServiceErrorCode

  constructor(code: SkillServiceErrorCode, message: string) {
    super(message)
    this.name = 'SkillServiceError'
    this.code = code
  }
}

export interface SkillServiceOptions {
  readonly idFactory?: () => string
  readonly now?: () => string
}

interface SkillRow {
  readonly id: string
  readonly name: string
  readonly prompt: string
  readonly created_at: string
  readonly updated_at: string
  readonly deleted_at: string | null
}

export class SkillService {
  private readonly idFactory: () => string
  private readonly now: () => string

  constructor(
    private readonly database: SqliteDatabase,
    options: SkillServiceOptions = {},
  ) {
    this.idFactory = options.idFactory ?? randomUUID
    this.now = options.now ?? (() => new Date().toISOString())
  }

  listSkills(options: { readonly includeDeleted?: boolean } = {}): SkillRecord[] {
    const rows = this.database
      .prepare(
        `SELECT id, name, prompt, created_at, updated_at, deleted_at
           FROM skills
          ${options.includeDeleted ? '' : 'WHERE deleted_at IS NULL'}
          ORDER BY updated_at DESC, created_at DESC, id`,
      )
      .all() as SkillRow[]
    return rows.map(mapSkill)
  }

  createSkill(name: string, prompt: string): SkillRecord {
    const normalizedName = normalizeName(name)
    const normalizedPrompt = normalizePrompt(prompt)
    const id = this.idFactory()
    const now = this.now()
    this.database
      .prepare(
        `INSERT INTO skills (id, name, prompt, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(id, normalizedName, normalizedPrompt, now, now)
    return this.requireSkill(id)
  }

  updateSkill(skillId: string, name: string, prompt: string): SkillRecord {
    const existing = this.requireActiveSkill(skillId)
    const normalizedName = normalizeName(name)
    const normalizedPrompt = normalizePrompt(prompt)
    this.database
      .prepare(
        `UPDATE skills
            SET name = ?, prompt = ?, updated_at = ?
          WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(normalizedName, normalizedPrompt, this.now(), existing.id)
    return this.requireSkill(existing.id)
  }

  softDeleteSkill(skillId: string): SkillRecord {
    const existing = this.requireActiveSkill(skillId)
    const now = this.now()
    this.database
      .prepare(
        `UPDATE skills
            SET updated_at = ?, deleted_at = ?
          WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(now, now, existing.id)
    return this.requireSkill(existing.id)
  }

  getActiveSkill(skillId: string): SkillRecord {
    return this.requireActiveSkill(skillId)
  }

  private requireActiveSkill(skillId: string): SkillRecord {
    const skill = this.findSkill(skillId)
    if (skill === undefined) {
      throw new SkillServiceError('SKILL_NOT_FOUND', '所选 Skill 不存在。')
    }
    if (skill.deletedAt !== null) {
      throw new SkillServiceError('SKILL_DELETED', '所选 Skill 已删除，请重新选择。')
    }
    return skill
  }

  private requireSkill(skillId: string): SkillRecord {
    const skill = this.findSkill(skillId)
    if (skill === undefined) {
      throw new SkillServiceError('SKILL_NOT_FOUND', 'Skill 不存在。')
    }
    return skill
  }

  private findSkill(skillId: string): SkillRecord | undefined {
    if (typeof skillId !== 'string' || skillId.trim() === '') {
      throw new SkillServiceError('SKILL_NOT_FOUND', 'Skill 不存在。')
    }
    const row = this.database
      .prepare(
        `SELECT id, name, prompt, created_at, updated_at, deleted_at
           FROM skills
          WHERE id = ?`,
      )
      .get(skillId) as SkillRow | undefined
    return row === undefined ? undefined : mapSkill(row)
  }
}

function normalizeName(value: string): string {
  if (typeof value !== 'string') {
    throw new SkillServiceError('SKILL_INVALID_NAME', 'Skill 名称不能为空。')
  }
  const normalized = value.trim()
  if (normalized === '' || normalized.length > SKILL_NAME_MAX_CHARS) {
    throw new SkillServiceError(
      'SKILL_INVALID_NAME',
      `Skill 名称应为 1–${SKILL_NAME_MAX_CHARS} 个字符。`,
    )
  }
  return normalized
}

function normalizePrompt(value: string): string {
  if (typeof value !== 'string') {
    throw new SkillServiceError('SKILL_INVALID_PROMPT', 'Skill Prompt 不能为空。')
  }
  const normalized = value.trim()
  if (normalized === '' || normalized.length > SKILL_PROMPT_MAX_CHARS) {
    throw new SkillServiceError(
      'SKILL_INVALID_PROMPT',
      `Skill Prompt 应为 1–${SKILL_PROMPT_MAX_CHARS} 个字符。`,
    )
  }
  return normalized
}

function mapSkill(row: SkillRow): SkillRecord {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}
