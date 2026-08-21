import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { DocumentIndexWorker } from '../src/main/parser/document-parser'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { openSearchDatabase, type SearchDatabase } from '../src/main/search/search-database'
import { SearchService } from '../src/main/search/search-service'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'

const roots: string[] = []
const workspaces: WorkspaceHandle[] = []

afterEach(async () => {
  for (const workspace of workspaces.splice(0)) {
    workspace.close()
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})
function createFixture(): {
  readonly root: string
  readonly workspace: WorkspaceHandle
  readonly core: CoreDataService
  readonly files: ManagedFileService
  readonly searchDb: SearchDatabase
  readonly search: SearchService
  readonly worker: DocumentIndexWorker
} {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-l07-'))
  roots.push(root)
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  workspaces.push(workspace)
  const searchDb = openSearchDatabase(workspace.paths)
  const core = new CoreDataService(workspace.database.raw)
  const files = new ManagedFileService(workspace.database.raw, workspace.paths)
  const search = new SearchService(workspace.database.raw, searchDb.raw, workspace.paths)
  const worker = new DocumentIndexWorker(workspace.database.raw, search, workspace.paths)
  return { root, workspace, core, files, searchDb, search, worker }
}

describe('L07 phase 2 acceptance', () => {
  it('restores file, node, and note search after deleting and rebuilding the derived search database', async () => {
    const fixture = createFixture()
    try {
      const course = fixture.core.nodes.createCourse('函数专题', 'one_to_one')
      const period = fixture.core.nodes.createPeriod(course.id, '代数')
      const lesson = fixture.core.nodes.createLesson(period.id, '函数图像')
      const student = fixture.core.createStudentForCourse(course.id, '小周')
      const note = fixture.core.createNote(student.id, '本节课复习函数图像。', lesson.id)
      const sourcePath = join(fixture.root, 'function.txt')
      writeFileSync(sourcePath, '函数图像的新词', 'utf8')
      const imported = fixture.files.importFile(sourcePath)
      await fixture.worker.enqueue(imported.id)
      fixture.search.indexNode(lesson)
      fixture.search.indexNote(note)

      expect((await fixture.search.search({ text: '新词' })).some((hit) => hit.fileId === imported.id)).toBe(true)
      expect((await fixture.search.search({ text: '函数图像' })).length).toBeGreaterThanOrEqual(2)

      fixture.search.clearDerivedIndex()
      expect(await fixture.search.search({ text: '新词' })).toEqual([])
      expect(await fixture.search.search({ text: '函数图像' })).toEqual([])

      fixture.search.rebuildCoreSources()
      const rebuiltFiles = await fixture.worker.rebuildPending()
      expect(rebuiltFiles).toHaveLength(1)
      expect((await fixture.search.search({ text: '新词' })).some((hit) => hit.fileId === imported.id)).toBe(true)
      expect((await fixture.search.search({ text: '函数图像' })).some((hit) => hit.sourceType === 'note')).toBe(true)
    } finally {
      await fixture.worker.close()
      fixture.searchDb.close()
    }
  })
})
