import { readdir, stat, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'

const supportedExtensions = new Set(['.pptx', '.docx', '.pdf', '.xlsx'])
const requiredExtensions = ['.pptx', '.docx', '.pdf', '.xlsx']
const minimumSamples = 30
const maximumSamples = 100

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

function printUsage() {
  console.log(
    [
      'Usage:',
      '  node spikes/document-parser/run-spike.mjs --samples <absolute-dir> --adapter <module> [--output <absolute-json>]',
      '',
      'The adapter must export async parse(filePath) -> { text, chunks, parseStatus }.',
      'The runner writes measurements only; it never writes document paths, names, or正文内容.',
    ].join('\n'),
  )
}

async function collectFiles(directory, files = []) {
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(entryPath, files)
      continue
    }

    if (entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(entryPath)
    }
  }

  return files
}

function extensionCounts(files) {
  return Object.fromEntries(
    requiredExtensions.map((extension) => [
      extension,
      files.filter((filePath) => extname(filePath).toLowerCase() === extension).length,
    ]),
  )
}

function createSampleId(index) {
  return `sample-${String(index + 1).padStart(3, '0')}`
}

function normalizeStatus(result) {
  if (result?.parseStatus === 'indexed' || result?.parseStatus === 'no_text') {
    return result.parseStatus
  }
  if (result?.parseStatus === 'parse_failed') {
    return 'parse_failed'
  }

  const hasText = typeof result?.text === 'string' && result.text.length > 0
  const hasChunks = Array.isArray(result?.chunks) && result.chunks.length > 0
  return hasText || hasChunks ? 'indexed' : 'no_text'
}

function positionCounts(chunks) {
  if (!Array.isArray(chunks)) {
    return {}
  }

  const counts = {}
  for (const chunk of chunks) {
    const positionType = typeof chunk?.positionType === 'string' ? chunk.positionType : 'unknown'
    counts[positionType] = (counts[positionType] ?? 0) + 1
  }
  return counts
}

async function measureParse(filePath, parse) {
  let peakRssBytes = process.memoryUsage().rss
  const sampleMemory = () => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss)
  }
  const timer = setInterval(sampleMemory, 10)
  const startedAt = performance.now()

  try {
    const result = await parse(filePath)
    sampleMemory()
    const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100
    const textChars = typeof result?.text === 'string' ? result.text.length : 0
    const chunks = Array.isArray(result?.chunks) ? result.chunks : []
    return {
      parseStatus: normalizeStatus(result),
      textChars,
      chunkCount: chunks.length,
      positionCounts: positionCounts(chunks),
      elapsedMs,
      peakRssBytes,
    }
  } catch (error) {
    sampleMemory()
    return {
      parseStatus: 'parse_failed',
      textChars: 0,
      chunkCount: 0,
      positionCounts: {},
      elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
      peakRssBytes,
      errorCode: error instanceof Error ? error.name : 'unknown_error',
    }
  } finally {
    clearInterval(timer)
  }
}

function summarize(records) {
  const statusCounts = {}
  let totalTextChars = 0
  let totalChunks = 0
  let totalElapsedMs = 0
  let peakRssBytes = 0

  for (const record of records) {
    statusCounts[record.parseStatus] = (statusCounts[record.parseStatus] ?? 0) + 1
    totalTextChars += record.textChars
    totalChunks += record.chunkCount
    totalElapsedMs += record.elapsedMs
    peakRssBytes = Math.max(peakRssBytes, record.peakRssBytes)
  }

  return {
    statusCounts,
    totalTextChars,
    totalChunks,
    totalElapsedMs: Math.round(totalElapsedMs * 100) / 100,
    peakRssBytes,
  }
}

async function loadAdapter(adapterArgument) {
  const adapterPath = isAbsolute(adapterArgument) ? adapterArgument : resolve(adapterArgument)
  const adapter = await import(pathToFileURL(adapterPath).href)
  const parse = typeof adapter.parse === 'function' ? adapter.parse : adapter.default?.parse
  if (typeof parse !== 'function') {
    throw new Error('adapter_parse_export_missing')
  }
  return parse
}

async function writeReport(report, outputArgument) {
  const serialized = JSON.stringify(report, null, 2) + '\n'
  if (outputArgument === undefined) {
    process.stdout.write(serialized)
    return
  }

  if (!isAbsolute(outputArgument)) {
    throw new Error('output_must_be_absolute')
  }
  await writeFile(outputArgument, serialized, 'utf8')
  console.log(`wrote_machine_report ${report.schemaVersion}`)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    printUsage()
    return
  }

  const samplesArgument = option(args, '--samples')
  const adapterArgument = option(args, '--adapter')
  const outputArgument = option(args, '--output')
  if (samplesArgument === undefined || adapterArgument === undefined) {
    printUsage()
    process.exitCode = 2
    return
  }
  if (!isAbsolute(samplesArgument)) {
    throw new Error('samples_must_be_absolute')
  }

  const samplesDirectory = resolve(samplesArgument)
  const directoryStats = await stat(samplesDirectory).catch(() => undefined)
  if (directoryStats?.isDirectory() !== true) {
    throw new Error('sample_directory_missing')
  }

  const files = await collectFiles(samplesDirectory)
  const counts = extensionCounts(files)
  const sampleCountPass = files.length >= minimumSamples && files.length <= maximumSamples
  const formatCoveragePass = requiredExtensions.every((extension) => counts[extension] > 0)
  const acceptance = {
    sampleCountPass,
    formatCoveragePass,
    requiredExtensions,
    minimumSamples,
    maximumSamples,
  }

  if (!sampleCountPass || !formatCoveragePass) {
    await writeReport(
      {
        schemaVersion: 1,
        status: 'blocked',
        reason: 'sample_set_does_not_meet_T04_gate',
        sampleCount: files.length,
        formatCounts: counts,
        acceptance,
        records: [],
      },
      outputArgument,
    )
    process.exitCode = 2
    return
  }

  const parse = await loadAdapter(adapterArgument)
  const records = []
  for (const [index, filePath] of files.entries()) {
    const fileStats = await stat(filePath)
    const measurement = await measureParse(filePath, parse)
    records.push({
      sampleId: createSampleId(index),
      extension: extname(filePath).toLowerCase(),
      sizeBytes: fileStats.size,
      ...measurement,
    })
  }

  await writeReport(
    {
      schemaVersion: 1,
      status: 'completed',
      sampleCount: files.length,
      formatCounts: counts,
      acceptance,
      summary: summarize(records),
      records,
    },
    outputArgument,
  )
}

main().catch((error) => {
  console.error(`spike_error ${error instanceof Error ? error.message : 'unknown_error'}`)
  process.exitCode = 2
})
