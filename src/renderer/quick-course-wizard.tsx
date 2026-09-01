import { useMemo } from 'react'

import type { CoreOverview, CourseMode, StudentRecord } from '../shared/core-contracts'
import { useQuickCourseWizardOrchestration } from './quick-course-wizard-orchestration'
import {
  formatLessonPreviewTitle,
  QUICK_COURSE_LESSON_LIMIT_MESSAGE,
  validateQuickCourseStep,
  type QuickCourseWizardState,
  type QuickLessonMode,
  type QuickRosterEntry,
  type RosterResolution,
} from './quick-course-wizard-model'

const wizardSteps = ['课程与学生', '阶段与课次', '上课安排', '检查并创建'] as const

export default function QuickCourseWizardBasics({
  overview,
  busy = false,
  initialState,
  initialRosterText,
  confirmDiscard,
  onClose,
  onDraftChange,
  onContinueToSchedule,
}: {
  readonly overview: CoreOverview
  readonly busy?: boolean
  readonly initialState?: QuickCourseWizardState
  readonly initialRosterText?: string
  readonly confirmDiscard?: () => boolean | Promise<boolean>
  readonly onClose: () => void
  readonly onDraftChange?: (state: QuickCourseWizardState) => void
  readonly onContinueToSchedule: (state: QuickCourseWizardState) => void
}): React.JSX.Element {
  const orchestration = useQuickCourseWizardOrchestration({
    overview,
    initialState,
    initialRosterText,
    lessonInputFallbackMessage: '输入无效。',
    confirmDiscard,
    onClose,
    onDraftChange,
  })
  const { state, rosterText, emptyCountText, planText, lessonInputError, duplicateEntry, step } = orchestration
  const validation = useMemo(
    () => validateQuickCourseStep(state, step),
    [state, step],
  )

  function continueToSchedule(): void {
    const stepValidation = validateQuickCourseStep(state, 2)
    if (!stepValidation.valid || lessonInputError !== '') return
    const next = { ...state, currentStep: 3 as const }
    orchestration.commitState(next)
    onContinueToSchedule(next)
  }

  return (
    <div className="modal-backdrop quick-course-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) void orchestration.requestClose()
    }}>
      <section
        className="quick-course-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-course-title"
      >
        <header className="quick-course-heading">
          <h2 id="quick-course-title">快速建课</h2>
          <button className="modal-close" type="button" aria-label="关闭" onClick={() => void orchestration.requestClose()}>×</button>
        </header>

        <ol className="quick-course-steps" aria-label="快速建课步骤">
          {wizardSteps.map((label, index) => {
            const number = index + 1
            const active = number === step
            const completed = number < step
            return (
              <li
                className={`${active ? 'is-active' : ''}${completed ? ' is-completed' : ''}`}
                key={label}
                aria-current={active ? 'step' : undefined}
              >
                <span>{number}</span>
                <strong>{label}</strong>
              </li>
            )
          })}
        </ol>

        <div className="quick-course-body">
          {step === 1 ? (
            <CourseStudentsStep
              overview={overview}
              state={state}
              rosterText={rosterText}
              busy={busy}
              onCourseTitleChange={(courseTitle) => orchestration.updateState({ courseTitle })}
              onModeChange={orchestration.updateMode}
              onRosterTextChange={orchestration.updateRoster}
              onOpenDuplicate={orchestration.setDuplicateEntry}
            />
          ) : (
            <PeriodLessonsStep
              state={state}
              emptyCountText={emptyCountText}
              planText={planText}
              inputError={lessonInputError}
              busy={busy}
              onPeriodTitleChange={(periodTitle) => orchestration.updateState({ periodTitle })}
              onLessonModeChange={orchestration.selectLessonMode}
              onEmptyCountChange={orchestration.updateEmptyLessons}
              onPlanTextChange={orchestration.updateTeachingPlan}
            />
          )}
        </div>

        <footer className="quick-course-footer">
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={step === 1 ? () => void orchestration.requestClose() : () => orchestration.updateState({ currentStep: 1 })}
          >
            {step === 1 ? '取消' : '上一步'}
          </button>
          <div>
            {!validation.valid && (
              <span className="quick-course-footer-error" role="status">
                {validation.issues[0]}
              </span>
            )}
            <button
              className="primary-button"
              type="button"
              disabled={busy || !validation.valid || lessonInputError !== ''}
              onClick={step === 1 ? orchestration.goToLessons : continueToSchedule}
            >
              下一步
            </button>
          </div>
        </footer>

        {duplicateEntry !== null && (
          <DuplicateStudentDialog
            overview={overview}
            entry={duplicateEntry}
            busy={busy}
            onCancel={() => orchestration.setDuplicateEntry(null)}
            onResolve={(resolution) => orchestration.resolveDuplicate(duplicateEntry, resolution)}
          />
        )}
      </section>
    </div>
  )
}

