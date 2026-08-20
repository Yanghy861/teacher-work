import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parse } from './officeparser-adapter.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function option(args, name) {
  const index = args.indexOf(name)
  if (index === -1) {
    return undefined
  }
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`missing value for ${name}`)
  }
  return value
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(value) {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value, 0)
  return buffer
}

function u32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0, 0)
  return buffer
}

function storedZip(entries) {
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name, 'utf8')
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8')
    const checksum = crc32(data)
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ])
    localParts.push(local)
    centralParts.push(Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]))
    offset += local.length
  }

  const localData = Buffer.concat(localParts)
  const centralData = Buffer.concat(centralParts)
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralData.length),
    u32(localData.length),
    u16(0),
  ])
  return Buffer.concat([localData, centralData, end])
}

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>fixture</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`

function makePdfWithJavaScript() {
  const header = Buffer.from('%PDF-1.7\n%\xff\xff\xff\xff\n', 'binary')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /OpenAction 5 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>',
    '<< /Length 0 >>\nstream\n\nendstream',
    '<< /Type /Action /S /JavaScript /JS (globalThis.__officeParserPdfProbe = true) >>',
  ]
  const parts = [header]
  const offsets = [0]
  let length = header.length
  for (const [index, body] of objects.entries()) {
    offsets.push(length)
    const part = Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`, 'utf8')
    parts.push(part)
    length += part.length
  }
  const xrefOffset = length
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join('')
  parts.push(Buffer.from(xref, 'utf8'))
  return Buffer.concat(parts)
}

async function writeReport(report, output) {
  const serialized = JSON.stringify(report, null, 2) + '\n'
  if (output === undefined) {
    process.stdout.write(serialized)
    return
  }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, serialized, 'utf8')
  console.log(`wrote_fixture_probe ${report.schemaVersion}`)
}

async function main() {
  const args = process.argv.slice(2)
  const output = option(args, '--output')
  const fixtureDirectory = output === undefined
    ? resolve(repoRoot, 'tmp', 'document-parser-fixture-probe')
    : resolve(dirname(output), 'fixtures')
  await mkdir(fixtureDirectory, { recursive: true })

  const validZip = storedZip([
    ['[Content_Types].xml', contentTypes],
    ['word/document.xml', documentXml],
  ])
  const fixtures = [
    {
      id: 'non-zip-fake-docx',
      fileName: 'non-zip-fake.docx',
      bytes: Buffer.from('this is not an OOXML ZIP archive\n', 'utf8'),
      expectedErrorCode: 'ZIP_NO_ENTRIES_FOUND',
    },
    {
      id: 'truncated-ooxml',
      fileName: 'truncated-ooxml.docx',
      bytes: validZip.subarray(0, validZip.length - 12),
      expectedErrorCode: 'ZIP_TRUNCATED',
    },
    {
      id: 'zip-missing-required-part',
      fileName: 'missing-required-part.docx',
      bytes: storedZip([['[Content_Types].xml', contentTypes]]),
      expectedErrorCode: 'REQUIRED_PART_MISSING',
    },
  ]

  const invalidResults = []
  for (const fixture of fixtures) {
    const filePath = join(fixtureDirectory, fixture.fileName)
    await writeFile(filePath, fixture.bytes)
    const result = await parse(filePath)
    const errorCode = result.diagnostics?.parserErrorCode
    invalidResults.push({
      id: fixture.id,
      extension: extname(filePath),
      expectedParseStatus: 'parse_failed',
      observedParseStatus: result.parseStatus,
      expectedErrorCode: fixture.expectedErrorCode,
      observedErrorCode: errorCode,
      pass: result.parseStatus === 'parse_failed' && errorCode === fixture.expectedErrorCode,
    })
  }

  globalThis.__officeParserPdfProbe = false
  const pdfPath = join(fixtureDirectory, 'javascript-action.pdf')
  await writeFile(pdfPath, makePdfWithJavaScript())
  const pdfResult = await parse(pdfPath)
  const pdfExecuted = globalThis.__officeParserPdfProbe === true
  const pdfProbe = {
    id: 'malicious-pdf-javascript-action',
    expectedParseStatus: ['indexed', 'no_text'],
    observedParseStatus: pdfResult.parseStatus,
    canaryExecuted: pdfExecuted,
    pass: ['indexed', 'no_text'].includes(pdfResult.parseStatus) && !pdfExecuted,
  }

  const pdfPackage = JSON.parse(await readFile(join(repoRoot, 'node_modules', 'pdfjs-dist', 'package.json'), 'utf8'))
  const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'))
  const report = {
    schemaVersion: 1,
    status: invalidResults.every((result) => result.pass) && pdfProbe.pass ? 'passed' : 'failed',
    parser: {
      officeparser: packageJson.devDependencies?.officeparser,
      pdfjsDistResolved: pdfPackage.version,
      pdfjsDistOverride: packageJson.overrides?.officeparser?.['pdfjs-dist'],
    },
    invalidOoxmlFixtures: invalidResults,
    maliciousPdfProbe: pdfProbe,
    securityDisposition: {
      advisory: 'GHSA-hq66-cqwq-w95j',
      fixedVersion: '6.2.108',
      nodePdfPathUsesResolvedWorker: true,
      scriptingCanaryExecuted: pdfExecuted,
    },
  }
  await writeReport(report, output)
  if (report.status !== 'passed') {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`fixture_probe_error ${error instanceof Error ? error.message : 'unknown_error'}`)
  process.exitCode = 2
})
