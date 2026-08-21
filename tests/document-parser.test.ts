import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { DocumentIndexWorker } from '../src/main/parser/document-parser'
import { openSearchDatabase } from '../src/main/search/search-database'
import { SearchService } from '../src/main/search/search-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'

const roots: string[] = []
const workspaces: WorkspaceHandle[] = []

afterEach(() => {
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
  readonly files: ManagedFileService
  readonly search: SearchService
  readonly worker: DocumentIndexWorker
  closeSearch(): void
} {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-l06-'))
  roots.push(root)
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  workspaces.push(workspace)
  const searchDatabase = openSearchDatabase(workspace.paths)
  const files = new ManagedFileService(workspace.database.raw, workspace.paths)
  const search = new SearchService(workspace.database.raw, searchDatabase.raw, workspace.paths)
  const worker = new DocumentIndexWorker(workspace.database.raw, search, workspace.paths)
  return {
    root,
    workspace,
    files,
    search,
    worker,
    closeSearch: () => searchDatabase.close(),
  }
}

describe('L06 unified parser and sequential worker', () => {
  it('parses TXT and MD in a worker, hashes the managed object, and indexes line positions', async () => {
    const fixture = createFixture()
    try {
      const sourcePath = join(fixture.root, 'lesson.md')
      writeFileSync(sourcePath, '# 有理数\n\n第二行 x²', 'utf8')
      const imported = fixture.files.importFile(sourcePath)

      const result = await fixture.worker.enqueue(imported.id)
      expect(result.status).toBe('indexed')
      expect(result.chunkCount).toBe(2)
      expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/)
      expect(fixture.workspace.database.raw
        .prepare('SELECT content_hash, indexed_hash, index_status FROM files WHERE id = ?')
        .get(imported.id)).toMatchObject({
        index_status: 'indexed',
        content_hash: result.contentHash,
        indexed_hash: result.contentHash,
      })

      const hits = await fixture.search.search({ text: '有理数' })
      expect(hits.some((hit) => hit.fileId === imported.id && hit.position?.type === 'line')).toBe(true)
      expect(hits.find((hit) => hit.fileId === imported.id)?.path).toContain(imported.id)
    } finally {
      await fixture.worker.close()
      fixture.closeSearch()
    }
  })

  it('marks a damaged Office file parse_failed and continues with the next queued file', async () => {
    const fixture = createFixture()
    try {
      const damagedPath = join(fixture.root, 'damaged.docx')
      const validPath = join(fixture.root, 'valid.txt')
      writeFileSync(damagedPath, 'not a zip archive', 'utf8')
      writeFileSync(validPath, '后续文件仍可索引', 'utf8')
      const damaged = fixture.files.importFile(damagedPath)
      const valid = fixture.files.importFile(validPath)

      const results = await Promise.all([
        fixture.worker.enqueue(damaged.id),
        fixture.worker.enqueue(valid.id),
      ])
      expect(results[0].status).toBe('parse_failed')
      expect(results[1].status).toBe('indexed')
      expect(fixture.worker.enqueueIfNeeded(damaged.id)).toBeNull()
      expect(await fixture.search.search({ text: '后续文件' })).toEqual(expect.arrayContaining([
        expect.objectContaining({ fileId: valid.id }),
      ]))
      expect(await fixture.search.search({ text: 'not a zip' })).toEqual([])
    } finally {
      await fixture.worker.close()
      fixture.closeSearch()
    }
  })

  it('rebuilds only pending or hash-mismatched files after reopening state', async () => {
    const fixture = createFixture()
    try {
      const firstPath = join(fixture.root, 'first.txt')
      const secondPath = join(fixture.root, 'second.txt')
      writeFileSync(firstPath, 'first indexed', 'utf8')
      writeFileSync(secondPath, 'second pending', 'utf8')
      const first = fixture.files.importFile(firstPath)
      const second = fixture.files.importFile(secondPath)
      await fixture.worker.enqueue(first.id)
      const pending = await fixture.worker.rebuildPending()
      expect(pending.map((item) => item.fileId)).toEqual([second.id])
      expect(fixture.search.getIndexState(first.id).status).toBe('indexed')
      expect(fixture.search.getIndexState(second.id).status).toBe('indexed')
    } finally {
      await fixture.worker.close()
      fixture.closeSearch()
    }
  })

  it('keeps empty text files searchable as no_text without blocking later work', async () => {
    const fixture = createFixture()
    try {
      const emptyPath = join(fixture.root, 'empty.txt')
      writeFileSync(emptyPath, '', 'utf8')
      const empty = fixture.files.importFile(emptyPath)
      const result = await fixture.worker.enqueue(empty.id)
      expect(result.status).toBe('no_text')
      expect(result.chunkCount).toBe(0)
      expect(fixture.search.getIndexState(empty.id).status).toBe('no_text')
    } finally {
      await fixture.worker.close()
      fixture.closeSearch()
    }
  })
})
