import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import {
  assertCrashRoot,
  assertReportPath,
  assertWithin,
  crashResultsRoot,
  crashRoot,
  crashWorkerPath,
  ensureDirectory,
  exists,
  fileSummary,
  hashFile,
  hashPrefix,
  readJson,
  removeIfExists,
  repoDirectory,
  writeJsonAtomic,
} from './common.mjs'

const scenarios = [
  { id: 'copy-tmp', failurePoint: 'copy-to-tmp' },
  { id: 'validate-rename', failurePoint: 'before-atomic-rename' },
  { id: 'db-transaction', failurePoint: 'before-db-commit' },
  { id: 'processing-recovery', failurePoint: 'after-processing-commit' },
  { id: 'hash', failurePoint: 'during-hash' },
  { id: 'parse', failurePoint: 'during-parse' },
  { id: 'index-write', failurePoint: 'before-index-rename' },
  { id: 'corrupt-input', failurePoint: 'before-queue-recovery' },
]

function option(args, name) {
  const index = args.indexOf(name)
  if (index === -1) {
    return undefined
  }
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`missing_value_${name}`)
  }
  return value
}

function printUsage() {
  console.log([
    'Usage:',
    '  node spikes/crash-recovery/run-harness.mjs [options]',
    '',
    'Options:',
    '  --root <absolute-dir>    Strictly fixed to D:\\teacher_work\\tmp\\t07-crash-recovery.',
    '  --output <absolute-json> Report path under spikes/crash-recovery/results/.',
    '  --repeat <number>        Number of automatic repetitions (default: 2).',
    '',
    'The harness starts a child process for each fault point, kills it after a checkpoint,',
    'then runs recovery checks in an isolated temporary scenario directory.',
  ].join('\n'))
}

