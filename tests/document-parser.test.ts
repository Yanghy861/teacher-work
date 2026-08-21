import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { strToU8, zipSync } from 'fflate'
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
  <w:body><w:p><w:r><w:t>DOCX managed smoke 有理数 x²</w:t></w:r></w:p><w:sectPr/></w:body>
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
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN"/><a:t>PPTX managed smoke 有理数 x²</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`,
  })
}

function createXlsxFixture(): Buffer {
  return createZipFixture({
    '[Content_Types].xml': officeContentTypes(
      'xl/workbook.xml',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
    ),
    '_rels/.rels': packageRelationships('xl/workbook.xml'),
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>XLSX managed smoke 有理数 x²</t></is></c></row></sheetData>
</worksheet>`,
  })
}

function createPdfFixture(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length 46 >>\nstream\nBT /F1 24 Tf 72 720 Td (PDF managed smoke) Tj ET\nendstream',
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

  it('passes original extensions for extensionless managed Office/PDF objects', async () => {
    const fixture = createFixture()
    try {
      const sources = [
        ['managed.docx', createDocxFixture()],
        ['managed.pptx', createPptxFixture()],
        ['managed.pdf', createPdfFixture()],
        ['managed.xlsx', createXlsxFixture()],
      ] as const
      const imported = sources.map(([name, content]) => {
        const sourcePath = join(fixture.root, name)
        writeFileSync(sourcePath, content)
        return fixture.files.importFile(sourcePath)
      })

      for (const record of imported) {
        expect(fixture.files.getObjectContentPath(record.id)).toMatch(/[\\/]content$/u)
      }
      const results = await Promise.all(imported.map((record) => fixture.worker.enqueue(record.id)))
      expect(results.map((result) => result.status)).toEqual(['indexed', 'indexed', 'indexed', 'indexed'])
      expect(results.every((result) => result.chunkCount > 0)).toBe(true)
      const hits = await fixture.search.search({ text: '有理数' })
      expect(new Set(hits.map((hit) => hit.fileId))).toEqual(new Set([imported[0].id, imported[1].id, imported[3].id]))
    } finally {
      await fixture.worker.close()
      fixture.closeSearch()
    }
  })
})
