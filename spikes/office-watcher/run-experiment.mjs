import { createHash } from 'node:crypto'
import { access, mkdir, stat, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { dirname, extname, isAbsolute, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import chokidar from 'chokidar'

const defaultParameters = {
  debounceMs: 400,
  stableSamples: 3,
  stableIntervalMs: 150,
  taskDurationMs: 800,
  readRetryMs: 200,
  readRetries: 5,
}

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
  console.log([
    'Usage:',
    '  node spikes/office-watcher/run-experiment.mjs --directory <absolute-dir> --label <scenario> --output <absolute-json> [options]',
    '',
    'Options:',
    '  --duration-ms <number>       Experiment duration (default: 60000).',
    '  --debounce-ms <number>       Dirty debounce window (default: 400).',
    '  --stable-samples <number>    Required identical samples (default: 3).',
    '  --stable-interval-ms <number>  Interval between stable samples (default: 150).',
    '  --task-duration-ms <number>  Simulated rebuild task duration (default: 800).',
    '  --read-retry-ms <number>     Read retry interval (default: 200).',
    '  --read-retries <number>      Read retries per sample (default: 5).',
    '',
    'The watcher records anonymous event/decision metadata only; it never writes paths, filenames, or document content.',
  ].join('\n'))
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

function roundMilliseconds(value) {
  return Math.round(value * 1000) / 1000
}

function createHashForFile(filePath) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolvePromise(hash.digest('hex')))
  })
}

async function inspectFile(filePath) {
  try {
    const fileStats = await stat(filePath)
    await access(filePath)
    const hash = await createHashForFile(filePath)
    return {
      state: 'readable',
      sizeBytes: fileStats.size,
      mtimeMs: fileStats.mtimeMs,
      hash,
    }
  } catch (error) {
    return {
      state: 'unreadable',
      errorCode: error instanceof Error ? error.code ?? error.name : 'unknown_error',
    }
  }
}

async function inspectFileWithRetries(filePath, parameters) {
  let inspection
  for (let attempt = 0; attempt <= parameters.readRetries; attempt += 1) {
    inspection = await inspectFile(filePath)
    if (inspection.state === 'readable' || attempt === parameters.readRetries) {
      return inspection
    }
    await sleep(parameters.readRetryMs)
  }
  return inspection
}

async function sampleStable(filePath, parameters) {
  const samples = []
  const signatures = []
  for (let index = 0; index < parameters.stableSamples; index += 1) {
    const inspection = await inspectFileWithRetries(filePath, parameters)
    samples.push({
      state: inspection.state,
      sizeBytes: inspection.sizeBytes,
      mtimeMs: inspection.mtimeMs,
      hashPrefix: typeof inspection.hash === 'string' ? inspection.hash.slice(0, 16) : undefined,
      errorCode: inspection.errorCode,
    })
    if (inspection.state !== 'readable') {
      signatures.push(undefined)
      await sleep(parameters.readRetryMs)
      continue
    }
    const signature = `${inspection.sizeBytes}:${inspection.mtimeMs}:${inspection.hash}`
    signatures.push(signature)
    if (index < parameters.stableSamples - 1) {
      await sleep(parameters.stableIntervalMs)
    }
  }

  const finalInspection = await inspectFileWithRetries(filePath, parameters)
  if (finalInspection.state !== 'readable') {
    return { state: 'unreadable', samples, final: finalInspection }
  }
  const stable = signatures.length === parameters.stableSamples
    && signatures[0] !== undefined
    && signatures.every((signature) => signature === signatures[0])
  return {
    state: stable ? 'stable' : 'unstable',
    samples,
    final: finalInspection,
  }
}

function createFileIdFactory() {
  const ids = new Map()
  return (filePath) => {
    if (!ids.has(filePath)) {
      ids.set(filePath, `file-${String(ids.size + 1).padStart(3, '0')}`)
    }
    return ids.get(filePath)
  }
}

