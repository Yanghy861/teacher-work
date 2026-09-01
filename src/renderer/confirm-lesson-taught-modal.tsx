import { useMemo, useState } from 'react'

import type { CoreOverview, CurrentLessonDecision, NodeRecord } from '../shared/core-contracts'
import {
  getLessonNumber,
  listValidCurrentLessons,
  suggestConfirmedDecision,
  type CourseSummary,
} from './course-view-model'
import Modal from './modal'
import { toErrorMessage } from './ui-utils'

export default function ConfirmLessonTaughtModal({
  overview,
  summary,
  lesson,
  onClose,
  onSaved,
}: {
  readonly overview: CoreOverview
  readonly summary: CourseSummary
  readonly lesson: NodeRecord
  readonly onClose: () => void
  readonly onSaved: (message: string) => Promise<void>
}): React.JSX.Element {
  const initialDecision = useMemo(
    () => suggestConfirmedDecision(overview, summary, lesson.id),
    [lesson.id, overview, summary],
  )
  const [choice, setChoice] = useState(encodeDecision(initialDecision))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const validTargets = listValidCurrentLessons(overview, summary, lesson.id)
  const confirmingCurrent = summary.currentLesson?.id === lesson.id

  async function confirm(): Promise<void> {
    setSaving(true)
    setError('')
    try {
      const result = await window.teacherWorkbench.core.confirmLessonTaught({
        courseId: summary.course.id,
        lessonId: lesson.id,
        expectedCurrentLessonId: summary.progress?.currentLessonId ?? null,
        decision: decodeDecision(choice),
      })
      await onSaved(
        result.status === 'already_confirmed'
          ? '本课此前已经确认，原确认时间和当前课次均未改变。'
          : '已确认本课已上，并保存老师选择的下一步。',
      )
      onClose()
    } catch (saveError) {
      setError(toErrorMessage(saveError, '操作失败，请稍后重试。'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`确认「${lesson.title}」已上`}
      description="确认会记录实际上课时间；点名记录与此操作相互独立。"
      onClose={onClose}
    >
      {error !== '' && <div className="inline-error" role="alert">{error}</div>}
      <label className="modal-field">
        确认后的 Current Lesson
        <select value={choice} disabled={saving} onChange={(event) => setChoice(event.target.value)}>
          {!confirmingCurrent && (
            <option value="keep">保持原 Current Lesson 不变</option>
          )}
          <option value="clear">暂不设置下一课</option>
          {validTargets.map((target) => (
            <option key={target.id} value={`set:${target.id}`}>{formatLesson(summary, target)}</option>
          ))}
        </select>
      </label>
      <p className="modal-hint">系统只预选建议，最终按这里显示的明确决定保存；不会跨阶段自动推进。</p>
      <footer className="modal-actions">
        <button className="secondary-button" type="button" disabled={saving} onClick={onClose}>取消</button>
        <button className="primary-button" type="button" disabled={saving} onClick={() => void confirm()}>
          {saving ? '确认中…' : '确认'}
        </button>
      </footer>
    </Modal>
  )
}

function encodeDecision(decision: CurrentLessonDecision): string {
  return decision.type === 'set' ? `set:${decision.lessonId}` : decision.type
}

function decodeDecision(value: string): CurrentLessonDecision {
  if (value === 'keep') return { type: 'keep' }
  if (value === 'clear') return { type: 'clear' }
  if (value.startsWith('set:') && value.length > 4) return { type: 'set', lessonId: value.slice(4) }
  throw new Error('下一课选择无效。')
}

function formatLesson(summary: CourseSummary, lesson: NodeRecord): string {
  const period = summary.periods.find((candidate) => candidate.id === lesson.parentId)
  const number = lesson.parentId === null ? 0 : getLessonNumber(summary.lessons, lesson.parentId, lesson.id)
  return `${period?.title ?? '未命名阶段'} · 第 ${number} 课 ${lesson.title}`
}
