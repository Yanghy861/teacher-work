import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

const mockedFsPromises = vi.hoisted(() => ({ rename: vi.fn() }))

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return { ...actual, rename: mockedFsPromises.rename }
})

import { BackupRestoreService } from '../src/main/backup/backup-service'
import { WorkspaceActivityGate } from '../src/main/workspace/activity-gate'
import { initializeWorkspace } from '../src/main/workspace/workspace-service'

describe('Windows backup publication retry', () => {
  it('retries a transient EPERM without exposing a partial destination', async () => {
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    let attempts = 0
    mockedFsPromises.rename.mockImplementation(async (source, target) => {
      attempts += 1
      if (attempts === 1) {
        throw Object.assign(new Error('simulated transient Windows lock'), { code: 'EPERM' })
      }
      await actual.rename(source, target)
    })

    const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-backup-retry-'))
    const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
    try {
      const destination = join(root, 'backup')
      await new BackupRestoreService(
        workspace,
        join(root, 'install'),
        new WorkspaceActivityGate(),
      ).createBackup(destination)

      expect(attempts).toBe(2)
      expect(existsSync(join(destination, 'workspace.db'))).toBe(true)
      expect(existsSync(join(destination, 'backup_manifest.json'))).toBe(true)
    } finally {
      workspace.close()
      rmSync(root, { recursive: true, force: true })
      mockedFsPromises.rename.mockReset()
    }
  })
})
