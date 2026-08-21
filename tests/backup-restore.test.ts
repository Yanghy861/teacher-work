import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  BackupRestoreError,
  BackupRestoreService,
} from '../src/main/backup/backup-service'
import { CoreDataService } from '../src/main/data/core-data-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { openSearchDatabase } from '../src/main/search/search-database'
import { SearchService } from '../src/main/search/search-service'
import { WorkspaceActivityGate } from '../src/main/workspace/activity-gate'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'

const roots: string[] = []
const handles: WorkspaceHandle[] = []

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-l11-'))
  roots.push(root)
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'), { idFactory: () => 'workspace-l11-id' })
  handles.push(workspace)
  const core = new CoreDataService(workspace.database.raw)
  const files = new ManagedFileService(workspace.database.raw, workspace.paths)
  const source = join(root, 'lesson-note.txt')
  writeFileSync(source, 'L11 managed content', 'utf8')
  const file = files.importFile(source)
  const course = core.nodes.createCourse('L11 课程', 'one_to_one')
  const period = core.nodes.createPeriod(course.id, '第一阶段')
  const lesson = core.nodes.createLesson(period.id, '一次函数')
  const student = core.createStudentForCourse(course.id, '学生甲')
  const note = core.createNote(student.id, 'L11 note 内容', lesson.id)
  files.copyToLesson(file.id, lesson.id)
  files.copyToStudent(file.id, student.id)
  writeFileSync(join(workspace.paths.searchDirectory, 'must-not-copy.db'), 'derived')
  writeFileSync(join(workspace.paths.searchDirectory, 'search.db'), 'derived-index')
  writeFileSync(join(workspace.paths.cacheDirectory, 'must-not-copy.tmp'), 'cache')
  writeFileSync(join(workspace.paths.root, 'teacher-workbench-ai-key.bin'), 'L11_SAFE_STORAGE_CIPHERTEXT')
  return { root, workspace, core, files, file, course, period, lesson, student, note }
}

function scanText(root: string): string {
  return readdirSync(root, { withFileTypes: true }).map((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? scanText(path) : readFileSync(path).toString('utf8')
  }).join('\n')
}

