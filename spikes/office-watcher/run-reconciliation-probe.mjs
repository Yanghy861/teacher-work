import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function readStable(filePath, sampleCount = 3) {
  let previous
  for (let index = 0; index < sampleCount; index += 1) {
    const before = await stat(filePath)
    const bytes = await readFile(filePath)
    const after = await stat(filePath)
    const sample = {
      size: after.size,
      mtimeMs: after.mtimeMs,
      hash: sha256(bytes),
      readable: before.size === after.size && before.mtimeMs === after.mtimeMs,
    }
    if (!sample.readable) {
      throw new Error('file_changed_during_read')
    }
    if (previous !== undefined
      && (previous.size !== sample.size || previous.mtimeMs !== sample.mtimeMs
        || previous.hash !== sample.hash)) {
      throw new Error('file_not_stable')
    }
    previous = sample
  }
  return { ...previous, stableSamples: sampleCount }
}

function createReconciler() {
  const acceptedHashByFile = new Map()
  const pendingByFile = new Map()
  const decisions = []
  let mergedTriggerCount = 0

  async function reconcile({ fileId, filePath, trigger }) {
    const pending = pendingByFile.get(fileId)
    if (pending !== undefined) {
      pending.triggers.add(trigger)
      mergedTriggerCount += 1
      return pending.promise
    }

    const work = { triggers: new Set([trigger]) }
    work.promise = (async () => {
      const observed = await readStable(filePath)
      const previousHash = acceptedHashByFile.get(fileId)
      let decision
      if (previousHash === undefined) {
        decision = 'baseline_recorded'
      } else if (previousHash === observed.hash) {
        decision = 'no_rebuild'
      } else {
        decision = 'rebuild_required'
      }
      acceptedHashByFile.set(fileId, observed.hash)
      const record = {
        decision,
        triggers: [...work.triggers].sort(),
        stableSamples: observed.stableSamples,
        readable: true,
      }
      decisions.push(record)
      return record
    })().finally(() => {
      pendingByFile.delete(fileId)
    })
    pendingByFile.set(fileId, work)
    return work.promise
  }

  return {
    getReport: () => ({ decisions, mergedTriggerCount }),
    reconcile,
  }
}

export async function runReconciliationProbe() {
  const probeRoot = await mkdtemp(join(tmpdir(), 'teacher-workbench-refresh-'))
  const filePath = join(probeRoot, 'anonymous.pptx')
  const reconciler = createReconciler()
  try {
    await writeFile(filePath, Buffer.from('anonymous-version-0'))
    const baseline = await reconciler.reconcile({ fileId: 'file-001', filePath, trigger: 'startup' })
    const unchanged = await reconciler.reconcile({ fileId: 'file-001', filePath, trigger: 'manual-refresh' })

    await writeFile(filePath, Buffer.from('anonymous-version-1'))
    const concurrent = await Promise.all([
      reconciler.reconcile({ fileId: 'file-001', filePath, trigger: 'manual-refresh' }),
      reconciler.reconcile({ fileId: 'file-001', filePath, trigger: 'focus-return' }),
      reconciler.reconcile({ fileId: 'file-001', filePath, trigger: 'reopen' }),
    ])
    const afterAccepted = await reconciler.reconcile({
      fileId: 'file-001', filePath, trigger: 'manual-refresh',
    })

    await writeFile(filePath, Buffer.from('anonymous-version-2'))
    const focusReturn = await reconciler.reconcile({
      fileId: 'file-001', filePath, trigger: 'focus-return',
    })
    await writeFile(filePath, Buffer.from('anonymous-version-3'))
    const reopen = await reconciler.reconcile({ fileId: 'file-001', filePath, trigger: 'reopen' })
    await writeFile(filePath, Buffer.from('anonymous-version-4'))
    const startup = await reconciler.reconcile({ fileId: 'file-001', filePath, trigger: 'startup' })

    const internal = reconciler.getReport()
    const rebuildDecisions = internal.decisions.filter((item) => item.decision === 'rebuild_required')
    const concurrentDecisionCount = new Set(concurrent).size
    const checks = {
      baselineDoesNotRebuild: baseline.decision === 'baseline_recorded',
      unchangedDoesNotRebuild: unchanged.decision === 'no_rebuild',
      missedWatcherChangeDetected: concurrent[0].decision === 'rebuild_required',
      concurrentTriggersCoalesced: concurrentDecisionCount === 1
        && concurrent[0].triggers.join(',') === 'focus-return,manual-refresh,reopen',
      acceptedHashDoesNotRepeat: afterAccepted.decision === 'no_rebuild',
      focusReturnDetectsChange: focusReturn.decision === 'rebuild_required',
      reopenDetectsChange: reopen.decision === 'rebuild_required',
      startupDetectsChange: startup.decision === 'rebuild_required',
      everyDecisionUsedStableReadableFile: internal.decisions.every((item) => (
        item.readable && item.stableSamples === 3
      )),
      exactlyOneRebuildPerNewHash: rebuildDecisions.length === 4,
    }
    return {
      schemaVersion: 1,
      status: Object.values(checks).every(Boolean) ? 'passed' : 'failed',
      benchmark: 'T06-refresh-reconciliation',
      watcherRequiredForCorrectness: false,
      triggers: ['startup', 'focus-return', 'reopen', 'manual-refresh'],
      checks,
      summary: {
        decisionCount: internal.decisions.length,
        rebuildDecisionCount: rebuildDecisions.length,
        mergedTriggerCount: internal.mergedTriggerCount,
      },
      privacy: {
        storesPaths: false,
        storesFilenames: false,
        storesDocumentText: false,
        storesHashes: false,
      },
    }
  } finally {
    await rm(probeRoot, { recursive: true, force: true })
  }
}

async function main() {
  const report = await runReconciliationProbe()
  console.log(JSON.stringify(report))
  if (report.status !== 'passed') {
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(`reconciliation_probe_error ${error instanceof Error ? error.message : 'unknown_error'}`)
    process.exitCode = 2
  })
}
