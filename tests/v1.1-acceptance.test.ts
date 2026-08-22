import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { AiGateway, type AiFetch } from '../src/main/ai/ai-gateway'
import { AiSettingsService } from '../src/main/ai/ai-settings-service'
import type { SecureStoragePort } from '../src/main/ai/secure-storage'
import { CoreDataService } from '../src/main/data/core-data-service'
import { DraftService } from '../src/main/draft/draft-service'
import { ExternalLibraryService } from '../src/main/external/external-library-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { DocumentIndexWorker } from '../src/main/parser/document-parser'
import { openSearchDatabase } from '../src/main/search/search-database'
import { SearchService } from '../src/main/search/search-service'
import { SkillService } from '../src/main/skills/skill-service'
import { initializeWorkspace } from '../src/main/workspace/workspace-service'
import { listDraftInbox, listLessonAiResults } from '../src/renderer/draft-view-model'

describe('V11-05 V1.1 acceptance', () => {
  it('completes the lesson-first external-material-to-saved-results flow and survives reopen', async () => {
    const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-v11-05-'))
    const externalRoot = join(root, 'external')
    const materialRoot = join(root, 'material')
    mkdirSync(externalRoot)
    mkdirSync(materialRoot)

    const externalSources = [
      ['圆的面积讲义.docx', createDocxFixture()],
      ['圆的面积课件.pptx', createPptxFixture()],
      ['圆的面积练习.pdf', createPdfFixture()],
    ] as const
    for (const [name, contents] of externalSources) {
      writeFileSync(join(externalRoot, name), contents)
    }
    const materialPath = join(materialRoot, '上节课反馈.md')
    writeFileSync(materialPath, '# 上节课反馈\n学生需要巩固圆的面积公式。', 'utf8')

    const workspaceRoot = join(root, 'workspace')
    const installRoot = join(root, 'install')
    const workspace = initializeWorkspace(workspaceRoot, installRoot)
    const searchDatabase = openSearchDatabase(workspace.paths)
    const core = new CoreDataService(workspace.database.raw)
    const files = new ManagedFileService(workspace.database.raw, workspace.paths)
    const search = new SearchService(workspace.database.raw, searchDatabase.raw, workspace.paths)
    const worker = new DocumentIndexWorker(workspace.database.raw, search, workspace.paths)
    let workerClosed = false
    let searchClosed = false
    let workspaceClosed = false

    try {
      const course = core.nodes.createCourse('V1.1 验收课程', 'class')
      const period = core.nodes.createPeriod(course.id, '六年级上册')
      const lesson = core.nodes.createLesson(period.id, '圆的面积')

      const external = new ExternalLibraryService(workspace.database.raw)
      const registeredRoot = external.setRoot(externalRoot)
      expect(external.listChildren(registeredRoot.id, '').entries.map((entry) => entry.name))
        .toEqual(expect.arrayContaining(externalSources.map(([name]) => name)))

      const externalCopies = externalSources.map(([name]) => files.importToLesson(
        external.getFilePath(registeredRoot.id, name),
        lesson.id,
      ))
      const material = files.importFile(materialPath)
      const lessonMaterialCopy = files.copyToLesson(material.id, lesson.id)
      const lessonFiles = [...externalCopies, lessonMaterialCopy]

      expect(new Set(files.getOverview().links
        .filter((link) => link.targetType === 'lesson' && link.targetId === lesson.id)
        .map((link) => link.fileId)))
        .toEqual(new Set(lessonFiles.map((file) => file.id)))
      expect(lessonMaterialCopy.id).not.toBe(material.id)

      const indexResults = await Promise.all(lessonFiles.map((file) => worker.enqueue(file.id)))
      expect(indexResults.map((result) => result.status)).toEqual([
        'indexed',
        'indexed',
        'indexed',
        'indexed',
      ])
      expect((await search.search({ text: '圆的面积' })).length).toBeGreaterThan(0)

      let encryptedKey: Buffer | undefined
      const secureStorage: SecureStoragePort = {
        isAvailable: () => true,
        encrypt: (value) => Buffer.from(`cipher:${value}`, 'utf8'),
        decrypt: (value) => value.toString('utf8').slice('cipher:'.length),
        read: () => encryptedKey,
        write: (value) => { encryptedKey = value },
        clear: () => { encryptedKey = undefined },
      }
      const settings = new AiSettingsService(workspace.database.raw, { secureStorage })
      settings.updateSettings({
        provider: 'openai-compatible',
        model: 'v11-05-fake-model',
        endpoint: 'https://fake.local/v1',
        apiKey: 'V11_05_SESSION_KEY',
      })
      const prompts: string[] = []
      let generation = 0
      const fetcher: AiFetch = async (_url, init) => {
        const body = JSON.parse(init.body) as { messages: Array<{ content: string }> }
        prompts.push(body.messages[0]?.content ?? '')
        const text = `# V1.1 生成结果 ${++generation}\n\n可编辑正文。`
        return {
          ok: true,
          status: 200,
          json: async () => ({ model: 'v11-05-fake-model', choices: [{ message: { content: text } }] }),
          text: async () => text,
        }
      }
      const skills = new SkillService(workspace.database.raw)
      const skill = skills.createSkill('V1.1 验收 Skill', '优先使用例题，并提醒常见错误。')
      const drafts = new DraftService(
        core,
        search,
        new AiGateway(settings, { fetch: fetcher }),
        settings,
        skills,
      )
      const generationBase = {
        lessonId: lesson.id,
        sources: lessonFiles.map((file) => ({ fileId: file.id })),
        maxChars: 12_000,
        maxTokens: 2_000,
      } as const

      const lecture = await drafts.generate({
        ...generationBase,
        requestId: 'v11-05-lecture',
        kind: 'lecture',
        skillId: skill.id,
        requirement: '本次少讲理论，多安排基础题。',
      })
      core.updateNote(lecture.noteId, '# 老师修改后的讲义')
      const savedLecture = drafts.saveToLesson({ noteId: lecture.noteId })
      expect(savedLecture).toMatchObject({
        id: lecture.noteId,
        bodyMd: '# 老师修改后的讲义',
        draftStatus: 'saved',
      })

      const regenerated = await drafts.regenerate({
        requestId: 'v11-05-regenerated',
        noteId: savedLecture.id,
      })
      const example = await drafts.generate({
        ...generationBase,
        requestId: 'v11-05-example',
        kind: 'example',
        skillId: skill.id,
      })
      const homework = await drafts.generate({
        ...generationBase,
        requestId: 'v11-05-homework',
        kind: 'homework',
        requirement: '作业控制在基础巩固范围。',
      })
      drafts.saveToLesson({ noteId: example.noteId })
      drafts.saveToLesson({ noteId: homework.noteId })

      expect(prompts[0]).toContain('优先使用例题，并提醒常见错误。')
      expect(prompts[0]).toContain('本次少讲理论，多安排基础题。')
      expect(prompts.every((prompt) => prompt.includes('圆的面积'))).toBe(true)

      const overview = core.getOverview()
      expect(listDraftInbox(overview).map((entry) => entry.note.id)).toEqual([regenerated.noteId])
      expect(listLessonAiResults(overview, lesson.id)).toHaveLength(4)
      expect(core.getActiveAiResult(savedLecture.id)).toMatchObject({ draftStatus: 'saved' })
      expect(core.getActiveAiResult(regenerated.noteId)).toMatchObject({ draftStatus: 'draft' })

      for (const [name, contents] of externalSources) {
        expect(readFileSync(join(externalRoot, name))).toEqual(contents)
      }
      expect(readFileSync(files.getObjectContentPath(material.id), 'utf8'))
        .toBe('# 上节课反馈\n学生需要巩固圆的面积公式。')

      await worker.close()
      workerClosed = true
      searchDatabase.close()
      searchClosed = true
      workspace.close()
      workspaceClosed = true

      const reopened = initializeWorkspace(workspaceRoot, installRoot)
      try {
        const reopenedCore = new CoreDataService(reopened.database.raw)
        expect(reopened.identity.schemaVersion).toBe(11)
        expect(listDraftInbox(reopenedCore.getOverview()).map((entry) => entry.note.id))
          .toEqual([regenerated.noteId])
        expect(listLessonAiResults(reopenedCore.getOverview(), lesson.id)).toHaveLength(4)
        expect(reopenedCore.getActiveAiResult(savedLecture.id)).toMatchObject({
          bodyMd: '# 老师修改后的讲义',
          draftStatus: 'saved',
        })
      } finally {
        reopened.close()
      }
    } finally {
      if (!workerClosed) await worker.close()
      if (!searchClosed) searchDatabase.close()
      if (!workspaceClosed) workspace.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})

function createZipFixture(entries: Record<string, string>): Buffer {
  return Buffer.from(zipSync(Object.fromEntries(
    Object.entries(entries).map(([name, content]) => [name, strToU8(content)]),
  )))
}

function officeContentTypes(mainPart: string, contentType: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/${mainPart}" ContentType="${contentType}"/>
</Types>`
}

function packageRelationships(target: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${target}"/>
</Relationships>`
}

function createDocxFixture(): Buffer {
  return createZipFixture({
    '[Content_Types].xml': officeContentTypes(
      'word/document.xml',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    ),
    '_rels/.rels': packageRelationships('word/document.xml'),
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>V11 圆的面积 DOCX 验收资料</w:t></w:r></w:p><w:sectPr/></w:body>
</w:document>`,
  })
}

function createPptxFixture(): Buffer {
  return createZipFixture({
    '[Content_Types].xml': officeContentTypes(
      'ppt/presentation.xml',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
    ),
    '_rels/.rels': packageRelationships('ppt/presentation.xml'),
    'ppt/presentation.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
</p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
    'ppt/slides/slide1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN"/><a:t>V11 圆的面积 PPTX 验收资料</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`,
  })
}

function createPdfFixture(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length 51 >>\nstream\nBT /F1 24 Tf 72 720 Td (V11 PDF acceptance) Tj ET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, 'binary'))
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(pdf, 'binary')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'binary')
}
