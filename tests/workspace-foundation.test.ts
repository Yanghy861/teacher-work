import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { SkillService } from '../src/main/skills/skill-service'
import {
  getAppliedMigrationVersions,
  type SqliteDatabase,
  workspaceMigrations,
} from '../src/main/db/migrations'
import {
  initializeDefaultWorkspace,
  initializeWorkspace,
  readWorkspaceIdentity,
} from '../src/main/workspace/workspace-service'
import {
  WorkspacePathError,
  WorkspacePaths,
} from '../src/main/workspace/workspace-paths'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'teacher-workbench-t02-'))
  temporaryDirectories.push(directory)
  return directory
}

describe('workspace paths and SQLite foundation', () => {
  it('initializes the isolated directory tree and reopens without duplicate migrations', () => {
    const temporaryRoot = createTemporaryDirectory()
    const root = join(temporaryRoot, 'workspace')
    const installDirectory = join(temporaryRoot, 'install')
    const first = initializeWorkspace(root, installDirectory, { idFactory: () => 'workspace-test-id' })

    expect(first.paths.databasePath).toBe(join(root, 'data', 'workspace.db'))
    expect(first.paths.objectsDirectory).toBe(join(root, 'files', 'objects'))
    expect(first.paths.searchDirectory).toBe(join(root, 'search'))
    expect(first.paths.cacheDirectory).toBe(join(root, 'cache'))
    expect(first.paths.backupsDirectory).toBe(join(root, 'backups'))
    expect(first.identity).toEqual({ workspaceId: 'workspace-test-id', schemaVersion: 10 })
    expect(getAppliedMigrationVersions(first.database.raw)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    first.close()

    const second = initializeWorkspace(root, installDirectory, { idFactory: () => 'should-not-replace-id' })
    expect(second.identity).toEqual({ workspaceId: 'workspace-test-id', schemaVersion: 10 })
    expect(getAppliedMigrationVersions(second.database.raw)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(readWorkspaceIdentity(second.database.raw)).toEqual(second.identity)
    second.close()
  })

  it('rolls back a failed migration and does not advance the schema version', () => {
    const temporaryRoot = createTemporaryDirectory()
    const root = join(temporaryRoot, 'workspace')
    const installDirectory = join(temporaryRoot, 'install')
    const failingMigration = {
      version: 11,
      name: 'failing_test_migration',
      up: (database: SqliteDatabase) => {
        database.exec('CREATE TABLE should_rollback (value TEXT NOT NULL)')
        throw new Error('simulated migration failure')
      },
    }

    expect(() =>
      initializeWorkspace(root, installDirectory, {
        migrations: [...workspaceMigrations, failingMigration],
      }),
    ).toThrow('simulated migration failure')

    const reopened = initializeWorkspace(root, installDirectory)
    expect(reopened.identity.schemaVersion).toBe(10)
    expect(getAppliedMigrationVersions(reopened.database.raw)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const rolledBackTable = reopened.database.raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'should_rollback'")
      .get()
    expect(rolledBackTable).toBeUndefined()
    reopened.close()
  })

  it('preserves V1 notes while allowing a lesson draft without a student', () => {
    const temporaryRoot = createTemporaryDirectory()
    const root = join(temporaryRoot, 'workspace')
    const installDirectory = join(temporaryRoot, 'install')
    const beforeV11 = initializeWorkspace(root, installDirectory, {
      migrations: workspaceMigrations.slice(0, 8),
    })
    const beforeCore = new CoreDataService(beforeV11.database.raw)
    const course = beforeCore.nodes.createCourse('旧一对一课程', 'one_to_one')
    const period = beforeCore.nodes.createPeriod(course.id, '旧阶段')
    const lesson = beforeCore.nodes.createLesson(period.id, '旧课次')
    const student = beforeCore.createStudentForCourse(course.id, '旧学生')
    const oldNote = beforeCore.createNote(student.id, '迁移前记录', lesson.id)
    beforeV11.close()

    const migrated = initializeWorkspace(root, installDirectory)
    const migratedCore = new CoreDataService(migrated.database.raw)
    expect(migrated.identity.schemaVersion).toBe(10)
    expect(migratedCore.getOverview().notes).toContainEqual(oldNote)
    expect(new SkillService(migrated.database.raw).listSkills().map((skill) => skill.name)).toEqual([
      'AMC8 一对一常规备课',
      '初中数学常规备课',
    ])

    const classCourse = migratedCore.nodes.createCourse('无学生班课', 'class')
    const classPeriod = migratedCore.nodes.createPeriod(classCourse.id, '班课阶段')
    const classLesson = migratedCore.nodes.createLesson(classPeriod.id, '班课课次')
    const classDraft = migratedCore.createLessonDraft(
      classLesson.id,
      '班课讲义草稿',
      {
        noteKind: 'lecture',
        aiMetadata: {
          kind: 'lecture',
          promptVersion: 'l09-v1',
          provider: 'openai-compatible',
          model: 'fake-model',
          sources: [{ fileId: 'source-file', charsSent: 4 }],
          inputChars: 4,
          maxChars: 100,
          maxTokens: 100,
        },
      },
    )
    expect(classDraft).toMatchObject({ studentId: null, lessonId: classLesson.id })
    migrated.close()
  })

  it('keeps workspace data outside a replaceable application build directory', () => {
    const temporaryRoot = createTemporaryDirectory()
    const root = join(temporaryRoot, 'workspace')
    const buildDirectory = join(temporaryRoot, 'out')
    const installDirectory = join(temporaryRoot, 'install')
    mkdirSync(buildDirectory, { recursive: true })
    writeFileSync(join(buildDirectory, 'app.js'), 'temporary build')

    const first = initializeWorkspace(root, installDirectory, { idFactory: () => 'persistent-workspace-id' })
    first.close()
    rmSync(buildDirectory, { recursive: true, force: true })
    mkdirSync(buildDirectory, { recursive: true })
    writeFileSync(join(buildDirectory, 'app.js'), 'replacement build')

    const second = initializeWorkspace(root, installDirectory)
    expect(second.identity.workspaceId).toBe('persistent-workspace-id')
    expect(readFileSync(join(buildDirectory, 'app.js'), 'utf8')).toBe('replacement build')
    second.close()
  })

  it('creates the default workspace beside application data, never inside the install directory', () => {
    const temporaryRoot = createTemporaryDirectory()
    const appDataDirectory = join(temporaryRoot, 'app-data')
    const installDirectory = join(temporaryRoot, 'install')

    const workspace = initializeDefaultWorkspace(appDataDirectory, installDirectory)
    expect(workspace.paths.root).toBe(join(appDataDirectory, 'TeacherWorkspace'))
    expect(workspace.paths.root.startsWith(installDirectory)).toBe(false)
    workspace.close()
  })

  it('rejects invalid, application-local, non-directory, and non-writable paths explicitly', () => {
    const temporaryRoot = createTemporaryDirectory()
    const installDirectory = join(temporaryRoot, 'install')
    const invalidFile = join(temporaryRoot, 'not-a-directory')
    writeFileSync(invalidFile, 'not a directory')

    expect(() => WorkspacePaths.fromRoot('relative-workspace', installDirectory)).toThrowError(
      expect.objectContaining({ code: 'WORKSPACE_PATH_NOT_ABSOLUTE' }),
    )
    expect(() => WorkspacePaths.fromRoot(installDirectory, installDirectory)).toThrowError(
      expect.objectContaining({ code: 'WORKSPACE_PATH_INSIDE_APP' }),
    )
    expect(() => WorkspacePaths.fromRoot(join(installDirectory, 'workspace'), installDirectory)).toThrowError(
      expect.objectContaining({ code: 'WORKSPACE_PATH_INSIDE_APP' }),
    )
    expect(() => initializeWorkspace(installDirectory, installDirectory)).toThrowError(
      expect.objectContaining({ code: 'WORKSPACE_PATH_INSIDE_APP' }),
    )
    expect(() =>
      initializeWorkspace(join(installDirectory, 'workspace'), installDirectory),
    ).toThrowError(expect.objectContaining({ code: 'WORKSPACE_PATH_INSIDE_APP' }))
    expect(() => WorkspacePaths.fromDefaultLocation(installDirectory, installDirectory)).toThrowError(
      expect.objectContaining({ code: 'WORKSPACE_PATH_INSIDE_APP' }),
    )
    expect(() => initializeWorkspace(invalidFile, installDirectory)).toThrowError(
      expect.objectContaining({ code: 'WORKSPACE_PATH_NOT_DIRECTORY' }),
    )

    let failedDirectory = ''
    expect(() =>
      initializeWorkspace(join(temporaryRoot, 'unwritable'), installDirectory, {
        writableProbe: (directory) => {
          failedDirectory = directory
          throw new Error('simulated permission denied')
        },
      }),
    ).toThrowError(
      new WorkspacePathError(
        'WORKSPACE_PATH_NOT_WRITABLE',
        `工作区目录不可写：${join(temporaryRoot, 'unwritable')}。请检查权限或选择其他文件夹。`,
        join(temporaryRoot, 'unwritable'),
      ),
    )
    expect(failedDirectory).toBe(join(temporaryRoot, 'unwritable'))
    expect(existsSync(join(temporaryRoot, 'TeacherWorkspace'))).toBe(false)
  })
})
