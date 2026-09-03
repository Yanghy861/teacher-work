import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { CoreDataService } from '../src/main/data/core-data-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'
import type { NoteRecord } from '../src/shared/core-contracts'

const roots: string[] = []
const workspaces: WorkspaceHandle[] = []
const sourceDirs: string[] = []

afterEach(() => {
  for (const workspace of workspaces.splice(0)) workspace.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  for (const dir of sourceDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-v17c-'))
  roots.push(root)
  const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
  workspaces.push(workspace)
  const core = new CoreDataService(workspace.database.raw)
  const files = new ManagedFileService(workspace.database.raw, workspace.paths)
  const course = core.nodes.createCourse('V17-C 课程', 'one_to_one')
  const period = core.nodes.createPeriod(course.id, '第一阶段')
  const lesson = core.nodes.createLesson(period.id, '二次函数')
  return { workspace, core, files, lessonId: lesson.id }
}

function importMarkdown(files: ManagedFileService, lessonId: string, name: string, body: string): string {
  const dir = join(tmpdir(), `v17c-src-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir)
  sourceDirs.push(dir)
  const path = join(dir, name)
  writeFileSync(path, body)
  return files.importToLesson(path, lessonId).id
}

function asManualEditNotes(notes: readonly NoteRecord[]): NoteRecord[] {
  return notes.filter((note) => note.noteKind === 'manual_edit')
}

describe('V17-C manual_edit 来源标注（D29）', () => {
  it('records a manual_edit note on each writeVersion, visible via overview notes', () => {
    const { core, files, lessonId } = fixture()
    const targetId = importMarkdown(files, lessonId, '二次函数 · 第 1 版.md', '# v1\n旧内容')

    files.writeVersion(targetId, '# v1 改\n新内容')
    files.writeVersion(targetId, '# v1 再改\n新内容 2')

    const editNotes = asManualEditNotes(core.getOverview().notes)
    expect(editNotes).toHaveLength(2)
    expect(editNotes[0]!.bodyMd).toContain('人工编辑：二次函数 · 第 1 版.md → 二次函数 · 第 2 版.md')
    expect(editNotes[1]!.bodyMd).toContain('人工编辑：二次函数 · 第 1 版.md → 二次函数 · 第 3 版.md')
    // manual_edit 不参与 AI note 语义：无 draftStatus、不进入 AI 修改结果列表（draft-view-model 要求 draftStatus !== undefined）
    expect(editNotes.every((note) => note.draftStatus === undefined)).toBe(true)
    expect(editNotes.every((note) => note.lessonId === lessonId)).toBe(true)
    // 手记/学生列表过滤（noteKind === undefined || 'manual'）同样不会误收 manual_edit
  })

  it('records （编辑版） branch notes for external md and original untouched', () => {
    const { core, files, lessonId } = fixture()
    const externalId = importMarkdown(files, lessonId, '思源导出讲义.md', '# 外部讲义\n原文')

    const written = files.writeVersion(externalId, '# 外部讲义\n编辑后')

    expect(written.file.originalName).toBe('思源导出讲义（编辑版）.md')
    const editNotes = asManualEditNotes(core.getOverview().notes)
    expect(editNotes).toHaveLength(1)
    expect(editNotes[0]!.bodyMd).toBe('人工编辑：思源导出讲义.md → 思源导出讲义（编辑版）.md')
    expect(files.readText(externalId).content).toBe('# 外部讲义\n原文')
  })

  it('keeps writeVersion succeeding even when the manual_edit note insert fails', () => {
    const { workspace, files, lessonId } = fixture()
    const targetId = importMarkdown(files, lessonId, '标注失败.md', '# 原稿')

    // 摘掉 notes 表让标注 INSERT 必败：保存本体仍必须成功（标注失败不阻塞保存）
    workspace.database.raw.exec('DROP TABLE notes')

    const written = files.writeVersion(targetId, '# 原稿\n编辑')
    expect(written.file.originalName).toBe('标注失败（编辑版）.md')
    expect(files.readText(written.file.id).content).toBe('# 原稿\n编辑')
  })
})

describe('V17-C md-editor（D28 零新依赖编辑器）', () => {
  it('keeps the editor dependency-free and wires save through files.write-version', () => {
    const editorSource = source('../src/renderer/md-editor.tsx')
    expect(editorSource).not.toContain('codemirror')
    expect(editorSource).not.toContain('monaco')
    // 保存走 files:write-version（V17-A 通道），成功后清理热草稿
    expect(editorSource).toContain("window.teacherWorkbench.files.writeVersion")
    expect(editorSource).toContain("localStorage.removeItem(draftKey)")
  })

  it('provides the D28 toolbar: headings, sub/sup, lists, quote, table, math templates, image insert, undo/redo', () => {
    const editorSource = source('../src/renderer/md-editor.tsx')
    // 标题字号（H1–H3 模板）与上下标（不引入 HTML 内联样式之外的渲染能力）
    for (const expected of ['H1 大标题', 'H2 中标题', 'H3 小标题', "'<sub>'", "'</sub>'", "'<sup>'", "'</sup>'"]) {
      expect(editorSource).toContain(expected)
    }
    // 列表/引用/表格/分隔线
    expect(editorSource).toContain("'1. '")
    expect(editorSource).toContain("'> '")
    expect(editorSource).toContain('| 列1 | 列2 |')
    expect(editorSource).toContain('---')
    // 行内/块级公式模板与光标定位
    expect(editorSource).toContain("insertTemplate('$', '$', 'a^2+b^2=c^2')")
    expect(editorSource).toContain("'$$\\n'")
    expect(editorSource).toContain('setSelectionRange')
    // 插图：本课图片 → ![名](文件名)
    expect(editorSource).toContain("candidate.mimeType.startsWith('image/')")
    expect(editorSource).toContain('insertTemplate(`![${displayBaseName(image.originalName)}](${image.originalName})`, \'\', \'\')')
    // 撤销/重做快照栈
    expect(editorSource).toContain('undoStack')
    expect(editorSource).toContain('redoStack')
    expect(editorSource).toContain('↶')
    expect(editorSource).toContain('↷')
  })

  it('covers math-high-frequency LaTeX snippets (fractions, roots, angle, triangle, degree, cases)', () => {
    const editorSource = source('../src/renderer/md-editor.tsx')
    for (const snippet of ['\\\\frac{a}{b}', '\\\\sqrt{x}', '\\\\angle A', '\\\\triangle ABC', '90^\\\\circ', '\\\\begin{cases}']) {
      expect(editorSource).toContain(snippet)
    }
    expect(editorSource).toContain('LaTeX 公式速查')
  })

  it('hot-saves to localStorage with 250ms debounce and prompts recovery on re-entry', () => {
    const editorSource = source('../src/renderer/md-editor.tsx')
    expect(editorSource).toContain('md-editor-draft:')
    expect(editorSource).toContain('250')
    // 热草稿恢复提示：恢复/丢弃
    expect(editorSource).toContain('检测到上次未保存的编辑草稿')
    expect(editorSource).toContain('恢复草稿')
    expect(editorSource).toContain('丢弃')
    // 恢复走 sessionStorage 暂存（原文与热草稿分离）
    expect(editorSource).toContain('sessionStorage')
  })

  it('renders a split preview via MarkdownDocument (KaTeX) inside the editor', () => {
    const editorSource = source('../src/renderer/md-editor.tsx')
    expect(editorSource).toContain('md-editor-split')
    expect(editorSource).toContain('<MarkdownDocument')
    expect(editorSource).toContain('md-editor-textarea')
    expect(editorSource).toContain('md-editor-preview')
  })
})

describe('V17-C 阅读器接线（lesson-material-reader / lesson-files-section）', () => {
  it('gates the edit entry on markdown + editable, and switches edit/preview per state', () => {
    const readerSource = source('../src/renderer/lesson-material-reader.tsx')
    expect(readerSource).toContain("editable && selectedFile !== null && selectedFile.mimeType === 'text/markdown'")
    expect(readerSource).toContain('aria-pressed')
    expect(readerSource).toContain('✎ 编辑')
    expect(readerSource).toContain('✓ 预览')
    expect(readerSource).toContain('<MdEditor')
    // 非编辑态才渲染 MarkdownDocument 预览
    expect(readerSource).toContain('setEditing(false)')
  })

  it('shows per-branch save notice and selects the newly written file', () => {
    const readerSource = source('../src/renderer/lesson-material-reader.tsx')
    expect(readerSource).toContain('已保存为第 ${result.version} 版')
    expect(readerSource).toContain('旧版保留在历史版本。')
    expect(readerSource).toContain('已保存为编辑版副本')
    expect(readerSource).toContain('原件未改动。')
    expect(readerSource).toContain('onSelectFile(result.file.id)')
  })

  it('surfaces manual_edit notes in the lesson history block (V17-C overview 标注)', () => {
    const sectionSource = source('../src/renderer/lesson-files-section.tsx')
    expect(sectionSource).toContain("note.noteKind === 'manual_edit'")
    expect(sectionSource).toContain('人工编辑：')
    expect(sectionSource).toContain('lesson-manual-edit-notes')
    // 保存后刷新共享 overview 与课件清单，并选中新文件
    expect(sectionSource).toContain('reloadCore')
    expect(sectionSource).toContain('setSelectedFileId(fileId)')
  })

  it('keeps manual_edit out of student-note and draft-AI-result views', () => {
    // 手记/学生列表仅收 noteKind undefined 或 'manual'；AI 修改结果要求 draftStatus !== undefined
    const studentsVmSource = source('../src/renderer/students-view-model.ts')
    expect(studentsVmSource).toContain("(note.noteKind === undefined || note.noteKind === 'manual')")
    const draftVmSource = source('../src/renderer/draft-view-model.ts')
    expect(draftVmSource).toContain('note.draftStatus !== undefined')
    const quickWizardSource = source('../src/renderer/quick-course-wizard.tsx')
    expect(quickWizardSource).toContain("(note.noteKind === undefined || note.noteKind === 'manual')")
  })
})
