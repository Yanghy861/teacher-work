import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from './officeparser-adapter.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))

function option(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function run() {
  const samplesArgument = option('--samples')
  if (samplesArgument === undefined) {
    throw new Error('samples_required')
  }
  const samples = resolve(samplesArgument)
  const manifest = JSON.parse(await readFile(join(samples, 'sample-manifest.json'), 'utf8'))
  const wanted = ['.pptx', '.pdf', '.xlsx'].map((extension) => {
    const entry = manifest.samples.find((item) => (
      item.extension === extension && (extension !== '.pdf' || item.pdfKind === 'text_layer')
    ))
    if (entry === undefined) {
      throw new Error(`sample_missing:${extension}`)
    }
    return entry
  })

  const results = []
  for (const entry of wanted) {
    const result = await parse(join(samples, `${entry.id}${entry.extension}`))
    results.push({
      extension: entry.extension,
      parseStatus: result.parseStatus,
      chunkCount: result.chunks.length,
    })
  }
  const pdfjsPackage = JSON.parse(await readFile(
    join(scriptDirectory, '..', '..', 'node_modules', 'pdfjs-dist', 'package.json'), 'utf8',
  ))
  const passed = results.every((item) => item.parseStatus === 'indexed' && item.chunkCount > 0)
    && pdfjsPackage.version === '6.2.108'
  return {
    schemaVersion: 1,
    status: passed ? 'passed' : 'failed',
    electron: process.versions.electron,
    node: process.versions.node,
    pdfjsDistResolved: pdfjsPackage.version,
    results,
    privacy: {
      storesPaths: false,
      storesFilenames: false,
      storesDocumentText: false,
    },
  }
}

app.whenReady().then(async () => {
  try {
    const report = await run()
    process.stdout.write(`${JSON.stringify(report)}\n`)
    app.exit(report.status === 'passed' ? 0 : 1)
  } catch (error) {
    process.stderr.write(`electron_parser_smoke_error ${error instanceof Error ? error.message : 'unknown_error'}\n`)
    app.exit(2)
  }
})
