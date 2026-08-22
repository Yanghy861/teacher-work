import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  ExternalLibraryService,
} from '../src/main/external/external-library-service'
import {
  initializeWorkspace,
  type WorkspaceHandle,
} from '../src/main/workspace/workspace-service'

const temporaryRoots: string[] = []
const workspaces: WorkspaceHandle[] = []

afterEach(() => {
  for (const workspace of workspaces.splice(0)) workspace.close()
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function createFixture(): {
  readonly fixtureRoot: string
  readonly libraryRoot: string
  readonly workspace: WorkspaceHandle
  readonly service: ExternalLibraryService
} {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'teacher-workbench-v11-external-'))
  temporaryRoots.push(fixtureRoot)
  const libraryRoot = join(fixtureRoot, '公共资料')
  mkdirSync(join(libraryRoot, '六年级上册', '第一单元'), { recursive: true })
  writeFileSync(join(libraryRoot, '说明.md'), '# 资料说明', 'utf8')
  writeFileSync(join(libraryRoot, '六年级上册', '第一单元', '圆的面积.docx'), 'docx fixture')
  const workspace = initializeWorkspace(
    join(fixtureRoot, 'workspace'),
    join(fixtureRoot, 'install'),
  )
  workspaces.push(workspace)
  return {
    fixtureRoot,
    libraryRoot,
    workspace,
    service: new ExternalLibraryService(workspace.database.raw, {
      idFactory: () => 'external-root-1',
      now: () => '2026-08-22T08:00:00.000Z',
    }),
  }
}

describe('V11-01 external library service', () => {
  it('persists one root without exposing its absolute path', () => {
    const { libraryRoot, workspace, service } = createFixture()

    const selected = service.setRoot(libraryRoot)
    expect(selected).toEqual({
      id: 'external-root-1',
      name: '公共资料',
      available: true,
      createdAt: '2026-08-22T08:00:00.000Z',
      updatedAt: '2026-08-22T08:00:00.000Z',
    })
    expect(JSON.stringify(selected)).not.toContain(libraryRoot)

    const reopenedService = new ExternalLibraryService(workspace.database.raw)
    expect(reopenedService.getRoot()).toEqual(selected)
  })

  it('reads one directory at a time and reflects manual refreshes', () => {
    const { libraryRoot, service } = createFixture()
    const root = service.setRoot(libraryRoot)

    const topLevel = service.listChildren(root.id, '')
    expect(topLevel.entries.map((entry) => [entry.name, entry.kind])).toEqual([
      ['六年级上册', 'folder'],
      ['说明.md', 'file'],
    ])
    expect(topLevel.entries.some((entry) => entry.name === '第一单元')).toBe(false)

    const gradeFolder = service.listChildren(root.id, '六年级上册')
    expect(gradeFolder.entries.map((entry) => entry.name)).toEqual(['第一单元'])

    writeFileSync(join(libraryRoot, '新加入.pdf'), 'new file')
    expect(service.listChildren(root.id, '').entries.map((entry) => entry.name)).toContain('新加入.pdf')
  })

  it('replaces the configured root and invalidates stale root IDs', () => {
    const { fixtureRoot, libraryRoot, workspace, service } = createFixture()
    const first = service.setRoot(libraryRoot)
    const secondRoot = join(fixtureRoot, '竞赛资料')
    mkdirSync(secondRoot)
    const replacement = new ExternalLibraryService(workspace.database.raw, {
      idFactory: () => 'external-root-2',
      now: () => '2026-08-22T09:00:00.000Z',
    })

    expect(replacement.setRoot(secondRoot).id).toBe('external-root-2')
    expect(() => replacement.listChildren(first.id, '')).toThrowError(
      expect.objectContaining({ code: 'EXTERNAL_ROOT_NOT_CONFIGURED' }),
    )
  })

  it('rejects absolute paths, traversal, folders passed as files, and missing files', () => {
    const { libraryRoot, service } = createFixture()
    const root = service.setRoot(libraryRoot)

    expect(() => service.listChildren(root.id, '..')).toThrowError(
      expect.objectContaining({ code: 'EXTERNAL_PATH_INVALID' }),
    )
    expect(() => service.listChildren(root.id, join(libraryRoot, '六年级上册'))).toThrowError(
      expect.objectContaining({ code: 'EXTERNAL_PATH_INVALID' }),
    )
    expect(() => service.getFilePath(root.id, '六年级上册')).toThrowError(
      expect.objectContaining({ code: 'EXTERNAL_ENTRY_NOT_FILE' }),
    )
    expect(() => service.getFilePath(root.id, '不存在.pdf')).toThrowError(
      expect.objectContaining({ code: 'EXTERNAL_ENTRY_NOT_FOUND' }),
    )

    const filePath = service.getFilePath(root.id, '说明.md')
    expect(isAbsolute(filePath)).toBe(true)
  })

  it('does not expose a link or junction that escapes the selected root', () => {
    const { fixtureRoot, libraryRoot, service } = createFixture()
    const outsideRoot = join(fixtureRoot, '外部目录')
    mkdirSync(outsideRoot)
    writeFileSync(join(outsideRoot, '秘密.txt'), 'outside')
    const linkPath = join(libraryRoot, '越界链接')
    symlinkSync(outsideRoot, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
    const root = service.setRoot(libraryRoot)

    expect(service.listChildren(root.id, '').entries.map((entry) => entry.name)).not.toContain('越界链接')
    expect(() => service.listChildren(root.id, '越界链接')).toThrowError(
      expect.objectContaining({ code: 'EXTERNAL_PATH_OUTSIDE_ROOT' }),
    )
  })
})