describe('L11 backup and restore', () => {
  it('backs up through SQLite API and restores core data, notes, and managed files', async () => {
    const value = fixture()
    const backup = join(value.root, 'backup')
    const restored = join(value.root, 'restored')
    const service = new BackupRestoreService(value.workspace, join(value.root, 'install'), new WorkspaceActivityGate())

    const created = await service.createBackup(backup)
    expect(created.manifest.workspaceId).toBe('workspace-l11-id')
    expect(created.manifest.fileCount).toBe(3)
    expect(created.manifest.totalFileSize).toBe('L11 managed content'.length * 3)
    expect(readFileSync(join(backup, 'workspace.db')).length).toBeGreaterThan(0)
    expect(scanText(backup)).not.toContain('derived')
    expect(scanText(backup)).not.toContain('derived-index')
    expect(scanText(backup)).not.toContain('cache')
    expect(scanText(backup)).not.toContain('L11_SAFE_STORAGE_CIPHERTEXT')
    expect(readdirSync(backup)).toEqual(expect.arrayContaining(['workspace.db', 'backup_manifest.json', 'files']))

    const result = await service.restoreBackup(backup, restored)
    expect(result.workspacePath).toBe(restored)
    const reopened = initializeWorkspace(restored, join(value.root, 'install'))
    handles.push(reopened)
    const overview = new CoreDataService(reopened.database.raw).getOverview()
    expect(overview.nodes.map((node) => node.title)).toEqual(expect.arrayContaining(['L11 课程', '第一阶段', '一次函数']))
    expect(overview.students.map((student) => student.name)).toContain('学生甲')
    expect(overview.notes.map((note) => note.bodyMd)).toContain('L11 note 内容')
    const restoredObject = join(reopened.paths.objectsDirectory, value.file.id, 'content')
    expect(readFileSync(restoredObject, 'utf8')).toBe('L11 managed content')

    const searchDb = openSearchDatabase(reopened.paths)
    try {
      const search = new SearchService(reopened.database.raw, searchDb.raw, reopened.paths)
      expect((await search.search({ text: 'L11 managed' })).some((hit) => hit.fileId === value.file.id)).toBe(true)
      expect((await search.search({ text: 'L11 note' })).some((hit) => hit.sourceType === 'note')).toBe(true)
    } finally {
      searchDb.close()
    }
  })

  it('keeps the source unchanged when backup fails before publication', async () => {
    const value = fixture()
    const before = readFileSync(join(value.workspace.paths.objectsDirectory, value.file.id, 'content'), 'utf8')
    const backup = join(value.root, 'failed-backup')
    const service = new BackupRestoreService(value.workspace, join(value.root, 'install'), new WorkspaceActivityGate(), {
      copyFile: () => { throw new Error('simulated disk full') },
    })

    await expect(service.createBackup(backup)).rejects.toMatchObject({ code: 'BACKUP_FAILED' })
    expect(readFileSync(join(value.workspace.paths.objectsDirectory, value.file.id, 'content'), 'utf8')).toBe(before)
    expect(() => readdirSync(backup)).toThrow()
  })

  it('pauses new business activity while SQLite and managed files are being staged', async () => {
    const value = fixture()
    const gate = new WorkspaceActivityGate()
    const events: string[] = []
    let releaseDatabase: (() => void) | undefined
    const service = new BackupRestoreService(value.workspace, join(value.root, 'install'), gate, {
      pauseIndexing: async () => { events.push('pause-indexing') },
      resumeIndexing: () => { events.push('resume-indexing') },
      backupDatabase: async (destination) => {
        await value.workspace.database.backup(destination)
        await new Promise<void>((resolve) => {
          releaseDatabase = resolve
        })
      },
    })
    const running = service.createBackup(join(value.root, 'paused-backup'))
    while (releaseDatabase === undefined) {
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
    await expect(gate.run(() => 'blocked')).rejects.toMatchObject({ code: 'WORKSPACE_PAUSED' })
    releaseDatabase()
    await running
    expect(events).toEqual(['pause-indexing', 'resume-indexing'])
  })

  it('rejects traversal, non-empty targets, and file/size limits', async () => {
    const value = fixture()
    const backup = join(value.root, 'backup')
    const service = new BackupRestoreService(value.workspace, join(value.root, 'install'), new WorkspaceActivityGate())
    await service.createBackup(backup)

    const manifestPath = join(backup, 'backup_manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { files: Array<Record<string, unknown>> }
    manifest.files[0]!.relativePath = '../escape'
    writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8')
    await expect(service.restoreBackup(backup, join(value.root, 'traversal-target'))).rejects.toMatchObject({
      code: 'BACKUP_PATH_INVALID',
    })

    await service.createBackup(join(value.root, 'backup-2'))
    const nonEmpty = join(value.root, 'non-empty')
    writeFileSync(nonEmpty, 'file')
    await expect(service.restoreBackup(join(value.root, 'backup-2'), nonEmpty)).rejects.toMatchObject({
      code: 'RESTORE_TARGET_INVALID',
    })

    const limited = new BackupRestoreService(value.workspace, join(value.root, 'install'), new WorkspaceActivityGate(), {
      maxFiles: 0,
    })
    await expect(limited.createBackup(join(value.root, 'limited'))).rejects.toMatchObject({
      code: 'BACKUP_LIMIT_EXCEEDED',
    })
    const small = new BackupRestoreService(value.workspace, join(value.root, 'install'), new WorkspaceActivityGate(), {
      maxTotalBytes: 1,
    })
    await expect(small.createBackup(join(value.root, 'small'))).rejects.toBeInstanceOf(BackupRestoreError)

    const overLimit = new BackupRestoreService(value.workspace, join(value.root, 'install'), new WorkspaceActivityGate(), {
      maxFiles: 0,
    })
    await expect(overLimit.restoreBackup(join(value.root, 'backup-2'), join(value.root, 'over-limit'))).rejects.toMatchObject({
      code: 'BACKUP_LIMIT_EXCEEDED',
    })
  })

  it('does not publish a half-restored workspace after validation failure', async () => {
    const value = fixture()
    const backup = join(value.root, 'backup')
    const target = join(value.root, 'restore-failed')
    const service = new BackupRestoreService(value.workspace, join(value.root, 'install'), new WorkspaceActivityGate())
    await service.createBackup(backup)
    const manifestPath = join(backup, 'backup_manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { workspaceId: string }
    manifest.workspaceId = 'wrong-workspace'
    writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8')

    await expect(service.restoreBackup(backup, target)).rejects.toMatchObject({ code: 'RESTORE_VALIDATION_FAILED' })
    expect(() => readdirSync(target)).toThrow()
  })
})
