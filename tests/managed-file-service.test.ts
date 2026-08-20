import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { ManagedFileError, ManagedFileService, resolveManagedObjectPath } from '../src/main/files/managed-file-service'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'

interface Fixture {
  readonly baseDirectory: string
  readonly workspace: WorkspaceHandle
  readonly core: CoreDataService
  readonly files: ManagedFileService
}

const fixtures: Fixture[] = []

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.workspace.close()
    rmSync(fixture.baseDirectory, { recursive: true, force: true })
  }
})

function createFixture(): Fixture {
  const baseDirectory = mkdtempSync(join(tmpdir(), 'teacher-workbench-l02-'))
  const workspace = initializeWorkspace(
    join(baseDirectory, 'workspace'),
    join(baseDirectory, 'install'),
  )
  const core = new CoreDataService(workspace.database.raw)
  const files = new ManagedFileService(workspace.database.raw, workspace.paths, {
    now: () => '2026-08-20T00:00:00.000Z',
  })
  const fixture = { baseDirectory, workspace, core, files }
  fixtures.push(fixture)
  return fixture
}

function createSource(fixture: Fixture, contents = 'original material'): string {
  const sourcePath = join(fixture.baseDirectory, 'source.txt')
  writeFileSync(sourcePath, contents, 'utf8')
  return sourcePath
}

describe('L02 managed file service', () => {
  it('imports into the controlled object layout and returns only registered content', () => {
    const fixture = createFixture()
    const sourcePath = createSource(fixture)

    const record = fixture.files.importFile(sourcePath)
    const contentPath = fixture.files.openFile(record.id)

    expect(contentPath).toBe(join(fixture.workspace.paths.objectsDirectory, record.id, 'content'))
    expect(readFileSync(contentPath, 'utf8')).toBe('original material')
    expect(fixture.files.showFileInFolder(record.id)).toBe(contentPath)
    expect(fixture.files.getOverview()).toMatchObject({ files: [record], links: [] })
  })

  it('rejects traversal and unregistered object IDs before opening anything', () => {
    const fixture = createFixture()
    const unregisteredId = randomUUID()
    const unregisteredDirectory = join(fixture.workspace.paths.objectsDirectory, unregisteredId)
    const traversalId = '..'
    mkdirSync(unregisteredDirectory, { recursive: true })
    writeFileSync(join(unregisteredDirectory, 'content'), 'unregistered', 'utf8')

    expect(() => resolveManagedObjectPath(fixture.workspace.paths, traversalId)).toThrowError(
      expect.objectContaining({ code: 'FILE_ID_INVALID' }),
    )
    expect(() => fixture.files.openFile(unregisteredId)).toThrowError(
      expect.objectContaining({ code: 'FILE_NOT_FOUND' }),
    )
  })

  it('creates independent copies for two lessons and a student', () => {
    const fixture = createFixture()
    const course = fixture.core.nodes.createCourse('课程', 'class')
    const period = fixture.core.nodes.createPeriod(course.id, '阶段')
    const lessonA = fixture.core.nodes.createLesson(period.id, '课次 A')
    const lessonB = fixture.core.nodes.createLesson(period.id, '课次 B')
    const student = fixture.core.createStudentForCourse(course.id, '学生 A')
    const sourcePath = createSource(fixture)
    const source = fixture.files.importFile(sourcePath)

    const copyA = fixture.files.copyToLesson(source.id, lessonA.id)
    const copyB = fixture.files.copyToLesson(source.id, lessonB.id)
    const studentCopy = fixture.files.copyToStudent(source.id, student.id)

    expect(copyA.id).not.toBe(source.id)
    expect(copyB.id).not.toBe(source.id)
    expect(studentCopy.id).not.toBe(source.id)
    expect(copyA.originFileId).toBe(source.id)
    expect(copyB.originFileId).toBe(source.id)
    expect(studentCopy.originFileId).toBe(source.id)

    writeFileSync(fixture.files.getObjectContentPath(copyA.id), 'lesson A changed', 'utf8')

    expect(readFileSync(sourcePath, 'utf8')).toBe('original material')
    expect(readFileSync(fixture.files.getObjectContentPath(source.id), 'utf8')).toBe('original material')
    expect(readFileSync(fixture.files.getObjectContentPath(copyB.id), 'utf8')).toBe('original material')
    expect(readFileSync(fixture.files.getObjectContentPath(studentCopy.id), 'utf8')).toBe('original material')
    expect(fixture.files.getOverview().links).toEqual(expect.arrayContaining([
      expect.objectContaining({ fileId: copyA.id, targetType: 'lesson', targetId: lessonA.id }),
      expect.objectContaining({ fileId: copyB.id, targetType: 'lesson', targetId: lessonB.id }),
      expect.objectContaining({ fileId: studentCopy.id, targetType: 'student', targetId: student.id }),
    ]))
  })

  it('soft deletes and restores a file without removing its managed object', () => {
    const fixture = createFixture()
    const record = fixture.files.importFile(createSource(fixture))
    const contentPath = fixture.files.getObjectContentPath(record.id)

    const deleted = fixture.files.softDeleteFile(record.id)
    expect(deleted.deletedAt).toBe('2026-08-20T00:00:00.000Z')
    expect(fixture.files.listFiles()).toEqual([])
    expect(fixture.files.listFiles({ includeDeleted: true })).toEqual([deleted])
    expect(() => fixture.files.openFile(record.id)).toThrowError(
      expect.objectContaining({ code: 'FILE_DELETED' }),
    )
    expect(readFileSync(contentPath, 'utf8')).toBe('original material')

    const restored = fixture.files.restoreFile(record.id)
    expect(restored.deletedAt).toBeNull()
    expect(fixture.files.openFile(record.id)).toBe(contentPath)
  })

  it('reconciles external edits asynchronously and avoids repeat hashing when metadata is unchanged', async () => {
    const fixture = createFixture()
    const record = fixture.files.importFile(createSource(fixture))

    const baseline = await fixture.files.refreshFile(record.id)
    expect(baseline.hashComputed).toBe(true)
    expect(baseline.contentChanged).toBe(false)
    expect(baseline.file.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(baseline.file.mtimeMs).toEqual(expect.any(Number))

    const unchanged = await fixture.files.refreshFile(record.id)
    expect(unchanged).toMatchObject({ hashComputed: false, contentChanged: false })

    writeFileSync(
      fixture.files.getObjectContentPath(record.id),
      'external editor changed this managed file',
      'utf8',
    )
    const changed = await fixture.files.refreshFile(record.id)
    expect(changed.hashComputed).toBe(true)
    expect(changed.contentChanged).toBe(true)
    expect(changed.file.sizeBytes).toBeGreaterThan(record.sizeBytes)
    expect(changed.file.contentHash).not.toBe(baseline.file.contentHash)

    const afterChange = await fixture.files.refreshFile(record.id)
    expect(afterChange).toMatchObject({ hashComputed: false, contentChanged: false })
  })

  it('cleans the object directory when the copy operation fails', () => {
    const fixture = createFixture()
    const failingService = new ManagedFileService(fixture.workspace.database.raw, fixture.workspace.paths, {
      copyFile: () => {
        throw new Error('simulated copy failure')
      },
    })

    expect(() => failingService.importFile(createSource(fixture))).toThrowError(
      new ManagedFileError('FILE_COPY_FAILED', '文件复制失败，未保留半成品。'),
    )
    expect(failingService.getOverview()).toEqual({ files: [], links: [] })
    expect(readdirSync(fixture.workspace.paths.objectsDirectory)).toEqual([])
  })
})
