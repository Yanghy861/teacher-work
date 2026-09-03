import { readFileSync } from 'node:fs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { orderAiEditableFiles } from '../src/renderer/lesson-prep-context'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'
import type { DraftModificationScope, DraftNoteMetadata } from '../src/shared/draft-contracts'
import type { ManagedFileRecord } from '../src/shared/file-contracts'

const roots: string[] = []
const workspaces: WorkspaceHandle[] = []

afterEach(() => {
  for (const workspace of workspaces.splice(0)) workspace.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

function fileNamed(originalName: string, mimeType = 'text/markdown'): ManagedFileRecord {
  return {
    id: `file-${originalName}`,
    originalName,
    sizeBytes: 100,
    mimeType,
    originFileId: null,
    mtimeMs: null,
    contentHash: null,
    createdAt: '2026-09-03T10:00:00.000Z',
    updatedAt: '2026-09-03T10:00:00.000Z',
    deletedAt: null,
  }
}

function modificationScope(targetName: string): DraftModificationScope {
  return {
    scopeVersion: 1,
    mode: 'single',
    baselineCount: 1,
    targetName,
    teacherRequirement: '再难一点',
  }
}

function aiMetadata(targetName?: string): DraftNoteMetadata {
  return {
    kind: 'lecture',
    promptVersion: 'v11-03-v1',
    provider: 'openai-compatible',
    model: 'fake-model',
    sources: [{ fileId: 'f-1', charsSent: 6 }],
    inputChars: 6,
    maxChars: 30_000,
    maxTokens: 16_000,
    ...(targetName === undefined ? {} : { modification: modificationScope(targetName) }),
  }
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-v17b-'))
  roots.push(root)
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  workspaces.push(workspace)
  const core = new CoreDataService(workspace.database.raw)
  const files = new ManagedFileService(workspace.database.raw, workspace.paths)
  const course = core.nodes.createCourse('V17-B 课程', 'one_to_one')
  const period = core.nodes.createPeriod(course.id, '第一阶段')
  const lesson = core.nodes.createLesson(period.id, '一次函数')
  return { core, files, lessonId: lesson.id, lessonTitle: '一次函数' }
}

describe('V17-B AI modification widening (D27)', () => {
  it('orders modification candidates with the latest version chain file first', () => {
    const v1 = fileNamed('一次函数 · 第 1 版.md')
    const v3 = fileNamed('一次函数 · 第 3 版.md')
    const v2 = fileNamed('一次函数 · 第 2 版.md')
    const external = fileNamed('思源导出讲义.md')
    const ordered = orderAiEditableFiles([v1, external, v3, v2])
    expect(ordered.map((file) => file.originalName)).toEqual([
      '一次函数 · 第 3 版.md',
      '一次函数 · 第 2 版.md',
      '一次函数 · 第 1 版.md',
      '思源导出讲义.md',
    ])
  })

  it('publishes an edited external md as 原名 · 第 N 版.md while the original stays untouched', () => {
    const { core, files, lessonId } = fixture()
    const externalPath = join(roots[roots.length - 1], '思源导出讲义.md')
    writeFileSync(externalPath, '# 外部讲义\n原稿', 'utf8')
    const imported = files.importToLesson(externalPath, lessonId)

    const note = core.createLessonDraft(lessonId, '# 外部讲义\nAI 修订稿', {
      noteKind: 'lecture',
      aiMetadata: aiMetadata('思源导出讲义.md'),
    })
    const first = files.publishLessonDraftVersion(note.id)
    expect(first.file.originalName).toBe('思源导出讲义 · 第 1 版.md')
    expect(first.version).toBe(1)

    // 第二次发布版本号沿用课次内锚定 MAX+1；原件字节不变
    const note2 = core.createLessonDraft(lessonId, '# 外部讲义\n再次修订', {
      noteKind: 'lecture',
      aiMetadata: aiMetadata('思源导出讲义.md'),
    })
    const second = files.publishLessonDraftVersion(note2.id)
    expect(second.file.originalName).toBe('思源导出讲义 · 第 2 版.md')
    expect(files.readText(imported.id).content).toBe('# 外部讲义\n原稿')
  })

  it('keeps lesson-title naming when the modification target is a version-chain file or metadata is absent', () => {
    const { core, files, lessonId, lessonTitle } = fixture()

    const versionedNote = core.createLessonDraft(lessonId, '# 修订版', {
      noteKind: 'lecture',
      aiMetadata: aiMetadata('一次函数 · 第 2 版.md'),
    })
    const versioned = files.publishLessonDraftVersion(versionedNote.id)
    expect(versioned.file.originalName).toBe(`${lessonTitle} · 第 1 版.md`)

    const plainNote = core.createLessonDraft(lessonId, '# 无修改目标', {
      noteKind: 'lecture',
      aiMetadata: aiMetadata(),
    })
    const plain = files.publishLessonDraftVersion(plainNote.id)
    expect(plain.file.originalName).toBe(`${lessonTitle} · 第 2 版.md`)
  })

  it('widens the lesson entry points and guidance copy for every markdown file', () => {
    const draftPanel = source('../src/renderer/draft-panel.tsx')
    const filesSection = source('../src/renderer/lesson-files-section.tsx')
    const context = source('../src/renderer/lesson-prep-context.ts')

    // draft-panel：单文件候选 = aiEditableCurrentFiles（全部 md，版本链优先），整课重做基线不动
    expect(draftPanel).toContain('? aiEditableCurrentFiles')
    expect(draftPanel).toContain('setLessonBaselineFileIds(nextMode === \'lesson\'')
    // lesson-files-section：“修改这份”对 md 启用；无 md 引导更新
    expect(filesSection).toContain('isAiEditableFile(selectedFile)')
    expect(filesSection).toContain('本课还没有 Markdown 课件，可先导入 md 讲义或用 AI 生成第一版课件。')
    expect(filesSection).toContain('仅支持修改 Markdown 文件；外部 Office 文档请用系统应用打开修改')
    expect(context).toContain('export function isAiEditableFile')
    expect(context).toContain('export function orderAiEditableFiles')
  })
})
