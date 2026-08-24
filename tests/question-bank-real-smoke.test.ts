import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ManagedFileService } from '../src/main/files/managed-file-service'
import { QuestionBankService } from '../src/main/question-bank/question-bank-service'
import { initializeWorkspace } from '../src/main/workspace/workspace-service'

const realSnapshotPath = process.env.TEACHER_WORKBENCH_QUESTION_BANK_SMOKE ?? ''

describe.skipIf(realSnapshotPath === '')('real question bank snapshot smoke', () => {
  it('imports, searches, opens detail, and copies one real question', async () => {
    const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-real-question-bank-'))
    const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
    const managedFiles = new ManagedFileService(workspace.database.raw, workspace.paths)
    const service = new QuestionBankService(workspace.paths, managedFiles)
    try {
      const summary = await service.importSnapshot(realSnapshotPath)
      expect(summary.questionCount).toBeGreaterThan(20_000)
      expect(summary.assetCount).toBeGreaterThan(10_000)

      const result = service.search({ text: '二次函数', grade: '九年级', limit: 10 })
      expect(result.total).toBeGreaterThan(0)
      const first = result.items[0]
      expect(first).toBeDefined()
      const detail = service.getQuestion(first!.id)
      expect(detail.content.trim()).not.toBe('')
      expect(detail.grade).toBe('九年级')

      const copied = service.copyToLibrary(detail.id)
      expect(copied.originalName.endsWith('.md')).toBe(true)
      expect(managedFiles.getOverview().files).toHaveLength(1)
    } finally {
      service.close()
      workspace.close()
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)
})
