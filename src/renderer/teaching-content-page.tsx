import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { CoreOverview, NodeRecord } from '../shared/core-contracts'
import LessonFilesSection from './lesson-files-section'
import { buildCourseSummaries, type CourseSummary } from './course-view-model'
import { createLessonPrepContext, type LessonPrepContext } from './lesson-prep-context'
import DraftPanel from './draft-panel'
import {
  type PrepLaunchIntent,
  type TeachingContentSection,
  type TeachingContentTarget,
} from './teaching-content-context'

export default function TeachingContentPage({
  target,
  initialDraftId: externalInitialDraftId,
  onTargetChange,
  onBackToCourses,
  onBackToStudent,
  onOpenExternal,
  onOpenMaterials,
}: {
  readonly target: TeachingContentTarget | null
  readonly initialDraftId: string | null
  readonly onTargetChange: (target: TeachingContentTarget) => void
  readonly onBackToCourses: (target: TeachingContentTarget) => void
  readonly onBackToStudent: (studentId: string) => void
  readonly onOpenExternal: (context: LessonPrepContext) => void
  readonly onOpenMaterials: (context: LessonPrepContext) => void
}): React.JSX.Element {
  const [overview, setOverview] = useState<CoreOverview | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [initialDraftId, setInitialDraftId] = useState<string | null>(externalInitialDraftId)
  const [immersive, setImmersive] = useState(false)
  const [error, setError] = useState('')
  const prepDirtyRef = useRef(false)
  const handlePrepDirtyChange = useCallback((value: boolean) => {
    prepDirtyRef.current = value
  }, [])

  function confirmLeavePrep(): boolean {
    if (target?.section !== 'prep' || !prepDirtyRef.current) return true
    return window.confirm('AI 备课中有未保存的修改，离开后将丢失本次编辑。确定离开吗？')
  }

  useEffect(() => {
    let cancelled = false
    void window.teacherWorkbench.core.getOverview()
      .then((nextOverview) => {
        if (!cancelled) {
          setOverview(nextOverview)
          setError('')
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(toErrorMessage(loadError))
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setInitialDraftId(externalInitialDraftId)
  }, [externalInitialDraftId])

  const summaries = useMemo(
    () => overview === null ? [] : buildCourseSummaries(overview),
    [overview],
  )
  const summary = target?.courseId === null || target === null
    ? null
    : summaries.find((candidate) => candidate.course.id === target.courseId) ?? null
  const lesson = summary === null || target?.lessonId === null || target === null
    ? null
    : summary.lessons.find((candidate) => candidate.id === target.lessonId) ?? null
  const period = lesson === null || summary === null
    ? null
    : summary.periods.find((candidate) => candidate.id === lesson.parentId) ?? null
  const prepContext = summary === null || lesson === null
    ? null
    : createLessonPrepContext(summary.course, lesson, summary.activeStudents, period?.title)
  const draft = overview === null || lesson === null ? null : latestDraftForLesson(overview, lesson.id)
  const positionLabel = summary === null || lesson === null
    ? '尚未选择课次'
    : `${summary.course.title} / ${period?.title ?? '未分组'} / ${lesson.title}`

  function setSection(section: TeachingContentSection): void {
    if (target?.section === 'prep' && section !== 'prep' && !confirmLeavePrep()) return
    prepDirtyRef.current = false
    if (target === null) {
      onTargetChange({ courseId: null, lessonId: null, section })
      return
    }
    setInitialDraftId(null)
    setImmersive(false)
    onTargetChange({ ...target, section })
  }

  function selectLesson(course: CourseSummary, selectedLesson: NodeRecord): void {
    if (!confirmLeavePrep()) return
    prepDirtyRef.current = false
    setInitialDraftId(null)
    setImmersive(false)
    onTargetChange({
      courseId: course.course.id,
      lessonId: selectedLesson.id,
      section: target?.section === 'drafts' ? 'courseware' : target?.section ?? 'courseware',
      ...(target?.originStudentId === undefined ? {} : { originStudentId: target.originStudentId }),
    })
    setDrawerOpen(false)
  }

  function moveLesson(offset: -1 | 1): void {
    if (summary === null || lesson === null) return
    const index = summary.lessons.findIndex((candidate) => candidate.id === lesson.id)
    const nextLesson = summary.lessons[index + offset]
    if (nextLesson !== undefined) selectLesson(summary, nextLesson)
  }

  function openPrep(context: LessonPrepContext, intent?: PrepLaunchIntent): void {
    if (!confirmLeavePrep()) return
    prepDirtyRef.current = false
    setInitialDraftId(null)
    onTargetChange({
      courseId: context.courseId,
      lessonId: context.lessonId,
      section: 'prep',
      ...(intent === undefined ? {} : { prepMode: intent.mode }),
      ...(intent?.targetFileId === undefined ? {} : { prepTargetFileId: intent.targetFileId }),
      ...(target?.originStudentId === undefined ? {} : { originStudentId: target.originStudentId }),
    })
  }

  function openDraft(context: LessonPrepContext, noteId: string): void {
    if (!confirmLeavePrep()) return
    prepDirtyRef.current = false
    setInitialDraftId(noteId)
    onTargetChange({
      courseId: context.courseId,
      lessonId: context.lessonId,
      section: 'prep',
      ...(target?.originStudentId === undefined ? {} : { originStudentId: target.originStudentId }),
    })
  }

  if (overview === null) {
    return <section className="workspace-card">{error === '' ? '正在读取教学内容…' : error}</section>
  }

  return (
    <div className="teaching-content-page" aria-live="polite">
      {error !== '' && <div className="inline-error" role="alert">{error}</div>}
      <header className="teaching-content-header">
        <div className="teaching-content-context">
          <span className="section-kicker">{target?.section === 'prep' ? 'AI 修改' : '教学内容'}</span>
          <h1>{positionLabel}</h1>
          <p>{target?.section === 'drafts' && target.courseId === null ? '所有课次的 AI 修改节点' : '浏览和处理当前课次的教学内容，不会改变 Current Lesson。'}</p>
        </div>
        <div className="teaching-content-header-actions">
          {target?.originStudentId !== undefined && (
            <button className="link-button" type="button" onClick={() => { if (confirmLeavePrep()) onBackToStudent(target.originStudentId!) }}>返回学生</button>
          )}
          <button className="secondary-button" type="button" onClick={() => setDrawerOpen(true)}>切换课程 / 课次</button>
          {target !== null && target.lessonId !== null && (
            <>
              <button className="link-button" type="button" onClick={() => moveLesson(-1)}>上一课</button>
              <button className="link-button" type="button" onClick={() => moveLesson(1)}>下一课</button>
            </>
          )}
          {target?.section === 'prep' && <button className="link-button" type="button" onClick={() => { if (confirmLeavePrep()) setSection('courseware') }}>退出修改，回到课件</button>}
          {target?.courseId !== null && target?.courseId !== undefined && target?.section !== 'prep' && <button className="link-button" type="button" onClick={() => { if (confirmLeavePrep()) onBackToCourses(target) }}>返回课程</button>}
        </div>
      </header>

      {target?.section !== 'prep' && (
        <nav className="teaching-content-tabs" aria-label="教学内容分区">
          {([['courseware', '课件'], ['drafts', '修改记录']] as const).map(([section, label]) => (
            <button className={target?.section === section ? 'is-active' : ''} type="button" key={section} onClick={() => setSection(section)}>{label}</button>
          ))}
        </nav>
      )}

      {target?.section === 'drafts' ? (
        <DraftPanel
          context={null}
          initialDraftId={null}
          onOpenDraft={openDraft}
          onBackToCourses={() => target === null ? undefined : onBackToCourses(target)}
          onBrowseExternal={() => undefined}
          onBrowseMaterials={() => undefined}
        />
      ) : prepContext === null || lesson === null ? (
        <TeachingContentEmpty onChoose={() => setDrawerOpen(true)} />
      ) : summary?.ended && target?.section === 'prep' ? (
        <section className="teaching-content-empty workspace-card"><h2>历史课程只读</h2><p>已结束课程可以继续浏览已有课件，但不能在这里开始新的备课。</p><button className="secondary-button" type="button" onClick={() => setSection('courseware')}>查看课件</button></section>
      ) : target?.section === 'prep' ? (
        <DraftPanel
          context={prepContext}
          initialDraftId={initialDraftId}
          launchIntent={target?.prepMode === undefined ? undefined : {
            mode: target.prepMode,
            ...(target.prepTargetFileId === undefined ? {} : { targetFileId: target.prepTargetFileId }),
          }}
          onOpenDraft={openDraft}
          onBrowseExternal={() => onOpenExternal(prepContext)}
          onBrowseMaterials={() => onOpenMaterials(prepContext)}
          onOpenCourseware={() => setSection('courseware')}
          onDirtyChange={handlePrepDirtyChange}
          onBackToCourses={() => { if (confirmLeavePrep()) onBackToCourses(target) }}
        />
      ) : (
        <LessonFilesSection
          lesson={lesson}
          periodTitle={period?.title ?? ''}
          prepContext={prepContext}
          draft={draft}
          readOnly={summary?.ended ?? false}
          immersive={immersive}
          onToggleImmersive={() => setImmersive((current) => !current)}
          onStartPrep={openPrep}
          onOpenDraft={openDraft}
        />
      )}

      {drawerOpen && (
        <TeachingContentDrawer
          summaries={summaries}
          selectedCourseId={target?.courseId ?? ''}
          selectedLessonId={target?.lessonId ?? ''}
          onSelectLesson={selectLesson}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  )
}

function TeachingContentEmpty({ onChoose }: { readonly onChoose: () => void }): React.JSX.Element {
  return (
    <section className="teaching-content-empty workspace-card">
      <h2>选择课程 / 课次</h2>
      <p>教学内容会在本次会话中记住最近位置；浏览课件和备课不会改变课程进度。</p>
      <button className="primary-button" type="button" onClick={onChoose}>选择课程 / 课次</button>
    </section>
  )
}

function TeachingContentDrawer({ summaries, selectedCourseId, selectedLessonId, onSelectLesson, onClose }: {
  readonly summaries: readonly CourseSummary[]
  readonly selectedCourseId: string
  readonly selectedLessonId: string
  readonly onSelectLesson: (summary: CourseSummary, lesson: NodeRecord) => void
  readonly onClose: () => void
}): React.JSX.Element {
  return (
    <div className="teaching-content-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="teaching-content-drawer" aria-label="选择课程和课次">
        <header><div><span className="section-kicker">临时选择</span><h2>课程 / 课次</h2></div><button className="modal-close" type="button" aria-label="关闭课程课次选择" onClick={onClose}>×</button></header>
        <div className="teaching-content-drawer-list">
          {summaries.map((summary) => (
            <section key={summary.course.id} className={summary.course.id === selectedCourseId ? 'is-selected' : ''}>
              <strong>{summary.course.title}</strong>
              {summary.periods.map((period) => (
                <div key={period.id} className="teaching-content-period">
                  <span>{period.title}</span>
                  {summary.lessons.filter((lesson) => lesson.parentId === period.id).map((lesson) => (
                    <button className={lesson.id === selectedLessonId ? 'is-selected' : ''} type="button" key={lesson.id} onClick={() => onSelectLesson(summary, lesson)}>
                      <small>{lesson.lessonLabel ?? '课次'}</small><span>{lesson.title}</span>
                    </button>
                  ))}
                </div>
              ))}
              {summary.lessons.length === 0 && <p className="empty-state">还没有课次。</p>}
            </section>
          ))}
          {summaries.length === 0 && <p className="empty-state">还没有可用课程。</p>}
        </div>
      </aside>
    </div>
  )
}

function latestDraftForLesson(overview: CoreOverview, lessonId: string) {
  return overview.notes
    .filter((note) => note.lessonId === lessonId && note.deletedAt === null && note.draftStatus === 'draft')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : '教学内容读取失败，请稍后重试。'
}
