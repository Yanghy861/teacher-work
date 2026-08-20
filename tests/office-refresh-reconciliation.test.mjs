import { describe, expect, it } from 'vitest'
import { runReconciliationProbe } from '../spikes/office-watcher/run-reconciliation-probe.mjs'

describe('T06 refresh reconciliation', () => {
  it('detects changes without watcher events and coalesces duplicate triggers', async () => {
    const report = await runReconciliationProbe()

    expect(report).toEqual(expect.objectContaining({
      status: 'passed',
      watcherRequiredForCorrectness: false,
      checks: expect.objectContaining({
        missedWatcherChangeDetected: true,
        concurrentTriggersCoalesced: true,
        acceptedHashDoesNotRepeat: true,
        focusReturnDetectsChange: true,
        reopenDetectsChange: true,
        startupDetectsChange: true,
      }),
    }))
  })
})
