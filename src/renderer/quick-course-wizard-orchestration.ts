import { useState } from 'react'

import type { CourseMode, CoreOverview } from '../shared/core-contracts'
import { useAppDialog } from './app-confirm-dialog'
import {
  buildEmptyLessons,
  createInitialQuickCourseWizardState,
  parseStudentRoster,
  parseTeachingPlan,
  resolveRosterDuplicate,
  validateQuickCourseStep,
  type QuickCourseWizardState,
  type QuickLessonMode,
  type QuickRosterEntry,
  type RosterResolution,
} from './quick-course-wizard-model'
import { toErrorMessage } from './ui-utils'

/** 步骤 1–2 共享编排输入；排课/检查等 full 向导特有状态不在其内。 */
export interface QuickCourseWizardOrchestrationOptions {
  readonly overview: CoreOverview
  readonly initialState?: QuickCourseWizardState
  readonly initialRosterText?: string
  /** 空课次/教学计划的默认时长（分钟）；basics 向导不传（保持无时长）。 */
  readonly lessonDurationMinutes?: () => number | null
  /** 课次输入失败时的回退文案（两向导历史上各自不同，逐向导传入原值）。 */
  readonly lessonInputFallbackMessage: string
  /** 外部关闭确认（full 向导传入集成宿主的 confirm）；缺省走应用对话框。 */
  readonly confirmDiscard?: () => boolean | Promise<boolean>
  readonly onClose: () => void
  /** 步骤 1–2 之外的草稿上报（basics 向导的 onDraftChange）。 */
  readonly onDraftChange?: (state: QuickCourseWizardState) => void
  /** 每次提交新状态时的通知（full 向导用于清除提交错误）。 */
  readonly onStateCommitted?: (state: QuickCourseWizardState) => void
}

/** 两个快速建课向导共享的步骤 1–2 编排（状态、花名册、课次输入、关闭确认）。 */
export interface QuickCourseWizardOrchestration {
  readonly state: QuickCourseWizardState
  readonly rosterText: string
  readonly emptyCountText: string
  readonly planText: string
  readonly lessonInputError: string
  readonly duplicateEntry: QuickRosterEntry | null
  readonly step: 1 | 2
  readonly isValidStep: boolean
  readonly requestClose: () => Promise<void>
  readonly updateState: (patch: Partial<QuickCourseWizardState>) => void
  readonly commitState: (next: QuickCourseWizardState) => void
  readonly updateRoster: (value: string) => void
  readonly updateMode: (mode: CourseMode) => void
  readonly resolveDuplicate: (entry: QuickRosterEntry, resolution: RosterResolution) => void
  readonly goToLessons: () => void
  readonly selectLessonMode: (mode: QuickLessonMode) => void
  readonly updateEmptyLessons: (value: string) => void
  readonly updateTeachingPlan: (value: string) => void
  readonly setDuplicateEntry: (entry: QuickRosterEntry | null) => void
  readonly setEmptyCountText: (value: string) => void
}

export function useQuickCourseWizardOrchestration(
  options: QuickCourseWizardOrchestrationOptions,
): QuickCourseWizardOrchestration {
  const { confirm } = useAppDialog()
  const [state, setState] = useState<QuickCourseWizardState>(
    options.initialState ?? createInitialQuickCourseWizardState(),
  )
  const [rosterText, setRosterText] = useState(
    options.initialRosterText ?? (options.initialState ?? state).roster.entries.map((entry) => entry.name).join('\n'),
  )
  const [emptyCountText, setEmptyCountText] = useState(
    options.initialState !== undefined && options.initialState.lessonMode === 'empty' && options.initialState.lessons.length > 0
      ? options.initialState.lessons.length.toString()
      : '16',
  )
  const [planText, setPlanText] = useState(
    options.initialState?.lessonMode === 'plan' ? options.initialState.lessons.map((lesson) => lesson.title).join('\n') : '',
  )
  const [lessonInputError, setLessonInputError] = useState('')
  const [duplicateEntry, setDuplicateEntry] = useState<QuickRosterEntry | null>(null)
  const step: 1 | 2 = state.currentStep === 1 ? 1 : 2
  const isValidStep = validateQuickCourseStep(state, step).valid

  function commitState(next: QuickCourseWizardState): void {
    setState(next)
    options.onDraftChange?.(next)
    options.onStateCommitted?.(next)
  }

  function updateState(patch: Partial<QuickCourseWizardState>): void {
    commitState({ ...state, ...patch })
  }

  async function requestClose(): Promise<void> {
    const hasContent =
      state.courseTitle.trim() !== '' ||
      rosterText.trim() !== '' ||
      state.lessons.length > 0
    if (!hasContent) {
      options.onClose()
      return
    }
    const confirmed = options.confirmDiscard !== undefined
      ? await options.confirmDiscard()
      : await confirm({
        title: '放弃快速建课？',
        description: '当前已填写的课程、学生或课次内容尚未创建，放弃后不会保留。',
        confirmLabel: '放弃并关闭',
        destructive: true,
      })
    if (confirmed) options.onClose()
  }

  function updateRoster(value: string): void {
    setRosterText(value)
    updateState({ roster: parseStudentRoster(value, options.overview.students) })
  }

  function updateMode(mode: CourseMode): void {
    updateState({ mode })
  }

  function resolveDuplicate(entry: QuickRosterEntry, resolution: RosterResolution): void {
    const roster = resolveRosterDuplicate(state.roster, entry.name, resolution)
    updateState({ roster })
    setDuplicateEntry(null)
  }

  function goToLessons(): void {
    if (!validateQuickCourseStep(state, 1).valid) return
    const hadLessons = state.lessons.length > 0
    let lessons = state.lessons
    if (!hadLessons) {
      lessons = buildEmptyLessons(16, options.lessonDurationMinutes?.() ?? null)
      setEmptyCountText('16')
    }
    commitState({ ...state, currentStep: 2, lessonMode: hadLessons ? state.lessonMode : 'empty', lessons })
  }

  function selectLessonMode(mode: QuickLessonMode): void {
    setLessonInputError('')
    if (mode === 'empty') {
      updateEmptyLessons(emptyCountText)
      return
    }
    updateTeachingPlan(planText)
  }

  function updateEmptyLessons(value: string): void {
    setEmptyCountText(value)
    const count = Number(value)
    try {
      const lessons = buildEmptyLessons(count, options.lessonDurationMinutes?.() ?? null)
      setLessonInputError('')
      updateState({ lessonMode: 'empty', lessons })
    } catch (error) {
      setLessonInputError(toErrorMessage(error, options.lessonInputFallbackMessage))
      updateState({ lessonMode: 'empty', lessons: [] })
    }
  }

  function updateTeachingPlan(value: string): void {
    setPlanText(value)
    try {
      const lessons = parseTeachingPlan(value, options.lessonDurationMinutes?.() ?? null)
      setLessonInputError('')
      updateState({ lessonMode: 'plan', lessons })
    } catch (error) {
      setLessonInputError(toErrorMessage(error, options.lessonInputFallbackMessage))
      updateState({ lessonMode: 'plan', lessons: [] })
    }
  }

  return {
    state,
    rosterText,
    emptyCountText,
    planText,
    lessonInputError,
    duplicateEntry,
    step,
    isValidStep,
    requestClose,
    updateState,
    commitState,
    updateRoster,
    updateMode,
    resolveDuplicate,
    goToLessons,
    selectLessonMode,
    updateEmptyLessons,
    updateTeachingPlan,
    setDuplicateEntry,
    setEmptyCountText,
  }
}
