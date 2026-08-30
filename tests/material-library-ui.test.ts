import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { ManagedFileOverview, ManagedFileRecord } from '../src/shared/file-contracts'
import {
  filterMaterialLibraryFiles,
  listRemovedMaterialFiles,
  listReusableMaterialFiles,
} from '../src/renderer/material-library'

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

function file(id: string, originalName: string, mimeType: string, deletedAt: string | null = null): ManagedFileRecord {
  return {
    id,
    originalName,
    sizeBytes: 10,
    mimeType,
    originFileId: null,
    mtimeMs: null,
    contentHash: null,
    createdAt: `2026-08-30T00:00:0${id}Z`,
    updatedAt: `2026-08-30T00:00:0${id}Z`,
    deletedAt,
  }
}

describe('material library curation and lesson removal UI', () => {
  it('keeps only standalone reusable files in the material library', () => {
    const overview: ManagedFileOverview = {
      files: [
        file('1', '讲义.md', 'text/markdown'),
        file('2', '本课副本.md', 'text/markdown'),
        file('3', '学生附件.pdf', 'application/pdf'),
        file('4', '旧素材.md', 'text/markdown', '2026-08-30T00:00:00Z'),
        file('5', '已移除课次副本.md', 'text/markdown', '2026-08-30T00:00:00Z'),
      ],
      links: [
        { fileId: '2', targetType: 'lesson', targetId: 'lesson-1', createdAt: '2026-08-30T00:00:00Z' },
        { fileId: '3', targetType: 'student', targetId: 'student-1', createdAt: '2026-08-30T00:00:00Z' },
        { fileId: '5', targetType: 'lesson', targetId: 'lesson-1', createdAt: '2026-08-30T00:00:00Z' },
      ],
    }

    expect(listReusableMaterialFiles(overview).map((item) => item.id)).toEqual(['1'])
    expect(listRemovedMaterialFiles(overview).map((item) => item.id)).toEqual(['4'])
  })

  it('supports the shallow directory filters without changing file ownership', () => {
    const files = [
      file('1', '讲义.md', 'text/markdown'),
      file('2', '示意图.png', 'image/png'),
      file('3', '压缩包.zip', 'application/zip'),
    ]
    expect(filterMaterialLibraryFiles(files, 'documents', '').map((item) => item.id)).toEqual(['1'])
    expect(filterMaterialLibraryFiles(files, 'images', '').map((item) => item.id)).toEqual(['2'])
    expect(filterMaterialLibraryFiles(files, 'other', '').map((item) => item.id)).toEqual(['3'])
    expect(filterMaterialLibraryFiles(files, 'all', '示意').map((item) => item.id)).toEqual(['2'])
  })

  it('exposes a scoped remove action in the current lesson reader', () => {
    const section = source('../src/renderer/lesson-files-section.tsx')
    const reader = source('../src/renderer/lesson-material-reader.tsx')
    const managed = source('../src/renderer/managed-files-panel.tsx')
    const dialogs = source('../src/renderer/app-confirm-dialog.tsx')
    expect(section).toContain('从本课移除')
    expect(section).toContain('不会影响素材库原件或外部资料')
    expect(section).toContain("title: '从本课移除资料？'")
    expect(section).not.toContain('window.confirm')
    expect(dialogs).toContain('export function AppDialogProvider')
    expect(reader).toContain('onRemoveFile?: (fileId: string) => void')
    expect(reader).toContain('onRemoveFile(selectedFile.id)')
    expect(managed).toContain('listReusableMaterialFiles')
    expect(managed).toContain('已经加入课程或学生的独立副本不会自动出现在这里')
  })
})
