import { useEffect, useMemo, useState } from 'react'

import type {
  AttendanceStatus,
  LessonAttendanceRecord,
} from '../shared/core-contracts'
import { formatLocalDateTime } from './course-view-model'
import Modal from './modal'

const attendanceOptions: readonly { readonly value: AttendanceStatus; readonly label: string }[] = [
  { value: 'present', label: '到课' },
  { value: 'leave', label: '请假' },
  { value: 'absent', label: '缺席' },
]

export default function LessonAttendanceModal({
  lessonId,
  courseTitle,
  lessonTitle,
  onClose,
  onSaved,
}: {
  readonly lessonId: string
  readonly courseTitle: string
  readonly lessonTitle: string
  readonly onClose: () => void
  readonly onSaved: (message: string) => Promise<void>
}): React.JSX.Element {
  const [record, setRecord] = useState<LessonAttendanceRecord | null>(null)
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus | undefined>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    void window.teacherWorkbench.attendance.getLesson({ lessonId })
      .then((nextRecord) => {
        if (!active) return
        setRecord(nextRecord)
        setStatuses(Object.fromEntries(nextRecord.students.map((student) => [
          student.studentId,
          student.status ?? undefined,
        ])))
        setError('')
      })
      .catch((loadError: unknown) => active && setError(toErrorMessage(loadError)))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [lessonId])

  const complete = useMemo(
    () => record !== null && record.students.length > 0 && record.students.every(
      (student) => statuses[student.studentId] !== undefined,
    ),
    [record, statuses],
  )

  async function save(): Promise<void> {
    if (record === null || !complete) return
    setSaving(true)
    setError('')
    try {
      await window.teacherWorkbench.attendance.saveLesson({
        lessonId,
        entries: record.students.map((student) => ({
          studentId: student.studentId,
          status: statuses[student.studentId] as AttendanceStatus,
        })),
      })
      await onSaved(record.attendanceRecordedAt === null ? '点名已保存。' : '点名已更新。')
      onClose()
    } catch (saveError) {
      setError(toErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={record?.attendanceRecordedAt === null ? '点名' : '修改点名'}
      description={`${courseTitle} · ${lessonTitle}`}
      onClose={onClose}
      wide
    >
      {error !== '' && <div className="inline-error" role="alert">{error}</div>}
      {loading ? (
        <p className="modal-loading">正在读取学生名单…</p>
      ) : record === null ? null : (
        <>
          <div className="attendance-toolbar">
            <span>上课时间：{formatLocalDateTime(record.scheduledAt)}</span>
            <button
              className="secondary-button"
              type="button"
              disabled={saving || record.students.length === 0}
              onClick={() => setStatuses(Object.fromEntries(
                record.students.map((student) => [student.studentId, 'present']),
              ))}
            >
              全部到课
            </button>
          </div>
          <div className="attendance-list">
            {record.students.map((student) => (
              <div className="attendance-row" key={student.studentId}>
                <strong>{student.studentName}</strong>
                <div className="attendance-options" role="radiogroup" aria-label={`${student.studentName}出勤状态`}>
                  {attendanceOptions.map((option) => (
                    <label key={option.value}>
                      <input
                        type="radio"
                        name={`attendance-${student.studentId}`}
                        value={option.value}
                        checked={statuses[student.studentId] === option.value}
                        disabled={saving}
                        onChange={() => setStatuses((current) => ({
                          ...current,
                          [student.studentId]: option.value,
                        }))}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {record.students.length === 0 && (
              <p className="empty-state">未关联学生，无法保存点名。请先在课程学生页关联在读学生。</p>
            )}
          </div>
          <footer className="modal-actions">
            <button className="secondary-button" type="button" disabled={saving} onClick={onClose}>取消</button>
            <button className="primary-button" type="button" disabled={saving || !complete} onClick={() => void save()}>
              {saving ? '保存中…' : '保存点名'}
            </button>
          </footer>
        </>
      )}
    </Modal>
  )
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : '操作失败，请稍后重试。'
}
