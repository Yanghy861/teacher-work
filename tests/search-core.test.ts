import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { openSearchDatabase } from '../src/main/search/search-database'
import { SearchService } from '../src/main/search/search-service'
import { normalizeSearchText } from '../src/main/search/search-normalizer'
import { initializeWorkspace } from '../src/main/workspace/workspace-service'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function createDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'teacher-workbench-l05-'))
  temporaryDirectories.push(directory)
  return directory
}

function createSearchFixture(): {
  readonly workspaceRoot: string
  readonly sourceRoot: string
  readonly workspace: ReturnType<typeof initializeWorkspace>
  readonly core: CoreDataService
  readonly files: ManagedFileService
  readonly search: SearchService
  close(): void
} {
  const root = createDirectory()
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  const searchDatabase = openSearchDatabase(workspace.paths)
  const core = new CoreDataService(workspace.database.raw)
  const files = new ManagedFileService(workspace.database.raw, workspace.paths)
  const search = new SearchService(workspace.database.raw, searchDatabase.raw, workspace.paths)
  return {
    workspaceRoot: workspace.paths.root,
    sourceRoot: root,
    workspace,
    core,
    files,
    search,
    close: () => {
      searchDatabase.close()
      workspace.close()
    },
  }
}

describe('L05 search core', () => {
  it('normalizes full-width text, case, whitespace, and common math forms without changing source text', () => {
    expect(normalizeSearchText('  ＡＢＣ　x² − １  ')).toBe('abc x2 - 1')
    expect(normalizeSearchText('有理数')).toBe('有理数')
  })

  it('indexes files, node titles, notes, and body chunks with global and course-scoped search', async () => {
    const fixture = createSearchFixture()
    try {
      const course = fixture.core.nodes.createCourse('八年级数学', 'one_to_one')
      const period = fixture.core.nodes.createPeriod(course.id, '代数')
      const lesson = fixture.core.nodes.createLesson(period.id, '有理数复习')
      const student = fixture.core.createStudentForCourse(course.id, '小明')
      const note = fixture.core.createNote(student.id, '今天复习了有理数和 x²。', lesson.id)

      const sourcePath = join(fixture.sourceRoot, 'lesson-notes.txt')
      writeFileSync(sourcePath, 'placeholder')
      const imported = fixture.files.importFile(sourcePath)
      const refreshed = await fixture.files.refreshFile(imported.id)
      const linkedCopy = fixture.files.copyToLesson(imported.id, lesson.id)
      fixture.search.indexFile({
        id: linkedCopy.id,
        originalName: linkedCopy.originalName,
        contentHash: refreshed.file.contentHash,
        chunks: [
          { text: '有理数的加法与 x² 计算。', position: { type: 'page', value: 2 } },
          { text: 'English identifier ABC123 appears here.', position: { type: 'page', value: 3 } },
        ],
      })
      fixture.search.indexNode(lesson)
      fixture.search.indexNote(note)

      const chineseHits = await fixture.search.search({ text: '有理数' })
      expect(chineseHits.some((hit) => hit.fileId === linkedCopy.id && hit.source === 'body-fts')).toBe(true)
      expect(chineseHits.some((hit) => hit.sourceType === 'node' && hit.source === 'exact-title')).toBe(true)
      expect(chineseHits.some((hit) => hit.sourceType === 'note')).toBe(true)
      expect(chineseHits.find((hit) => hit.fileId === linkedCopy.id && hit.source === 'body-fts')?.position).toEqual({ type: 'page', value: 2 })
      expect(chineseHits.find((hit) => hit.sourceType === 'node')?.path).toBe('八年级数学 / 代数 / 有理数复习')
      expect(chineseHits.find((hit) => hit.sourceType === 'note')?.path).toBe('八年级数学 / 代数 / 有理数复习')

      const filenameHits = await fixture.search.search({ text: 'lesson-notes' })
      expect(filenameHits.some((hit) => hit.fileId === linkedCopy.id && hit.source === 'exact-filename')).toBe(true)

      const shortHits = await fixture.search.search({ text: '理' })
      expect(shortHits.some((hit) => hit.fileId === linkedCopy.id && hit.source === 'short-word')).toBe(true)

      const scopedHits = await fixture.search.search({ text: '有理数', scope: course.id })
      expect(scopedHits.length).toBeGreaterThan(0)
      expect(scopedHits.every((hit) => hit.fileId === linkedCopy.id || hit.sourceType === 'node' || hit.sourceType === 'note')).toBe(true)

      const specialQuery = await fixture.search.search({ text: `" OR 1=1 --` })
      expect(Array.isArray(specialQuery)).toBe(true)
      expect(chineseHits.find((hit) => hit.fileId === linkedCopy.id)?.path).toContain(linkedCopy.id)
    } finally {
      fixture.close()
    }
  })

  it('replaces old content on hash changes and keeps same-hash indexing idempotent', async () => {
      const fixture = createSearchFixture()
    try {
      const sourcePath = join(fixture.sourceRoot, 'math.md')
      writeFileSync(sourcePath, 'placeholder')
      const imported = fixture.files.importFile(sourcePath)
      const refreshed = await fixture.files.refreshFile(imported.id)

      const firstInput = {
        id: refreshed.file.id,
        originalName: refreshed.file.originalName,
        contentHash: 'hash-a',
        chunks: [{ text: '旧词 alpha', ordinal: 0 }],
        status: 'indexed' as const,
      }
      fixture.search.indexFile(firstInput)
      fixture.search.indexFile(firstInput)
      const oldHits = await fixture.search.search({ text: 'alpha' })
      expect(oldHits.filter((hit) => hit.fileId === imported.id)).toHaveLength(1)

      fixture.search.replaceFileChunks(imported.id, 'hash-b', [{ text: '新词 beta', ordinal: 0 }])
      expect(await fixture.search.search({ text: 'alpha' })).toEqual([])
      expect((await fixture.search.search({ text: 'beta' })).some((hit) => hit.fileId === imported.id)).toBe(true)
      expect(fixture.search.getIndexState(imported.id)).toEqual({ indexedHash: 'hash-b', status: 'indexed' })

      fixture.search.indexFile({
        id: imported.id,
        originalName: imported.originalName,
        contentHash: 'hash-b',
        status: 'parse_failed',
      })
      expect(fixture.search.getIndexState(imported.id)).toEqual({ indexedHash: 'hash-b', status: 'parse_failed' })
      fixture.search.removeFileFromIndex(imported.id)
      expect(fixture.search.getIndexState(imported.id)).toEqual({ indexedHash: null, status: 'pending' })
      expect(await fixture.search.search({ text: 'beta' })).toEqual([])
    } finally {
      fixture.close()
    }
  })
})