function createExperiment({ label, parameters }) {
  const startedAt = performance.now()
  const getFileId = createFileIdFactory()
  const eventSequence = []
  const decisions = []
  const stateByPath = new Map()
  const timerByPath = new Map()
  const fileHashByPath = new Map()
  const taskCounterByPath = new Map()
  const lastInspectionByPath = new Map()
  const pendingWork = new Set()

  function track(promise) {
    pendingWork.add(promise)
    const completion = promise.finally(() => pendingWork.delete(promise))
    void completion.catch(() => {})
    return completion
  }

  function recordEvent(event, filePath, inspection) {
    const fileId = getFileId(filePath)
    eventSequence.push({
      sequence: eventSequence.length + 1,
      elapsedMs: roundMilliseconds(performance.now() - startedAt),
      event,
      fileId,
      extension: extname(filePath).toLowerCase() || 'none',
      state: inspection?.state,
      sizeBytes: inspection?.sizeBytes,
      mtimeMs: inspection?.mtimeMs,
      hashPrefix: typeof inspection?.hash === 'string' ? inspection.hash.slice(0, 16) : undefined,
      errorCode: inspection?.errorCode,
    })
    lastInspectionByPath.set(filePath, {
      fileId,
      extension: extname(filePath).toLowerCase() || 'none',
      state: inspection?.state,
      sizeBytes: inspection?.sizeBytes,
      mtimeMs: inspection?.mtimeMs,
      hashPrefix: typeof inspection?.hash === 'string' ? inspection.hash.slice(0, 16) : undefined,
    })
  }

  async function schedule(filePath, triggerEvent) {
    const current = stateByPath.get(filePath) ?? {
      dirty: false,
      running: false,
      queuedDuringTask: false,
      eventCount: 0,
      mergedEvents: 0,
    }
    current.dirty = true
    current.eventCount += 1
    stateByPath.set(filePath, current)

    if (current.running) {
      current.queuedDuringTask = true
      current.mergedEvents += 1
      return
    }

    const existingTimer = timerByPath.get(filePath)
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer)
      current.mergedEvents += 1
    }
    const timer = setTimeout(() => {
      timerByPath.delete(filePath)
      track(processDirty(filePath, triggerEvent))
    }, parameters.debounceMs)
    timerByPath.set(filePath, timer)
  }

  async function processDirty(filePath, triggerEvent) {
    const current = stateByPath.get(filePath)
    if (current === undefined || !current.dirty || current.running) {
      return
    }
    current.running = true
    current.dirty = false
    const taskNumber = (taskCounterByPath.get(filePath) ?? 0) + 1
    taskCounterByPath.set(filePath, taskNumber)
    const stable = await sampleStable(filePath, parameters)
    const fileId = getFileId(filePath)
    const finalHash = stable.final?.hash
    const previousHash = fileHashByPath.get(filePath)
    const hashChanged = typeof finalHash === 'string' && finalHash !== previousHash
    const readable = stable.final?.state === 'readable'
    let decision = 'no_rebuild'
    let reason = 'hash_unchanged'
    if (!readable) {
      decision = 'retry_later'
      reason = 'file_not_readable'
    } else if (stable.state !== 'stable') {
      decision = 'retry_later'
      reason = 'file_not_stable'
    } else if (hashChanged) {
      decision = 'rebuild_required'
      reason = 'hash_changed'
      fileHashByPath.set(filePath, finalHash)
    }
    const decisionRecord = {
      sequence: decisions.length + 1,
      elapsedMs: roundMilliseconds(performance.now() - startedAt),
      fileId,
      taskId: `${fileId}:task-${String(taskNumber).padStart(3, '0')}`,
      triggerEvent,
      decision,
      reason,
      readable,
      stableState: stable.state,
      stableSampleCount: stable.samples.length,
      finalSizeBytes: stable.final?.sizeBytes,
      finalMtimeMs: stable.final?.mtimeMs,
      finalHashPrefix: typeof finalHash === 'string' ? finalHash.slice(0, 16) : undefined,
      hashChanged,
      eventCountMerged: current.eventCount,
      queuedDuringTask: false,
    }
    decisions.push(decisionRecord)

    await sleep(parameters.taskDurationMs)
    decisionRecord.queuedDuringTask = current.queuedDuringTask
    current.running = false
    current.eventCount = 0
    if (current.queuedDuringTask) {
      current.queuedDuringTask = false
      await schedule(filePath, 'task_recheck')
    }
  }

  async function onFsEvent(event, filePath) {
    return track((async () => {
      const inspection = event === 'unlink' ? { state: 'missing' } : await inspectFile(filePath)
      recordEvent(event, filePath, inspection)
      if (event === 'add' || event === 'change' || event === 'unlink') {
        await schedule(filePath, event)
      }
    })())
  }

  async function finish(watcher) {
    await watcher.close()
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (pendingWork.size === 0 && timerByPath.size === 0) {
        break
      }
      await sleep(Math.max(
        parameters.debounceMs,
        parameters.readRetryMs,
        parameters.stableIntervalMs * parameters.stableSamples,
        parameters.taskDurationMs,
      ))
    }
    for (const filePath of lastInspectionByPath.keys()) {
      const inspection = await inspectFileWithRetries(filePath, parameters)
      const fileId = getFileId(filePath)
      lastInspectionByPath.set(filePath, {
        fileId,
        extension: extname(filePath).toLowerCase() || 'none',
        state: inspection.state,
        sizeBytes: inspection.sizeBytes,
        mtimeMs: inspection.mtimeMs,
        hashPrefix: typeof inspection.hash === 'string' ? inspection.hash.slice(0, 16) : undefined,
      })
    }
    const eventsByKind = {}
    const decisionsByKind = {}
    for (const event of eventSequence) {
      eventsByKind[event.event] = (eventsByKind[event.event] ?? 0) + 1
    }
    for (const decision of decisions) {
      decisionsByKind[decision.decision] = (decisionsByKind[decision.decision] ?? 0) + 1
    }
    const extensionSummary = {}
    for (const event of eventSequence) {
      const summary = extensionSummary[event.extension] ?? { events: 0, files: new Set() }
      summary.events += 1
      summary.files.add(event.fileId)
      extensionSummary[event.extension] = summary
    }
    return {
      schemaVersion: 1,
      status: 'completed',
      benchmark: 'T06-Spike-C',
      application: label,
      watcher: 'chokidar@4.0.3',
      parameters,
      eventSequence,
      decisions,
      summary: {
        durationMs: roundMilliseconds(performance.now() - startedAt),
        eventsByKind,
        decisionsByKind,
        fileCount: new Set(eventSequence.map((event) => event.fileId)).size,
        extensionSummary: Object.fromEntries(
          Object.entries(extensionSummary).map(([extension, summary]) => [extension, {
            events: summary.events,
            fileCount: summary.files.size,
          }]),
        ),
        rebuildDecisionCount: decisions.filter((decision) => decision.decision === 'rebuild_required').length,
        hashUnchangedDecisionCount: decisions.filter((decision) => decision.reason === 'hash_unchanged').length,
        mergedEventCount: [...stateByPath.values()].reduce((total, state) => total + state.mergedEvents, 0),
        taskRecheckCount: decisions.filter((decision) => decision.triggerEvent === 'task_recheck').length,
        savesObservedDuringTask: decisions.filter((decision) => decision.queuedDuringTask).length,
      },
      finalSnapshots: [...lastInspectionByPath.values()],
      privacy: {
        storesPaths: false,
        storesFilenames: false,
        storesDocumentText: false,
        storesHashPrefixesOnly: true,
      },
    }
  }

  return { onFsEvent, finish }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    printUsage()
    return
  }
  const directoryArgument = option(args, '--directory')
  const label = option(args, '--label') ?? 'unknown-application'
  const outputArgument = option(args, '--output')
  const durationArgument = option(args, '--duration-ms')
  if (directoryArgument === undefined || outputArgument === undefined) {
    printUsage()
    process.exitCode = 2
    return
  }
  if (!isAbsolute(directoryArgument) || !isAbsolute(outputArgument)) {
    throw new Error('directory_and_output_must_be_absolute')
  }
  const directory = resolve(directoryArgument)
  const output = resolve(outputArgument)
  await mkdir(directory, { recursive: true })
  await mkdir(dirname(output), { recursive: true })
  const durationMs = Number(durationArgument ?? 60_000)
  if (!Number.isFinite(durationMs) || durationMs < 1_000) {
    throw new Error('duration_ms_invalid')
  }

  const parameterOptions = [
    ['debounceMs', '--debounce-ms', 1],
    ['stableSamples', '--stable-samples', 2],
    ['stableIntervalMs', '--stable-interval-ms', 1],
    ['taskDurationMs', '--task-duration-ms', 0],
    ['readRetryMs', '--read-retry-ms', 1],
    ['readRetries', '--read-retries', 0],
  ]
  const parameters = { ...defaultParameters }
  for (const [key, optionName, minimum] of parameterOptions) {
    const argument = option(args, optionName)
    if (argument === undefined) {
      continue
    }
    const value = Number(argument)
    if (!Number.isInteger(value) || value < minimum) {
      throw new Error(`${optionName}_invalid`)
    }
    parameters[key] = value
  }
  const experiment = createExperiment({ label, parameters })
  const watcher = chokidar.watch(directory, {
    ignoreInitial: false,
    awaitWriteFinish: false,
    persistent: true,
    depth: 0,
  })
  watcher.on('all', (event, filePath) => {
    void experiment.onFsEvent(event, filePath)
  })

  let finished = false
  const writeAndExit = async () => {
    if (finished) {
      return
    }
    finished = true
    const report = await experiment.finish(watcher)
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', 'utf8')
    console.log(`wrote_machine_report ${report.schemaVersion}`)
  }
  process.once('SIGINT', () => { void writeAndExit().then(() => process.exit(0)) })
  process.once('SIGTERM', () => { void writeAndExit().then(() => process.exit(0)) })
  setTimeout(() => { void writeAndExit().then(() => process.exit(0)) }, durationMs)
}

main().catch((error) => {
  console.error(`watcher_error ${error instanceof Error ? error.message : 'unknown_error'}`)
  process.exitCode = 2
})
