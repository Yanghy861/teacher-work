import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MaterialLibraryError, MaterialLibraryService } from '../src/main/files/material-library-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'

const fixtures: Array<{ root: string; workspace: WorkspaceHandle }> = []
afterEach(() => { for (const fixture of fixtures.splice(0)) { fixture.workspace.close(); rmSync(fixture.root, { recursive: true, force: true }) } })

function fixture(): { root: string; workspace: WorkspaceHandle; library: MaterialLibraryService; files: ManagedFileService } {
  const root = mkdtempSync(join(tmpdir(), 'teacher-material-'))
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  const files = new ManagedFileService(workspace.database.raw, workspace.paths)
  const library = new MaterialLibraryService(workspace.database.raw, files)
  fixtures.push({ root, workspace })
  return { root, workspace, library, files }
}

describe('material library logical folders', () => {
  it('migrates standalone files into the virtual unfiled entry and keeps lesson copies out', () => {
    const item = fixture()
    const sourcePath = join(item.root, 'source.txt'); writeFileSync(sourcePath, 'hello')
    const standalone = item.files.importFile(sourcePath)
    const overview = item.library.getOverview()
    expect(overview.items.find((entry) => entry.fileId === standalone.id)?.folderId).toBeNull()
    expect(overview.files.map((file) => file.id)).toContain(standalone.id)
  })

  it('creates nested folders, moves files and refuses non-empty deletion', () => {
    const item = fixture()
    const root = item.library.createFolder({ parentId: null, name: '七年级' })
    const child = item.library.createFolder({ parentId: root.id, name: '三角形' })
    const sourcePath = join(item.root, 'triangle.txt'); writeFileSync(sourcePath, 'triangle')
    const file = item.files.importFile(sourcePath)
    item.library.moveFile(file.id, child.id)
    expect(item.library.getOverview().items.find((entry) => entry.fileId === file.id)?.folderId).toBe(child.id)
    expect(() => item.library.deleteFolder(root.id)).toThrowError(MaterialLibraryError)
    item.library.moveFile(file.id, null)
    item.library.deleteFolder(child.id)
    item.library.deleteFolder(root.id)
  })
})