export function CourseStudentsStep({
  overview,
  state,
  rosterText,
  busy,
  onCourseTitleChange,
  onModeChange,
  onRosterTextChange,
  onOpenDuplicate,
}: {
  readonly overview: CoreOverview
  readonly state: QuickCourseWizardState
  readonly rosterText: string
  readonly busy: boolean
  readonly onCourseTitleChange: (value: string) => void
  readonly onModeChange: (mode: CourseMode) => void
  readonly onRosterTextChange: (value: string) => void
  readonly onOpenDuplicate: (entry: QuickRosterEntry) => void
}): React.JSX.Element {
  return (
    <div className="quick-course-two-column">
      <section className="quick-course-form-panel">
        <h3>课程信息</h3>
        <label>
          课程名称 *
          <input
            autoFocus
            value={state.courseTitle}
            disabled={busy}
            onChange={(event) => onCourseTitleChange(event.target.value)}
            placeholder="例如：初二数学秋季班"
          />
        </label>
        <fieldset className="quick-course-segmented" disabled={busy}>
          <legend>课程类型 *</legend>
          <label className={state.mode === 'class' ? 'is-active' : ''}>
            <input
              type="radio"
              name="quick-course-mode"
              checked={state.mode === 'class'}
              onChange={() => onModeChange('class')}
            />
            班课
          </label>
          <label className={state.mode === 'one_to_one' ? 'is-active' : ''}>
            <input
              type="radio"
              name="quick-course-mode"
              checked={state.mode === 'one_to_one'}
              onChange={() => onModeChange('one_to_one')}
            />
            一对一
          </label>
        </fieldset>
        <label>
          学生名单（可选，一行一个）
          <textarea
            value={rosterText}
            disabled={busy}
            rows={10}
            onChange={(event) => onRosterTextChange(event.target.value)}
            placeholder={'张三\n李四\n王五'}
          />
        </label>
        <p className="quick-course-help">
          已有学生会直接关联；不存在的学生会在最终事务中自动创建。学生也可以在课程创建后再关联。
        </p>
        {state.roster.duplicateInputNames.length > 0 && (
          <p className="quick-course-warning" role="status">
            已忽略名单中的重复行：{state.roster.duplicateInputNames.join('、')}
          </p>
        )}
      </section>

      <section className="quick-course-preview-panel" aria-label="学生解析结果">
        <header>
          <div>
            <h3>学生解析</h3>
            <p>共 {state.roster.entries.length} 位</p>
          </div>
          {state.mode === 'one_to_one' && state.roster.entries.length > 1 && (
            <span className="quick-status is-error">一对一最多 1 位</span>
          )}
        </header>
        <div className="quick-roster-list">
          {state.roster.entries.map((entry) => {
            const resolution = entry.resolution
            const resolvedStudent = resolution?.type === 'existing'
              ? overview.students.find((student) => student.id === resolution.studentId)
              : undefined
            return (
              <article className="quick-roster-row" key={entry.name}>
                <div>
                  <strong>{entry.name}</strong>
                  {entry.sourceLineNumbers.length > 1 && (
                    <small>名单中出现 {entry.sourceLineNumbers.length} 次，已合并</small>
                  )}
                </div>
                {entry.resolution === null ? (
                  <button className="quick-status is-warning" type="button" onClick={() => onOpenDuplicate(entry)}>
                    重名待确认
                  </button>
                ) : entry.resolution.type === 'new' ? (
                  <span className="quick-status is-new">
                    {entry.candidates.length > 1 ? '新建同名学生' : '新建并关联'}
                  </span>
                ) : (
                  <button
                    className="quick-status is-existing"
                    type="button"
                    disabled={entry.candidates.length < 2}
                    onClick={() => onOpenDuplicate(entry)}
                    title={entry.candidates.length > 1 ? '修改重名选择' : undefined}
                  >
                    已有 · {resolvedStudent?.name ?? entry.name}
                  </button>
                )}
              </article>
            )
          })}
          {state.roster.entries.length === 0 && (
            <div className="quick-course-empty">
              暂不关联学生也可以继续。创建后仍可从课程学生区添加。
            </div>
          )}
        </div>
        {state.roster.entries.some((entry) => entry.resolution === null) && (
          <p className="quick-course-warning">请先处理重名学生，才能进入下一步。</p>
        )}
      </section>
    </div>
  )
}

