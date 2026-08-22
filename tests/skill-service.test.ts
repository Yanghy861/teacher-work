import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { runMigrations } from '../src/main/db/migrations'
import { SkillService } from '../src/main/skills/skill-service'

const databases: Database.Database[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

function createService(): SkillService {
  const database = new Database(':memory:')
  databases.push(database)
  database.pragma('foreign_keys = ON')
  runMigrations(database)
  let nextId = 0
  let tick = 0
  return new SkillService(database, {
    idFactory: () => `skill-${nextId++}`,
    now: () => `2026-08-22T00:00:0${tick++}.000Z`,
  })
}

describe('V11-03 skill service', () => {
  it('seeds two editable starter prompts and supports create, update, and soft delete', () => {
    const service = createService()
    expect(service.listSkills().map((skill) => skill.name)).toEqual([
      'AMC8 一对一常规备课',
      '初中数学常规备课',
    ])

    const created = service.createSkill(' 考前复习 ', ' 聚焦高频错题与时间分配。 ')
    expect(created).toMatchObject({ name: '考前复习', prompt: '聚焦高频错题与时间分配。', deletedAt: null })

    const updated = service.updateSkill(created.id, '考前冲刺', '先诊断，再分层练习。')
    expect(updated).toMatchObject({ name: '考前冲刺', prompt: '先诊断，再分层练习。' })
    expect(updated.updatedAt).not.toBe(created.updatedAt)

    const deleted = service.softDeleteSkill(created.id)
    expect(deleted.deletedAt).not.toBeNull()
    expect(service.listSkills().some((skill) => skill.id === created.id)).toBe(false)
    expect(service.listSkills({ includeDeleted: true }).some((skill) => skill.id === created.id)).toBe(true)
    expect(() => service.getActiveSkill(created.id)).toThrowError(
      expect.objectContaining({ code: 'SKILL_DELETED' }),
    )
  })

  it('rejects empty or oversized values at the service boundary', () => {
    const service = createService()
    expect(() => service.createSkill('   ', '有效 Prompt')).toThrowError(
      expect.objectContaining({ code: 'SKILL_INVALID_NAME' }),
    )
    expect(() => service.createSkill('有效名称', '   ')).toThrowError(
      expect.objectContaining({ code: 'SKILL_INVALID_PROMPT' }),
    )
    expect(() => service.createSkill('有效名称', 'x'.repeat(20_001))).toThrowError(
      expect.objectContaining({ code: 'SKILL_INVALID_PROMPT' }),
    )
  })
})
