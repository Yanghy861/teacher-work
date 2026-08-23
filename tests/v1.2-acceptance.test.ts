import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { AiGateway } from '../src/main/ai/ai-gateway'
import type { AiSettingsService } from '../src/main/ai/ai-settings-service'
import { BackupRestoreService } from '../src/main/backup/backup-service'
import { CoreDataService } from '../src/main/data/core-data-service'
import { DraftService } from '../src/main/draft/draft-service'
import { ManagedFileService } from '../src/main/files/managed-file-service'
import { openSearchDatabase, type SearchDatabase } from '../src/main/search/search-database'
import { SearchService } from '../src/main/search/search-service'
import { SkillService } from '../src/main/skills/skill-service'
import { WorkspaceActivityGate } from '../src/main/workspace/activity-gate'
import { initializeWorkspace, type WorkspaceHandle } from '../src/main/workspace/workspace-service'
import { buildCourseSummaries, listTodayAttendance, suggestConfirmedDecision } from '../src/renderer/course-view-model'

describe('V12-05 V1.2 end-to-end acceptance', () => {
  it('preserves the flexible teaching flow, prep boundaries and local-first data through restore', async () => {
    const root = mkdtempSync(join(tmpdir(), 'teacher-workbench-v12-05-'))
    const installPath = join(root, 'install')
    let workspace: WorkspaceHandle | undefined = initializeWorkspace(join(root, 'workspace'), installPath)
    let searchDatabase: SearchDatabase | undefined = openSearchDatabase(workspace.paths)
    let restoredWorkspace: WorkspaceHandle | undefined
    let restoredSearchDatabase: SearchDatabase | undefined

    try {
      let core = new CoreDataService(workspace.database.raw)
      let files = new ManagedFileService(workspace.database.raw, workspace.paths)
      let search = new SearchService(workspace.database.raw, searchDatabase.raw, workspace.paths)

      const first = core.createStudent('学生甲')
      const second = core.createStudent('学生乙')
      const course = core.createCourse({
        title: 'V1.2 验收班课',
        mode: 'class',
        studentIds: [first.id, second.id],
      })
      const autumn = core.nodes.createPeriod(course.id, '2026 秋季')
      const lesson8 = core.nodes.createLesson(autumn.id, '第八课')
      const lesson9 = core.nodes.createLesson(autumn.id, '第九课')
      const lesson10 = core.nodes.createLesson(autumn.id, '第十课')
      const spring = core.nodes.createPeriod(course.id, '2027 春季')
      const lesson11 = core.nodes.createLesson(spring.id, '第一课')
      core.progress.startPeriod(course.id, autumn.id, lesson8.id)

      const localNow = new Date(2026, 7, 23, 23, 50)
      core.attendance.updateLessonSchedule(lesson8.id, new Date(2026, 7, 23, 23, 55).toISOString())
      core.attendance.updateLessonSchedule(lesson9.id, new Date(2026, 7, 24, 0, 5).toISOString())
      expect(listTodayAttendance(core.getOverview(), localNow).map((item) => item.lesson.id)).toEqual([lesson8.id])

      const staleRoster = core.attendance.getLessonAttendance(lesson9.id)
      expect(new Set(staleRoster.students.map((student) => student.studentId))).toEqual(new Set([
        first.id,
        second.id,
      ]))
      const third = core.createStudent('学生丙')
      core.linkStudentToCourse(course.id, third.id)
      expect(() => core.attendance.saveLessonAttendance(
        lesson9.id,
        staleRoster.students.map((student) => ({ studentId: student.studentId, status: 'present' })),
      )).toThrowError(expect.objectContaining({ code: 'ATTENDANCE_ROSTER_CHANGED' }))

      const freshRoster = core.attendance.getLessonAttendance(lesson9.id)
      core.attendance.saveLessonAttendance(lesson9.id, freshRoster.students.map((student, index) => ({
        studentId: student.studentId,
        status: index === 1 ? 'leave' : 'present',
      })))
      core.attendance.saveLessonAttendance(lesson9.id, freshRoster.students.map((student, index) => ({
        studentId: student.studentId,
        status: index === 2 ? 'absent' : 'present',
      })))
      expect(core.progress.getProgress(course.id)?.currentLessonId).toBe(lesson8.id)

      const originalPath = join(root, 'v12-source.md')
      const originalBody = '# V1.2 独立资料\n\n只用于第九课，不覆盖原件。'
      writeFileSync(originalPath, originalBody, 'utf8')
      const material = files.importFile(originalPath)
      const lessonCopy = files.copyToLesson(material.id, lesson9.id)
      const historicalStudentCopy = files.copyToStudent(material.id, first.id)
      search.indexFile({
        id: lessonCopy.id,
        originalName: lessonCopy.originalName,
        contentHash: 'v12-lesson-copy-hash',
        chunks: [{ text: 'V1.2 独立资料 第九课检索内容', position: { type: 'heading', value: 'V1.2 独立资料' } }],
        status: 'indexed',
      })

      const manual = core.createNote(first.id, '人工记录：第九课学习稳定', lesson9.id)
      search.indexNote({ id: manual.id, title: '人工学习记录', bodyMd: manual.bodyMd })
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
        requestText: async () => ({ text: '# 第九课讲义\n\n老师可编辑的验收草稿。', model: 'v12-fake-model' }),
      } as unknown as AiGateway
      const drafts = new DraftService(
        core,
        search,
        gateway,
        settings,
        new SkillService(workspace.database.raw),
      )
      const generated = await drafts.generate({
        requestId: 'v12-05-prep-lesson-9',
        kind: 'lecture',
        lessonId: lesson9.id,
        sources: [{ fileId: lessonCopy.id }],
        maxChars: 1000,
        maxTokens: 500,
      })
      const saved = drafts.saveToLesson({ noteId: generated.noteId, bodyMd: '# 第九课已编辑讲义' })
      expect(saved).toMatchObject({ lessonId: lesson9.id, draftStatus: 'saved' })
      expect(core.progress.getProgress(course.id)?.currentLessonId).toBe(lesson8.id)
      expect(readFileSync(originalPath, 'utf8')).toBe(originalBody)

      const confirmedNinth = core.progress.confirmLessonTaught({
        courseId: course.id,
        lessonId: lesson9.id,
        expectedCurrentLessonId: lesson8.id,
        decision: { type: 'keep' },
      })
      expect(confirmedNinth.progress.currentLessonId).toBe(lesson8.id)
      const beforeEighth = core.getOverview()
      const summary = buildCourseSummaries(beforeEighth).find((item) => item.course.id === course.id)
      expect(summary).toBeDefined()
      expect(suggestConfirmedDecision(beforeEighth, summary!, lesson8.id)).toEqual({
        type: 'set',
        lessonId: lesson10.id,
      })
      core.progress.confirmLessonTaught({
        courseId: course.id,
        lessonId: lesson8.id,
        expectedCurrentLessonId: lesson8.id,
        decision: { type: 'set', lessonId: lesson10.id },
      })
      core.progress.confirmLessonTaught({
        courseId: course.id,
        lessonId: lesson10.id,
        expectedCurrentLessonId: lesson10.id,
        decision: { type: 'clear' },
      })
      expect(core.progress.getProgress(course.id)).toMatchObject({
        activePeriodId: autumn.id,
        currentLessonId: null,
      })

      searchDatabase.close()
      searchDatabase = undefined
      workspace.close()
      workspace = undefined

      workspace = initializeWorkspace(join(root, 'workspace'), installPath)
      searchDatabase = openSearchDatabase(workspace.paths)
      core = new CoreDataService(workspace.database.raw)
      files = new ManagedFileService(workspace.database.raw, workspace.paths)
      search = new SearchService(workspace.database.raw, searchDatabase.raw, workspace.paths)
      expect(core.progress.getProgress(course.id)).toMatchObject({
        activePeriodId: autumn.id,
        currentLessonId: null,
      })

      core.progress.startPeriod(course.id, spring.id, lesson11.id)
      core.endCourseStudentLink(course.id, second.id)
      expect(new Set(core.attendance.getLessonAttendance(lesson9.id).students.map((student) => student.studentId))).toEqual(new Set([
        first.id,
        second.id,
        third.id,
      ]))
      core.progress.endCourse(course.id)
      const reopened = core.progress.reopenCourse(course.id)
      expect(reopened).toMatchObject({ activePeriodId: spring.id, currentLessonId: lesson11.id, endedAt: null })
      expect((await search.search({ text: '第九课检索内容' })).some((hit) => hit.fileId === lessonCopy.id)).toBe(true)
      expect((await search.search({ text: '人工记录' })).some((hit) => hit.sourceId === manual.id)).toBe(true)

      const backupPath = join(root, 'backup')
      const restoredPath = join(root, 'restored')
      const backup = new BackupRestoreService(workspace, installPath, new WorkspaceActivityGate())
      await backup.createBackup(backupPath)
      const restored = await backup.restoreBackup(backupPath, restoredPath)
      expect(restored).toMatchObject({ indexedFiles: 3, failedFiles: 0 })

      restoredWorkspace = initializeWorkspace(restoredPath, installPath)
      const restoredCore = new CoreDataService(restoredWorkspace.database.raw)
      const restoredFiles = new ManagedFileService(restoredWorkspace.database.raw, restoredWorkspace.paths).getOverview()
      expect(restoredCore.progress.getProgress(course.id)).toMatchObject({
        activePeriodId: spring.id,
        currentLessonId: lesson11.id,
        endedAt: null,
      })
      expect(restoredCore.getOverview().nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
        course.id,
        autumn.id,
        lesson8.id,
        lesson9.id,
        lesson10.id,
        spring.id,
        lesson11.id,
      ]))
      expect(restoredCore.getOverview().notes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: manual.id, bodyMd: '人工记录：第九课学习稳定' }),
        expect.objectContaining({ id: saved.id, lessonId: lesson9.id, draftStatus: 'saved' }),
      ]))
      expect(restoredFiles.links).toEqual(expect.arrayContaining([
        expect.objectContaining({ fileId: lessonCopy.id, targetType: 'lesson', targetId: lesson9.id }),
        expect.objectContaining({ fileId: historicalStudentCopy.id, targetType: 'student', targetId: first.id }),
      ]))
      expect(new Set(restoredCore.attendance.getLessonAttendance(lesson9.id).students.map((student) => student.studentId))).toEqual(new Set([
        first.id,
        second.id,
        third.id,
      ]))
      expect(restoredWorkspace.database.raw.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(restoredWorkspace.database.raw.pragma('foreign_key_check')).toEqual([])

      restoredSearchDatabase = openSearchDatabase(restoredWorkspace.paths)
      const restoredSearch = new SearchService(
        restoredWorkspace.database.raw,
        restoredSearchDatabase.raw,
        restoredWorkspace.paths,
      )
      expect((await restoredSearch.search({ text: '独立资料' })).some((hit) => hit.fileId === lessonCopy.id)).toBe(true)
      expect((await restoredSearch.search({ text: '人工记录' })).some((hit) => hit.sourceId === manual.id)).toBe(true)
      expect(readFileSync(originalPath, 'utf8')).toBe(originalBody)
      expect(files.getOverview().files.map((file) => file.id)).toEqual(expect.arrayContaining([
        lessonCopy.id,
        historicalStudentCopy.id,
      ]))
    } finally {
      restoredSearchDatabase?.close()
      restoredWorkspace?.close()
      searchDatabase?.close()
      workspace?.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
