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
    expect(first.identity).toEqual({ workspaceId: 'workspace-test-id', schemaVersion: 11 })
    expect(getAppliedMigrationVersions(first.database.raw)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    first.close()

    const second = initializeWorkspace(root, installDirectory, { idFactory: () => 'should-not-replace-id' })
    expect(second.identity).toEqual({ workspaceId: 'workspace-test-id', schemaVersion: 11 })
    expect(getAppliedMigrationVersions(second.database.raw)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(readWorkspaceIdentity(second.database.raw)).toEqual(second.identity)
    second.close()
  })

  it('rolls back a failed migration and does not advance the schema version', () => {
    const temporaryRoot = createTemporaryDirectory()
    const root = join(temporaryRoot, 'workspace')
    const installDirectory = join(temporaryRoot, 'install')
    const failingMigration = {
      version: 12,
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
    expect(reopened.identity.schemaVersion).toBe(11)
    expect(getAppliedMigrationVersions(reopened.database.raw)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
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
      migrations: workspaceMigrations.slice(0, 10),
    })
    const beforeCore = new CoreDataService(beforeV11.database.raw)
    const course = beforeCore.nodes.createCourse('旧一对一课程', 'one_to_one')
    const period = beforeCore.nodes.createPeriod(course.id, '旧阶段')
    const lesson = beforeCore.nodes.createLesson(period.id, '旧课次')
    const student = beforeCore.createStudentForCourse(course.id, '旧学生')
    const oldTimestamp = '2026-08-21T00:00:00.000Z'
    beforeV11.database.raw.prepare(
      `INSERT INTO notes
         (id, student_id, lesson_id, body_md, created_at, updated_at, deleted_at,
          note_kind, ai_metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run('old-manual-note', student.id, lesson.id, '迁移前记录', oldTimestamp, oldTimestamp, 'manual', null)
    const oldMetadata = {
      kind: 'lecture' as const,
      promptVersion: 'l09-v1',
      provider: 'openai-compatible',
      model: 'fake-model',
      sources: [{ fileId: 'old-file', charsSent: 4 }],
      inputChars: 4,
      maxChars: 100,
      maxTokens: 100,
    }
    beforeV11.database.raw.prepare(
      `INSERT INTO notes
         (id, student_id, lesson_id, body_md, created_at, updated_at, deleted_at,
          note_kind, ai_metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run('old-ai-note', student.id, lesson.id, '迁移前 AI 草稿', oldTimestamp, oldTimestamp, 'lecture', JSON.stringify(oldMetadata))
    const oldNote = {
      id: 'old-manual-note',
      studentId: student.id,
      lessonId: lesson.id,
      bodyMd: '迁移前记录',
      createdAt: oldTimestamp,
      updatedAt: oldTimestamp,
      deletedAt: null,
    }
    beforeV11.close()

    const migrated = initializeWorkspace(root, installDirectory)
    const migratedCore = new CoreDataService(migrated.database.raw)
    expect(migrated.identity.schemaVersion).toBe(11)
    expect(migratedCore.getOverview().notes).toContainEqual(oldNote)
    expect(migratedCore.getOverview().notes).toContainEqual(expect.objectContaining({
      id: 'old-ai-note',
      bodyMd: '迁移前 AI 草稿',
      noteKind: 'lecture',
      draftStatus: 'draft',
      aiMetadata: oldMetadata,
    }))
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
    expect(classDraft).toMatchObject({ studentId: null, lessonId: classLesson.id, draftStatus: 'draft' })
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

  it('keeps draft and saved lifecycle states after closing and reopening the workspace', () => {
    const temporaryRoot = createTemporaryDirectory()
    const root = join(temporaryRoot, 'workspace')
    const installDirectory = join(temporaryRoot, 'install')
    const first = initializeWorkspace(root, installDirectory)
    const firstCore = new CoreDataService(first.database.raw)
    const course = firstCore.nodes.createCourse('持久化课程', 'class')
    const period = firstCore.nodes.createPeriod(course.id, '阶段')
    const lesson = firstCore.nodes.createLesson(period.id, '课次')
    const draft = firstCore.createLessonDraft(lesson.id, '# 自动保存草稿', {
      noteKind: 'lecture',
      aiMetadata: {
        kind: 'lecture',
        promptVersion: 'v11-03-v1',
        provider: 'openai-compatible',
        model: 'fake-model',
        sources: [{ fileId: 'source-file', charsSent: 4 }],
        inputChars: 4,
        maxChars: 100,
        maxTokens: 100,
      },
    })
    first.close()

    const second = initializeWorkspace(root, installDirectory)
    const secondCore = new CoreDataService(second.database.raw)
    expect(secondCore.getOverview().notes).toContainEqual(expect.objectContaining({
      id: draft.id,
      bodyMd: '# 自动保存草稿',
      draftStatus: 'draft',
    }))
    secondCore.saveDraftToLesson(draft.id, '# 保存后的课次成果')
    second.close()

    const third = initializeWorkspace(root, installDirectory)
    expect(new CoreDataService(third.database.raw).getOverview().notes).toContainEqual(
      expect.objectContaining({
        id: draft.id,
        bodyMd: '# 保存后的课次成果',
        draftStatus: 'saved',
      }),
    )
    third.close()
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
