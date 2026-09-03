import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { dispatchFileIpc, type FileIpcDependencies } from '../src/main/ipc/file-ipc'
import { openSearchDatabase } from '../src/main/search/search-database'
import { SearchService } from '../src/main/search/search-service'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'
import { FILE_IPC_CHANNELS, IPC_ERROR_CODES } from '../src/shared/ipc-contracts'
import type { IpcLogger } from '../src/main/ipc/app-ipc'

const roots: string[] = []
const workspaces: WorkspaceHandle[] = []
const searchDatabases: Array<{ close(): void }> = []

afterEach(() => {
  for (const database of searchDatabases.splice(0)) database.close()
  for (const workspace of workspaces.splice(0)) workspace.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-v17a-write-'))
  roots.push(root)
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  workspaces.push(workspace)
  const searchDb = openSearchDatabase(workspace.paths)
  searchDatabases.push(searchDb)
  const core = new CoreDataService(workspace.database.raw)
  const files = new ManagedFileService(workspace.database.raw, workspace.paths)
  const search = new SearchService(workspace.database.raw, searchDb.raw, workspace.paths)
  const course = core.nodes.createCourse('V17-A 课程', 'one_to_one')
  const period = core.nodes.createPeriod(course.id, '第一阶段')
  const lesson = core.nodes.createLesson(period.id, '一次函数')
  return { workspace, core, files, search, root, lessonId: lesson.id }
}

function importLessonMarkdown(files: ManagedFileService, lessonId: string, name: string, body: string): string {
  const source = writeFixtureFile(name, body)
  return files.importToLesson(source, lessonId).id
}

const fixtureDirs: string[] = []
function writeFixtureFile(name: string, body: string | Buffer): string {
  const dir = join(tmpdir(), `v17a-src-${randomUUID()}`)
  mkdirSync(dir)
  fixtureDirs.push(dir)
  const source = join(dir, name)
  writeFileSync(source, body)
  return source
}

afterEach(() => {
  for (const dir of fixtureDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

class TestLogger implements IpcLogger {
  log(): void {}
  error(): void {}
}

describe('V17-A files:write-version service', () => {
  it('extends a version chain: next number anchored to the lesson-wide max', () => {
    const { files, lessonId } = fixture()
    const firstId = importLessonMarkdown(files, lessonId, '函数 · 第 1 版.md', '# v1\n旧内容')
    const first = files.writeVersion(firstId, '# v1 改\n新内容')
    expect(first.file.originalName).toBe('函数 · 第 2 版.md')
    expect(first.version).toBe(2)

    const second = files.writeVersion(first.file.id, '# v2 改\n再改')
    expect(second.file.originalName).toBe('函数 · 第 3 版.md')
    expect(second.version).toBe(3)

    // 版本号沿用发布锚定语义：编辑旧版本不会重号，而是跳到课次内 MAX+1
    const third = files.writeVersion(firstId, '# 从第 1 版再改')
    expect(third.file.originalName).toBe('函数 · 第 4 版.md')
    expect(files.readText(firstId).content).toBe('# v1\n旧内容')
  })

  it('creates an （编辑版） copy for a non-chain external md, original untouched', () => {
    const { files, lessonId } = fixture()
    const targetId = importLessonMarkdown(files, lessonId, '思源导出讲义.md', '# 外部讲义\n原文')
    const written = files.writeVersion(targetId, '# 外部讲义\n编辑后')
    expect(written.file.originalName).toBe('思源导出讲义（编辑版）.md')
    expect(written.version).toBe(1)
    expect(written.file.mimeType).toBe('text/markdown')

    const targetPath = files.getObjectContentPath(targetId)
    expect(readFileSync(targetPath, 'utf8')).toBe('# 外部讲义\n原文')
    expect(files.readText(written.file.id).content).toBe('# 外部讲义\n编辑后')
  })

  it('writes atomically: registered content only, no tmp leftovers', () => {
    const { files, workspace, lessonId } = fixture()
    const targetId = importLessonMarkdown(files, lessonId, '原子写.md', '# 原子')
    const written = files.writeVersion(targetId, '# 原子\n编辑')
    const objectDirectory = join(workspace.paths.objectsDirectory, written.file.id)
    expect(readdirSync(objectDirectory)).toEqual(['content'])
    expect(readFileSync(join(objectDirectory, 'content'), 'utf8')).toBe('# 原子\n编辑')
  })

  it('rejects non-markdown, non-lesson and empty targets without writing anything', () => {
    const { files, lessonId } = fixture()
    const txtId = importLessonMarkdown(files, lessonId, '笔记.txt', 'text body')
    expect(() => files.writeVersion(txtId, 'x')).toThrow('只能编辑 Markdown 文件')

    const source = writeFixtureFile('游离.md', '# 无课次')
    const orphanId = files.importFile(source).id
    expect(() => files.writeVersion(orphanId, '# 改')).toThrow('未挂接课次')

    const mdId = importLessonMarkdown(files, lessonId, '空白.md', '# 空白')
    expect(() => files.writeVersion(mdId, '   ')).toThrow('保存内容不能为空')
    expect(files.getOverview().files).toHaveLength(3)
  })
})

function dispatchDependencies(files: ManagedFileService, events: unknown[], indexed: string[]): FileIpcDependencies {
  return {
    getFileService: () => files,
    enqueueIndex: (fileId) => indexed.push(fileId),
    removeFromIndex: () => undefined,
    chooseSourcePath: async () => null,
    openPath: async () => '',
    showInFolder: () => undefined,
    notifyContentChanged: (event) => events.push(event),
  }
}

describe('V17-A files:read-text / files:write-version IPC dispatch', () => {
  it('read-text returns raw text only for text/* managed files', async () => {
    const { files, lessonId } = fixture()
    const mdId = importLessonMarkdown(files, lessonId, '课件.md', '# 课件\n$a^2+b^2=c^2$')
    const logger = new TestLogger()
    const dependencies = dispatchDependencies(files, [], [])

    const ok = await dispatchFileIpc(FILE_IPC_CHANNELS.readText, { fileId: mdId }, dependencies, logger)
    expect(ok).toMatchObject({ ok: true, data: { content: '# 课件\n$a^2+b^2=c^2$' } })

    const source = writeFixtureFile('图.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const imageId = files.importToLesson(source, lessonId).id
    const rejected = await dispatchFileIpc(FILE_IPC_CHANNELS.readText, { fileId: imageId }, dependencies, logger)
    expect(rejected).toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.MANAGED_FILE_ERROR } })

    const invalid = await dispatchFileIpc(FILE_IPC_CHANNELS.readText, { fileId: mdId, extra: 1 }, dependencies, logger)
    expect(invalid).toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })
  })

  it('write-version dispatch enqueues index, emits contentChanged, and never rewrites the target', async () => {
    const { files, lessonId, search } = fixture()
    const targetId = importLessonMarkdown(files, lessonId, '讲义 · 第 1 版.md', '# 讲义 v1')
    const events: unknown[] = []
    const indexed: string[] = []
    const logger = new TestLogger()
    const dependencies = dispatchDependencies(files, events, indexed)

    const response = (await dispatchFileIpc(
      FILE_IPC_CHANNELS.writeVersion,
      { fileId: targetId, bodyMd: '# 讲义 v1\n人工改正', summary: '改了公式' },
      dependencies,
      logger,
    )) as { data: { file: { id: string; originalName: string }; version: number } }
    expect(response).toMatchObject({ ok: true, data: { version: 2, file: { originalName: '讲义 · 第 2 版.md' } } })
    const newFileId = response.data.file.id
    expect(indexed).toEqual([newFileId])
    expect(events).toEqual([
      expect.objectContaining({ fileId: newFileId, contentChanged: true, file: expect.objectContaining({ id: newFileId }) }),
    ])

    // 目标原件字节不变；新文件走既有 SearchService.indexFile 入索引
    expect(files.readText(targetId).content).toBe('# 讲义 v1')
    search.indexFile({
      id: newFileId,
      originalName: '讲义 · 第 2 版.md',
      contentHash: 'v17a-hash',
      status: 'indexed',
      chunks: [{ text: '人工改正' }],
    })
    const lessonFiles = files.getOverview({ includeDeleted: false }).links.filter((link) => link.targetId === lessonId)
    expect(lessonFiles).toHaveLength(2)

    const badPayload = await dispatchFileIpc(
      FILE_IPC_CHANNELS.writeVersion,
      { fileId: targetId },
      dependencies,
      logger,
    )
    expect(badPayload).toMatchObject({ ok: false, error: { code: IPC_ERROR_CODES.INVALID_PAYLOAD } })
  })

  it('keeps a mineru_ready original untouched while the edited copy indexes normally', async () => {
    const { files, lessonId, search, workspace } = fixture()
    const targetId = importLessonMarkdown(files, lessonId, '增强解析稿.md', '# 增强稿')
    workspace.database.raw
      .prepare("UPDATE files SET index_status = 'mineru_ready', indexed_hash = 'mineru-hash' WHERE id = ?")
      .run(targetId)

    const logger = new TestLogger()
    const written = await dispatchFileIpc(
      FILE_IPC_CHANNELS.writeVersion,
      { fileId: targetId, bodyMd: '# 增强稿\n人工编辑' },
      dispatchDependencies(files, [], []),
      logger,
    )
    expect(written).toMatchObject({ ok: true })
    const writtenFileId = (written as { data: { file: { id: string } } }).data.file.id

    const statusRow = (fileId: string) =>
      workspace.database.raw
        .prepare('SELECT index_status, indexed_hash FROM files WHERE id = ?')
        .get(fileId) as { index_status: string; indexed_hash: string | null }
    expect(statusRow(targetId)).toEqual({ index_status: 'mineru_ready', indexed_hash: 'mineru-hash' })

    const writtenStatus = statusRow(writtenFileId)
    expect(['pending', 'indexed']).toContain(writtenStatus.index_status)
    expect(writtenStatus.indexed_hash).toBeNull()
    search.indexFile({
      id: writtenFileId,
      originalName: '增强解析稿（编辑版）.md',
      contentHash: 'edit-hash',
      status: 'indexed',
      chunks: [{ text: '人工编辑' }],
    })
    expect(statusRow(writtenFileId).index_status).toBe('indexed')
  })
})

afterEach(() => {
  for (const dir of fixtureDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
