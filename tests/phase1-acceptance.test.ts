import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'

interface AcceptanceFixture {
  readonly baseDirectory: string
  readonly workspace: WorkspaceHandle
}

const fixtures: AcceptanceFixture[] = []

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.workspace.close()
    rmSync(fixture.baseDirectory, { recursive: true, force: true })
  }
})

describe('L04 phase 1 acceptance', () => {
  it('runs the representative managed-material flow end to end', async () => {
    const baseDirectory = mkdtempSync(join(tmpdir(), 'teacher-workbench-l04-'))
    const workspace = initializeWorkspace(
      join(baseDirectory, 'workspace'),
      join(baseDirectory, 'install'),
    )
    fixtures.push({ baseDirectory, workspace })

    const core = new CoreDataService(workspace.database.raw, {
      now: () => '2026-08-21T00:00:00.000Z',
    })
    const files = new ManagedFileService(workspace.database.raw, workspace.paths, {
      now: () => '2026-08-21T00:00:00.000Z',
    })

    const course = core.nodes.createCourse('L04 一对一课程', 'one_to_one')
    const spring = core.nodes.createPeriod(course.id, '2026 春·六下')
    const autumn = core.nodes.createPeriod(course.id, '2028 秋·八上')
    const lessonA = core.nodes.createLesson(spring.id, '分数基础')
    const lessonB = core.nodes.createLesson(autumn.id, '二次函数')
    const student = core.createStudentForCourse(course.id, 'L04 学生')

    expect(core.getOverview().nodes.filter((node) => node.kind === 'period').map((node) => node.title)).toEqual([
      '2026 春·六下',
      '2028 秋·八上',
    ])
    expect(student.name).toBe('L04 学生')

    const sourcePath = join(baseDirectory, 'source.md')
    writeFileSync(sourcePath, '# 原始资料\n\n基础内容', 'utf8')
    const source = files.importFile(sourcePath)
    const copyA = files.copyToLesson(source.id, lessonA.id)
    const copyB = files.copyToLesson(source.id, lessonB.id)

    expect(copyA.originFileId).toBe(source.id)
    expect(copyB.originFileId).toBe(source.id)
    expect(copyA.id).not.toBe(copyB.id)
    expect(readFileSync(files.getObjectContentPath(copyA.id), 'utf8')).toBe('# 原始资料\n\n基础内容')
    expect(readFileSync(files.getObjectContentPath(copyB.id), 'utf8')).toBe('# 原始资料\n\n基础内容')

    const baseline = await files.refreshAll()
    expect(baseline.find((result) => result.file.id === copyA.id)).toMatchObject({
      hashComputed: true,
      contentChanged: false,
    })

    writeFileSync(files.getObjectContentPath(copyA.id), '# 课次 A 修改\n\n只改这一份', 'utf8')
    const refreshed = await files.refreshAll()
    expect(refreshed.find((result) => result.file.id === copyA.id)).toMatchObject({
      hashComputed: true,
      contentChanged: true,
    })
    expect(refreshed.find((result) => result.file.id === copyB.id)).toMatchObject({
      contentChanged: false,
    })
    expect(readFileSync(files.getObjectContentPath(copyB.id), 'utf8')).toBe('# 原始资料\n\n基础内容')
    expect(readFileSync(files.getObjectContentPath(source.id), 'utf8')).toBe('# 原始资料\n\n基础内容')

    const deleted = files.softDeleteFile(copyA.id)
    expect(deleted.deletedAt).toBe('2026-08-21T00:00:00.000Z')
    expect(files.listFiles()).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: copyA.id })]))
    expect(files.getOverview().files).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: copyA.id, deletedAt: '2026-08-21T00:00:00.000Z' }),
    ]))

    const restored = files.restoreFile(copyA.id)
    expect(restored.deletedAt).toBeNull()
    expect(files.openFile(copyA.id)).toBe(files.getObjectContentPath(copyA.id))
    expect(files.getOverview().links).toEqual(expect.arrayContaining([
      expect.objectContaining({ fileId: copyA.id, targetType: 'lesson', targetId: lessonA.id }),
      expect.objectContaining({ fileId: copyB.id, targetType: 'lesson', targetId: lessonB.id }),
    ]))
  })
})