export function PeriodLessonsStep({
  state,
  emptyCountText,
  planText,
  inputError,
  busy,
  onPeriodTitleChange,
  onLessonModeChange,
  onEmptyCountChange,
  onPlanTextChange,
}: {
  readonly state: QuickCourseWizardState
  readonly emptyCountText: string
  readonly planText: string
  readonly inputError: string
  readonly busy: boolean
  readonly onPeriodTitleChange: (value: string) => void
  readonly onLessonModeChange: (mode: QuickLessonMode) => void
  readonly onEmptyCountChange: (value: string) => void
  readonly onPlanTextChange: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="quick-course-two-column">
      <section className="quick-course-form-panel">
        <h3>阶段与课次</h3>
        <label>
          阶段名称 *
          <input
            value={state.periodTitle}
            disabled={busy}
            onChange={(event) => onPeriodTitleChange(event.target.value)}
            placeholder="例如：2026 秋季"
          />
        </label>
        <fieldset className="quick-course-segmented" disabled={busy}>
          <legend>建立课次的方式</legend>
          <label className={state.lessonMode === 'empty' ? 'is-active' : ''}>
            <input
              type="radio"
              name="quick-lesson-mode"
              checked={state.lessonMode === 'empty'}
              onChange={() => onLessonModeChange('empty')}
            />
            生成空课次
          </label>
          <label className={state.lessonMode === 'plan' ? 'is-active' : ''}>
            <input
              type="radio"
              name="quick-lesson-mode"
              checked={state.lessonMode === 'plan'}
              onChange={() => onLessonModeChange('plan')}
            />
            粘贴教学计划
          </label>
        </fieldset>
        {state.lessonMode === 'empty' ? (
          <label>
            预计课次数（1–100）
            <input
              type="number"
              min="1"
              max="100"
              value={emptyCountText}
              disabled={busy}
              onChange={(event) => onEmptyCountChange(event.target.value)}
            />
          </label>
        ) : (
          <label>
            教学计划（一行一个主题，最多 100 个）
            <textarea
              value={planText}
              disabled={busy}
              rows={12}
              onChange={(event) => onPlanTextChange(event.target.value)}
              placeholder={'有理数\n整式\n一元一次方程\n几何图形初步'}
            />
          </label>
        )}
        <p className="quick-course-help">
          现在不知道每节内容也没关系，空课次会保存为“未命名”，备课时再修改。
        </p>
        {inputError !== '' && (
          <p className="quick-course-warning" role="alert">
            {inputError === QUICK_COURSE_LESSON_LIMIT_MESSAGE
              ? QUICK_COURSE_LESSON_LIMIT_MESSAGE
              : inputError}
          </p>
        )}
      </section>

      <section className="quick-course-preview-panel" aria-label="课次预览">
        <header>
          <div>
            <h3>课次预览</h3>
            <p>共 {state.lessons.length} 节课</p>
          </div>
          <span className="quick-status is-existing">{state.periodTitle.trim() || '未命名阶段'}</span>
        </header>
        <ol className="quick-lesson-preview-list">
          {state.lessons.map((lesson, index) => (
            <li key={lesson.key}>
              <span>{index + 1}</span>
              <strong>{formatLessonPreviewTitle(lesson, index)}</strong>
            </li>
          ))}
        </ol>
        {state.lessons.length === 0 && (
          <div className="quick-course-empty">输入有效课次数或教学计划后，这里会立即生成预览。</div>
        )}
      </section>
    </div>
  )
}

