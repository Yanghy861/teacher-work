import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { AiGateway } from '../src/main/ai/ai-gateway'
import type { AiSettingsService } from '../src/main/ai/ai-settings-service'
import { CoreDataService } from '../src/main/data/core-data-service'
import { DraftService } from '../src/main/draft/draft-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { openSearchDatabase } from '../src/main/search/search-database'
import { SearchService } from '../src/main/search/search-service'
import { SkillService } from '../src/main/skills/skill-service'
import { initializeWorkspace } from '../src/main/workspace/workspace-service'
import { listLessonPrepFiles } from '../src/renderer/lesson-prep-context'

describe('V12-04 Viewed and Prep Lesson integration', () => {
  it('binds copied material, generated draft and saved result to lesson 9 while Current remains lesson 8', async () => {
    const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-v12-04-'))
    const workspace = initializeWorkspace(join(root, 'workspace'), join(root, 'install'))
    const searchDatabase = openSearchDatabase(workspace.paths)
    try {
      const core = new CoreDataService(workspace.database.raw)
      const files = new ManagedFileService(workspace.database.raw, workspace.paths)
      const search = new SearchService(workspace.database.raw, searchDatabase.raw, workspace.paths)
      const skills = new SkillService(workspace.database.raw)
      const settings = {
        getSettings: () => ({
          provider: 'openai-compatible' as const,
          model: 'v12-fake-model',
          endpoint: 'https://fake.local/v1',
          keyConfigured: true,
          keyStorage: 'session' as const,
        }),
      } as unknown as AiSettingsService
      const gateway = {
        requestText: async () => ({ text: '# 第九课讲义\n\n只属于第九课。', model: 'v12-fake-model' }),
      } as unknown as AiGateway
      const drafts = new DraftService(core, search, gateway, settings, skills)

      const course = core.createCourse({ title: 'V12 班课', mode: 'class' })
      const period = core.nodes.createPeriod(course.id, '2026 秋季')
      const lesson8 = core.nodes.createLesson(period.id, '第八课')
      const lesson9 = core.nodes.createLesson(period.id, '第九课')
      core.progress.startPeriod(course.id, period.id, lesson8.id)

      const originalPath = join(root, '第九课原资料.md')
      writeFileSync(originalPath, '# 原资料\n\n第九课明确内容', 'utf8')
      const material = files.importFile(originalPath)
      const lesson9Copy = files.copyToLesson(material.id, lesson9.id)
      const result = await drafts.generate({
        requestId: 'v12-04-lesson-9',
        kind: 'lecture',
        lessonId: lesson9.id,
        sources: [{ fileId: lesson9Copy.id, text: '第九课明确内容' }],
        maxChars: 1000,
        maxTokens: 500,
      })
      const saved = drafts.saveToLesson({ noteId: result.noteId })

      expect(listLessonPrepFiles(files.getOverview(), lesson9.id).map((file) => file.id)).toEqual([lesson9Copy.id])
      expect(listLessonPrepFiles(files.getOverview(), lesson8.id)).toEqual([])
      expect(saved).toMatchObject({ lessonId: lesson9.id, draftStatus: 'saved' })
      expect(core.progress.getProgress(course.id)?.currentLessonId).toBe(lesson8.id)
      expect(readFileSync(originalPath, 'utf8')).toBe('# 原资料\n\n第九课明确内容')
    } finally {
      searchDatabase.close()
      workspace.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