function positiveInteger(value, name, minimum = 1) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name}_invalid`)
  }
  return parsed
}

function safeError(error) {
  if (!(error instanceof Error)) {
    return 'unknown_error'
  }
  return error.name || 'error'
}

function allAssertionsPass(assertions) {
  return Object.values(assertions).every(Boolean)
}

async function copySourceAtomically(sourcePath, finalPath) {
  const temporaryPath = `${finalPath}.recovery.tmp`
  await copyFile(sourcePath, temporaryPath)
  await renameSafe(temporaryPath, finalPath)
}

async function renameSafe(sourcePath, targetPath) {
  const { rename } = await import('node:fs/promises')
  await rename(sourcePath, targetPath)
}

async function compareWithSource(sourcePath, targetPath) {
  if (!(await exists(targetPath))) {
    return { complete: false }
  }
  const [source, target] = await Promise.all([fileSummary(sourcePath), fileSummary(targetPath)])
  return {
    complete: source.sizeBytes === target.sizeBytes && source.hash === target.hash,
    sizeBytes: target.sizeBytes,
    hashPrefix: hashPrefix(target.hash),
  }
}

async function recoverCopyOrRename(workspace) {
  const sourcePath = join(workspace, 'source.bin')
  const finalPath = join(workspace, 'objects', 'item.bin')
  const temporaryPath = `${finalPath}.tmp`
  const temporaryBeforeRecovery = await exists(temporaryPath)
  let discardedPartial = false
  let promotedTemporary = false
  if (temporaryBeforeRecovery) {
    const source = await fileSummary(sourcePath)
    const temporary = await fileSummary(temporaryPath)
    if (source.sizeBytes === temporary.sizeBytes && source.hash === temporary.hash) {
      await renameSafe(temporaryPath, finalPath)
      promotedTemporary = true
    } else {
      await removeIfExists(temporaryPath)
      discardedPartial = true
    }
  }
  let retriedCopy = false
  if (!(await exists(finalPath))) {
    await copySourceAtomically(sourcePath, finalPath)
    retriedCopy = true
  }
  const verified = await compareWithSource(sourcePath, finalPath)
  return {
    assertions: {
      temporaryWasExamined: temporaryBeforeRecovery,
      partialTemporaryDiscardedOrPromoted: discardedPartial || promotedTemporary,
      finalFileComplete: verified.complete,
      noTemporaryLeft: !(await exists(temporaryPath)),
    },
    metrics: {
      temporaryBeforeRecovery,
      discardedPartial,
      promotedTemporary,
      retriedCopy,
      finalSizeBytes: verified.sizeBytes,
      finalHashPrefix: verified.hashPrefix,
    },
  }
}

function openDatabase(databasePath) {
  const database = new Database(databasePath)
  database.exec('CREATE TABLE IF NOT EXISTS work_items (id TEXT PRIMARY KEY, status TEXT NOT NULL, run_count INTEGER NOT NULL DEFAULT 0)')
  return database
}

async function recoverDatabaseTransaction(workspace) {
  const database = openDatabase(join(workspace, 'workspace.db'))
  const integrity = database.pragma('integrity_check', { simple: true })
  const rowsAfterCrash = database.prepare('SELECT id, status FROM work_items').all()
  const rolledBack = rowsAfterCrash.length === 0
  database.transaction(() => {
    database.prepare('INSERT INTO work_items (id, status, run_count) VALUES (?, ?, ?)').run('transaction-item', 'completed', 1)
  })()
  const committedRetry = database.prepare('SELECT status FROM work_items WHERE id = ?').get('transaction-item')
  database.close()
  return {
    assertions: {
      sqliteIntegrityOk: integrity === 'ok',
      transactionRolledBack: rolledBack,
      retryCommitsCompleteState: committedRetry?.status === 'completed',
    },
    metrics: {
      sqliteIntegrity: integrity,
      rowsAfterCrash: rowsAfterCrash.length,
    },
  }
}

async function recoverProcessingState(workspace) {
  const database = openDatabase(join(workspace, 'workspace.db'))
  const processingBefore = database.prepare("SELECT COUNT(*) AS count FROM work_items WHERE status = 'processing'").get().count
  database.prepare("UPDATE work_items SET status = 'pending' WHERE status = 'processing'").run()
  const resetCount = database.prepare("SELECT COUNT(*) AS count FROM work_items WHERE status = 'pending'").get().count
  const pendingItems = database.prepare("SELECT id, run_count FROM work_items WHERE status = 'pending'").all()
  for (const item of pendingItems) {
    database.prepare('UPDATE work_items SET status = ?, run_count = run_count + 1 WHERE id = ?').run('completed', item.id)
  }
  const completed = database.prepare('SELECT id, status, run_count FROM work_items ORDER BY id').all()
  const completedItem = completed.find((item) => item.id === 'completed-item')
  const recoveredItem = completed.find((item) => item.id === 'processing-item')
  database.close()
  return {
    assertions: {
      processingWasFound: processingBefore === 1,
      processingResetToPending: resetCount >= 1,
      completedItemNotRedone: completedItem?.status === 'completed' && completedItem.run_count === 1,
      interruptedItemCompletedOnceAfterReset: recoveredItem?.status === 'completed' && recoveredItem.run_count === 2,
    },
    metrics: {
      processingBefore,
      resetCount,
      completed,
    },
  }
}

async function recoverHash(workspace) {
  const sourcePath = join(workspace, 'source.bin')
  const statePath = join(workspace, 'hash-state.json')
  const stateBefore = await readJson(statePath)
  const hash = await hashFile(sourcePath)
  await writeJsonAtomic(statePath, { status: 'complete', hash })
  const stateAfter = await readJson(statePath)
  return {
    assertions: {
      interruptedHashWasNotComplete: stateBefore.status === 'computing' && stateBefore.hash === null,
      recoveredHashComplete: stateAfter.status === 'complete',
      recoveredHashMatchesFile: stateAfter.hash === hash,
    },
    metrics: {
      stateBefore: stateBefore.status,
      hashPrefix: hashPrefix(hash),
    },
  }
}

async function recoverParse(workspace) {
  const inputPath = join(workspace, 'input.json')
  const outputPath = join(workspace, 'parse-output.json')
  const temporaryPath = `${outputPath}.tmp`
  const temporaryBeforeRecovery = await exists(temporaryPath)
  await removeIfExists(temporaryPath)
  const parsed = JSON.parse(await readFile(inputPath, 'utf8'))
  await writeJsonAtomic(outputPath, parsed)
  const verified = await readJson(outputPath)
  return {
    assertions: {
      partialParseRemoved: temporaryBeforeRecovery && !(await exists(temporaryPath)),
      parseRetryComplete: verified.kind === 'synthetic' && Array.isArray(verified.values),
      formalOutputIsReadable: await exists(outputPath),
    },
    metrics: {
      valueCount: verified.values.length,
    },
  }
}

async function recoverIndex(workspace) {
  const indexPath = join(workspace, 'search-index.json')
  const temporaryPath = `${indexPath}.tmp`
  const oldIndex = await readJson(indexPath)
  const temporaryBeforeRecovery = await exists(temporaryPath)
  await removeIfExists(temporaryPath)
  await writeJsonAtomic(indexPath, { version: 2, entries: ['new-entry'] })
  const finalIndex = await readJson(indexPath)
  return {
    assertions: {
      oldFormalIndexWasReadable: oldIndex.version === 1,
      partialIndexRemoved: temporaryBeforeRecovery && !(await exists(temporaryPath)),
      newFormalIndexIsComplete: finalIndex.version === 2 && finalIndex.entries.length === 1,
    },
    metrics: {
      oldVersion: oldIndex.version,
      finalVersion: finalIndex.version,
    },
  }
}

async function recoverCorruptQueue(workspace) {
  const queuePath = join(workspace, 'queue.json')
  const queue = await readJson(queuePath)
  const results = []
  for (const item of queue.items) {
    try {
      await readJson(join(workspace, 'inputs', item.input))
      results.push({ ...item, status: 'completed', error: null })
    } catch {
      results.push({ ...item, status: 'failed', error: 'INPUT_UNREADABLE' })
    }
  }
  await writeJsonAtomic(queuePath, { items: results })
  const bad = results.find((item) => item.id === 'bad-item')
  const good = results.find((item) => item.id === 'good-item')
  return {
    assertions: {
      corruptedItemIsolated: bad?.status === 'failed' && bad.error === 'INPUT_UNREADABLE',
      laterQueueItemCompleted: good?.status === 'completed',
      queueNotBlocked: results.length === 2,
    },
    metrics: {
      statuses: results.map((item) => item.status),
    },
  }
}

async function recoverScenario(scenarioId, workspace) {
  switch (scenarioId) {
    case 'copy-tmp':
    case 'validate-rename':
      return recoverCopyOrRename(workspace)
    case 'db-transaction':
      return recoverDatabaseTransaction(workspace)
    case 'processing-recovery':
      return recoverProcessingState(workspace)
    case 'hash':
      return recoverHash(workspace)
    case 'parse':
      return recoverParse(workspace)
    case 'index-write':
      return recoverIndex(workspace)
    case 'corrupt-input':
      return recoverCorruptQueue(workspace)
    default:
      throw new Error(`unknown_recovery_scenario_${scenarioId}`)
  }
}

function runChild(scenario, workspace, baseRoot) {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now()
    const child = spawn(process.execPath, [
      crashWorkerPath,
      '--scenario', scenario.id,
      '--workspace', workspace,
      '--base-root', baseRoot,
    ], {
      cwd: repoDirectory,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let outputBuffer = ''
    let sawCrashPoint = false
    let killRequested = false
    let killResult = false
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      if (!killRequested) {
        killRequested = true
        killResult = child.kill('SIGKILL')
      }
    }, 10_000)

    const requestKill = () => {
      if (killRequested) {
        return
      }
      killRequested = true
      killResult = child.kill('SIGKILL')
    }

    child.stdout.on('data', (chunk) => {
      outputBuffer += chunk.toString('utf8')
      const lines = outputBuffer.split(/\r?\n/)
      outputBuffer = lines.pop() ?? ''
      for (const line of lines) {
        try {
          const message = JSON.parse(line)
          if (message.type === 'CRASH_POINT') {
            sawCrashPoint = true
            requestKill()
          }
        } catch {
          // The worker only emits JSON checkpoints; ignore non-protocol output.
        }
      }
    })
    child.on('close', (code, signal) => {
      clearTimeout(timeout)
      resolvePromise({
        sawCrashPoint,
        killRequested,
        killResult,
        timedOut,
        exitCode: code,
        signal,
        durationMs: Date.now() - startedAt,
        killedAbruptly: killRequested && (signal === 'SIGKILL' || code !== 0),
      })
    })
  })
}

async function runScenario(scenario, iterationRoot, baseRoot) {
  const workspace = assertWithin(baseRoot, join(iterationRoot, 'scenarios', scenario.id), 'scenario_workspace')
  await ensureDirectory(workspace)
  const child = await runChild(scenario, workspace, baseRoot)
  let recovery
  let recoveryError
  try {
    recovery = await recoverScenario(scenario.id, workspace)
  } catch (error) {
    recoveryError = safeError(error)
    recovery = {
      assertions: {},
      metrics: {},
    }
  }
  const assertions = {
    childReachedFaultPoint: child.sawCrashPoint,
    childKillRequested: child.killRequested,
    childExitedAbruptly: child.killedAbruptly,
    recoveryCompleted: recoveryError === undefined,
    ...recovery.assertions,
  }
  return {
    id: scenario.id,
    failurePoint: scenario.failurePoint,
    status: allAssertionsPass(assertions) ? 'passed' : 'failed',
    assertions,
    child: {
      sawCrashPoint: child.sawCrashPoint,
      killRequested: child.killRequested,
      killResult: child.killResult,
      killedAbruptly: child.killedAbruptly,
      timedOut: child.timedOut,
      exitCode: child.exitCode,
      signal: child.signal,
      durationMs: child.durationMs,
    },
    recovery: recovery.metrics,
    recoveryError,
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    printUsage()
    return
  }
  const baseRoot = assertCrashRoot(option(args, '--root') ?? crashRoot)
  const output = assertReportPath(option(args, '--output') ?? join(crashResultsRoot, 't07-crash-recovery.json'))
  const repeat = positiveInteger(option(args, '--repeat') ?? '2', 'repeat')
  await ensureDirectory(baseRoot)
  await ensureDirectory(crashResultsRoot)

  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`
  const runRoot = assertWithin(baseRoot, join(baseRoot, `run-${runId}`), 'run_root')
  await ensureDirectory(runRoot)
  const scenarioResults = []
  for (let iteration = 1; iteration <= repeat; iteration += 1) {
    const iterationRoot = assertWithin(runRoot, join(runRoot, `iteration-${String(iteration).padStart(2, '0')}`), 'iteration_root')
    await ensureDirectory(iterationRoot)
    for (const scenario of scenarios) {
      scenarioResults.push({
        iteration,
        ...(await runScenario(scenario, iterationRoot, baseRoot)),
      })
    }
  }

  const passed = scenarioResults.filter((result) => result.status === 'passed').length
  const report = {
    schemaVersion: 1,
    status: passed === scenarioResults.length ? 'completed' : 'failed',
    benchmark: 'T07-Spike-D',
    repeat,
    scenarioCount: scenarioResults.length,
    scenarios: scenarioResults,
    summary: {
      passed,
      failed: scenarioResults.length - passed,
      childKillCount: scenarioResults.filter((result) => result.child.killedAbruptly).length,
      recoveryFailureCount: scenarioResults.filter((result) => result.recoveryError !== undefined).length,
    },
    rootPolicy: {
      allowedRoot: 'workspace/tmp/t07-crash-recovery',
      strictRootValidation: true,
      perRunIsolation: true,
      realUserDirectoriesTouched: false,
    },
    privacy: {
      storesPaths: false,
      storesFilenames: false,
      storesDocumentText: false,
      storesFullHashes: false,
      syntheticInputsOnly: true,
    },
  }
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`wrote_machine_report ${report.schemaVersion} ${report.status}`)
  if (report.status !== 'completed') {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`harness_error ${error instanceof Error ? error.message : 'unknown_error'}`)
  process.exitCode = 2
})