export function DuplicateStudentDialog({
  overview,
  entry,
  busy,
  onCancel,
  onResolve,
}: {
  readonly overview: CoreOverview
  readonly entry: QuickRosterEntry
  readonly busy: boolean
  readonly onCancel: () => void
  readonly onResolve: (resolution: RosterResolution) => void
}): React.JSX.Element {
  return (
    <div className="quick-duplicate-backdrop" role="presentation">
      <section className="quick-duplicate-dialog" role="dialog" aria-modal="true" aria-label={`确认同名学生 ${entry.name}`}>
        <header>
          <div>
            <h3>发现多个“{entry.name}”</h3>
            <p>请选择已有学生，或明确创建一个新的同名学生。</p>
          </div>
          <button className="modal-close" type="button" aria-label="关闭重名确认" onClick={onCancel}>×</button>
        </header>
        <div className="quick-duplicate-list">
          {entry.candidates.map((candidate) => (
            <StudentCandidateCard
              key={candidate.id}
              overview={overview}
              student={candidate}
              busy={busy}
              selected={entry.resolution?.type === 'existing' && entry.resolution.studentId === candidate.id}
              onSelect={() => onResolve({ type: 'existing', studentId: candidate.id })}
            />
          ))}
          <button
            className="quick-duplicate-new"
            type="button"
            disabled={busy}
            onClick={() => onResolve({ type: 'new' })}
          >
            <strong>创建新的同名学生“{entry.name}”</strong>
            <span>不会合并或恢复任何已有档案</span>
          </button>
        </div>
        <footer className="modal-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>取消</button>
        </footer>
      </section>
    </div>
  )
}

function StudentCandidateCard({
  overview,
  student,
  busy,
  selected,
  onSelect,
}: {
  readonly overview: CoreOverview
  readonly student: StudentRecord
  readonly busy: boolean
  readonly selected: boolean
  readonly onSelect: () => void
}): React.JSX.Element {
  const courseById = new Map(
    overview.nodes.filter((node) => node.kind === 'course').map((course) => [course.id, course]),
  )
  const links = overview.courseStudentLinks.filter((link) => link.studentId === student.id)
  const activeCourses = links
    .filter((link) => link.endedAt === null)
    .flatMap((link) => courseById.get(link.courseId)?.title ?? [])
  const historicalCourses = links
    .filter((link) => link.endedAt !== null)
    .flatMap((link) => courseById.get(link.courseId)?.title ?? [])
  const latestManualNote = overview.notes
    .filter((note) => note.studentId === student.id && (note.noteKind === undefined || note.noteKind === 'manual'))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
  return (
    <button
      className={`quick-duplicate-candidate${selected ? ' is-selected' : ''}`}
      type="button"
      disabled={busy}
      onClick={onSelect}
    >
      <span className="quick-avatar">{student.name.slice(0, 1)}</span>
      <span>
        <strong>{student.name}</strong>
        <small>在读课程：{activeCourses.join('、') || '无'}</small>
        <small>历史课程：{historicalCourses.join('、') || '无'}</small>
        <small>最近人工记录：{latestManualNote?.updatedAt.slice(0, 10) ?? '无'}</small>
      </span>
      <em>{selected ? '已选择' : '选择'}</em>
    </button>
  )
}
