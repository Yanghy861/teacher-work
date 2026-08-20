import { createHash } from 'node:crypto'
import { open, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import {
  assertCrashRoot,
  assertWithin,
  ensureDirectory,
  hashFile,
  writeJsonAtomic,
  writeSyntheticPayload,
} from './common.mjs'

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

function requiredOption(args, name) {
  const value = option(args, name)
  if (value === undefined) {
    throw new Error(`missing_value_${name}`)
  }
  return value
}

async function writeWorkerState(workspace, state) {
  await writeJsonAtomic(join(workspace, 'worker-state.json'), state)
}

async function stopAtCrash(workspace, point, details = {}) {
  await writeWorkerState(workspace, {
    status: 'crash_point_reached',
    point,
    details,
  })
  process.stdout.write(`${JSON.stringify({ type: 'CRASH_POINT', point })}\n`)
  const keepAlive = setInterval(() => {}, 60_000)
  await new Promise(() => {})
  clearInterval(keepAlive)
}

async function preparePayload(workspace) {
  const sourcePath = join(workspace, 'source.bin')
  await writeSyntheticPayload(sourcePath)
  const expectedHash = await hashFile(sourcePath)
  await writeJsonAtomic(join(workspace, 'payload-meta.json'), {
    sizeBytes: 256 * 1024,
    hash: expectedHash,
  })
  return sourcePath
}

async function copyInChunks(sourcePath, temporaryPath, workspace, point) {
  const source = await readFile(sourcePath)
  const handle = await open(temporaryPath, 'w')
  try {
    const chunkSize = 32 * 1024
    for (let offset = 0; offset < source.length; offset += chunkSize) {
      const chunk = source.subarray(offset, Math.min(source.length, offset + chunkSize))
      await handle.write(chunk)
      if (offset > 0 && point === 'copy-to-tmp') {
        await handle.close()
        await stopAtCrash(workspace, point, { bytesWritten: offset + chunk.length })
      }
    }
  } finally {
    await handle.close()
  }
}

async function runCopyToTmp(workspace) {
  const sourcePath = await preparePayload(workspace)
  const finalPath = join(workspace, 'objects', 'item.bin')
  const temporaryPath = `${finalPath}.tmp`
  await ensureDirectory(join(workspace, 'objects'))
  await copyInChunks(sourcePath, temporaryPath, workspace, 'copy-to-tmp')
  await writeJsonAtomic(join(workspace, 'operation.json'), { status: 'copying' })
}

async function runValidateRename(workspace) {
  const sourcePath = await preparePayload(workspace)
  const finalPath = join(workspace, 'objects', 'item.bin')
  const temporaryPath = `${finalPath}.tmp`
  await ensureDirectory(join(workspace, 'objects'))
  await writeFile(temporaryPath, await readFile(sourcePath))
  await stopAtCrash(workspace, 'before-atomic-rename', { temporaryReady: true })
}

function openRecoveryDatabase(databasePath) {
  const database = new Database(databasePath)
  database.exec('CREATE TABLE IF NOT EXISTS work_items (id TEXT PRIMARY KEY, status TEXT NOT NULL, run_count INTEGER NOT NULL DEFAULT 0)')
  return database
}

async function runDatabaseTransaction(workspace) {
  const databasePath = join(workspace, 'workspace.db')
  const database = openRecoveryDatabase(databasePath)
  database.prepare('BEGIN IMMEDIATE').run()
  database.prepare('INSERT INTO work_items (id, status) VALUES (?, ?)').run('transaction-item', 'processing')
  await stopAtCrash(workspace, 'before-db-commit', { transactionOpen: true })
}

async function runProcessingRecovery(workspace) {
  const databasePath = join(workspace, 'workspace.db')
  const database = openRecoveryDatabase(databasePath)
  database.transaction(() => {
    database.prepare('INSERT OR REPLACE INTO work_items (id, status, run_count) VALUES (?, ?, ?)').run('completed-item', 'completed', 1)
    database.prepare('INSERT OR REPLACE INTO work_items (id, status, run_count) VALUES (?, ?, ?)').run('processing-item', 'processing', 1)
  })()
  await stopAtCrash(workspace, 'after-processing-commit', { processingCommitted: true })
}

async function runHash(workspace) {
  const sourcePath = await preparePayload(workspace)
  const source = await readFile(sourcePath)
  const statePath = join(workspace, 'hash-state.json')
  await writeJsonAtomic(statePath, { status: 'computing', hash: null })
  const hash = createHash('sha256')
  const chunkSize = 32 * 1024
  for (let offset = 0; offset < source.length; offset += chunkSize) {
    hash.update(source.subarray(offset, Math.min(source.length, offset + chunkSize)))
    if (offset > 0) {
      await stopAtCrash(workspace, 'during-hash', { bytesRead: offset + chunkSize })
    }
  }
  await writeJsonAtomic(statePath, { status: 'complete', hash: hash.digest('hex') })
}

async function runParse(workspace) {
  const inputPath = join(workspace, 'input.json')
  const outputPath = join(workspace, 'parse-output.json')
  const temporaryPath = `${outputPath}.tmp`
  await writeFile(inputPath, '{"kind":"synthetic","values":[1,2,3]}', 'utf8')
  await writeFile(temporaryPath, '{"kind":"synthetic",', 'utf8')
  await stopAtCrash(workspace, 'during-parse', { outputTemporary: true })
}

async function runIndex(workspace) {
  const indexPath = join(workspace, 'search-index.json')
  const temporaryPath = `${indexPath}.tmp`
  await writeJsonAtomic(indexPath, { version: 1, entries: ['old-entry'] })
  await writeFile(temporaryPath, '{"version":2,"entries":[', 'utf8')
  await stopAtCrash(workspace, 'before-index-rename', { oldIndexCommitted: true })
}

async function runCorruptQueue(workspace) {
  const inputDirectory = join(workspace, 'inputs')
  await ensureDirectory(inputDirectory)
  await writeFile(join(inputDirectory, 'bad.json'), '{not-json', 'utf8')
  await writeFile(join(inputDirectory, 'good.json'), '{"ok":true}', 'utf8')
  await writeJsonAtomic(join(workspace, 'queue.json'), {
    items: [
      { id: 'bad-item', input: 'bad.json', status: 'pending' },
      { id: 'good-item', input: 'good.json', status: 'pending' },
    ],
  })
  await stopAtCrash(workspace, 'before-queue-recovery', { queueItems: 2 })
}

async function main() {
  const args = process.argv.slice(2)
  const scenario = requiredOption(args, '--scenario')
  const baseRoot = assertCrashRoot(requiredOption(args, '--base-root'))
  const workspace = resolve(requiredOption(args, '--workspace'))
  assertWithin(baseRoot, workspace, 'workspace')
  await ensureDirectory(workspace)
  await writeWorkerState(workspace, { status: 'started', scenario })

  switch (scenario) {
    case 'copy-tmp':
      await runCopyToTmp(workspace)
      break
    case 'validate-rename':
      await runValidateRename(workspace)
      break
    case 'db-transaction':
      await runDatabaseTransaction(workspace)
      break
    case 'processing-recovery':
      await runProcessingRecovery(workspace)
      break
    case 'hash':
      await runHash(workspace)
      break
    case 'parse':
      await runParse(workspace)
      break
    case 'index-write':
      await runIndex(workspace)
      break
    case 'corrupt-input':
      await runCorruptQueue(workspace)
      break
    default:
      throw new Error(`unknown_scenario_${scenario}`)
  }
  await writeWorkerState(workspace, { status: 'completed', scenario })
}

main().catch((error) => {
  process.stderr.write(`worker_error ${error instanceof Error ? error.message : 'unknown_error'}\n`)
  process.exitCode = 2
})
