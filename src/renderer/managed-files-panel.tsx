import { useEffect, useMemo, useState } from 'react'

import type { CoreOverview } from '../shared/core-contracts'
import type { ManagedFileOverview, ManagedFileRecord } from '../shared/file-contracts'

interface ManagedFilesPanelProps {
  readonly compact?: boolean
  readonly heading?: string
  readonly lessonId?: string
  readonly lessonLabel?: string
  readonly studentId?: string
  readonly studentLabel?: string
}

export default function ManagedFilesPanel({
  compact = false,
  heading = '素材库',
  lessonId,
  lessonLabel,
  studentId,
  studentLabel,
}: ManagedFilesPanelProps): React.JSX.Element {
  const [overview, setOverview] = useState<ManagedFileOverview | null>(null)
  const [coreOverview, setCoreOverview] = useState<CoreOverview | null>(null)
  const [selectedLessonId, setSelectedLessonId] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const lessons = useMemo(
    () => coreOverview?.nodes.filter((node) => node.kind === 'lesson') ?? [],
    [coreOverview],
  )
  const students = coreOverview?.students ?? []
  const activeLessonId = lessonId ?? selectedLessonId
  const activeStudentId = studentId ?? selectedStudentId
  const files = overview?.files ?? []
  const activeFiles = files.filter((file) => file.deletedAt === null)
  const deletedFiles = files.filter((file) => file.deletedAt !== null)

  useEffect(() => {
    void reload()
  }, [])

  useEffect(() => {
    const unsubscribe = window.teacherWorkbench.files.onContentChanged((event) => {
      setNotice(`已检测到「${event.file.originalName}」的外部更新，资料列表已刷新。`)
      void reload()
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (lessonId === undefined && (selectedLessonId === '' || !lessons.some((lesson) => lesson.id === selectedLessonId))) {
      setSelectedLessonId(lessons[0]?.id ?? '')
    }
  }, [lessonId, lessons, selectedLessonId])

  useEffect(() => {
    if (studentId === undefined && (selectedStudentId === '' || !students.some((student) => student.id === selectedStudentId))) {
      setSelectedStudentId(students[0]?.id ?? '')
    }
  }, [selectedStudentId, studentId, students])

  async function reload(): Promise<void> {
    setLoading(true)
    try {
      const [nextFiles, nextCore] = await Promise.all([
        window.teacherWorkbench.files.getOverview(),
        compact ? Promise.resolve(null) : window.teacherWorkbench.core.getOverview(),
      ])
      setOverview(nextFiles)
      if (nextCore !== null) {
        setCoreOverview(nextCore)
      }
      setError('')
    } catch (loadError) {
      setError(toErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }

  async function runAction(action: () => Promise<unknown>, successMessage?: string): Promise<void> {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      if (successMessage !== undefined) {
        setNotice(successMessage)
      }
      await reload()
    } catch (actionError) {
      setError(toErrorMessage(actionError))
    } finally {
      setBusy(false)
    }
  }

  function importFile(): void {
    void runAction(async () => {
      const imported = await window.teacherWorkbench.files.importFromPicker()
      if (imported === null) {
        setNotice('已取消导入。')
      }
    })
  }

  if (loading && overview === null) {
    return <section className="workspace-card">正在读取资料…</section>
  }

  return (
    <div className={`managed-files-panel${compact ? ' is-compact' : ''}`} aria-live="polite">
      {error !== '' && <div className="inline-error" role="alert">{error}</div>}
      {notice !== '' && <div className="inline-notice" role="status">{notice}</div>}

      <section className="workspace-card">
        <div className="card-heading">
          <div>
            <p className="section-kicker">资料管理</p>
            <h2>{heading}</h2>
          </div>
          <div className="file-toolbar">
            <button className="secondary-button" type="button" onClick={() => void reload()} disabled={busy}>
              刷新资料
            </button>
            <button className="primary-button" type="button" onClick={importFile} disabled={busy}>
              导入资料
            </button>
          </div>
        </div>

        {!compact && (
          <div className="file-target-grid">
            <label className="select-field">
              加入当前课次
              <select
                aria-label="加入当前课次"
                value={selectedLessonId}
                onChange={(event) => setSelectedLessonId(event.target.value)}
                disabled={busy || lessons.length === 0}
              >
                {lessons.length === 0 && <option value="">暂无课次</option>}
                {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
              </select>
            </label>
            <label className="select-field">
              添加学生附件
              <select
                aria-label="添加学生附件"
                value={selectedStudentId}
                onChange={(event) => setSelectedStudentId(event.target.value)}
                disabled={busy || students.length === 0}
              >
                {students.length === 0 && <option value="">暂无学生</option>}
                {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
              </select>
            </label>
          </div>
        )}

        {compact && (
          <p className="file-context">
            当前课次：{lessonLabel ?? (activeLessonId === '' ? '未选择' : '已选择')} · 当前学生：{studentLabel ?? (activeStudentId === '' ? '未选择' : '已选择')}
          </p>
        )}

        <FileList
          files={activeFiles}
          deletedFiles={deletedFiles}
          busy={busy}
          lessonId={activeLessonId}
          studentId={activeStudentId}
          onAction={runAction}
        />
      </section>
    </div>
  )
}

function FileList({
  files,
  deletedFiles,
  busy,
  lessonId,
  studentId,
  onAction,
}: {
  readonly files: readonly ManagedFileRecord[]
  readonly deletedFiles: readonly ManagedFileRecord[]
  readonly busy: boolean
  readonly lessonId: string
  readonly studentId: string
  readonly onAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>
}): React.JSX.Element {
  return (
    <>
      <ul className="file-list">
        {files.map((file) => (
          <li className="file-row" key={file.id}>
            <FileSummary file={file} />
            <div className="file-actions">
              <button className="link-button" type="button" onClick={() => void onAction(() => window.teacherWorkbench.files.openFile({ fileId: file.id }))} disabled={busy}>
                打开
              </button>
              <button className="link-button" type="button" onClick={() => void onAction(() => window.teacherWorkbench.files.showFileInFolder({ fileId: file.id }))} disabled={busy}>
                所在文件夹
              </button>
              <button className="link-button" type="button" onClick={() => void onAction(() => window.teacherWorkbench.files.copyToLesson({ fileId: file.id, lessonId }), '已加入当前课次。')} disabled={busy || lessonId === ''}>
                加入课次
              </button>
              <button className="link-button" type="button" onClick={() => void onAction(() => window.teacherWorkbench.files.copyToStudent({ fileId: file.id, studentId }), '已添加学生附件。')} disabled={busy || studentId === ''}>
                加到学生
              </button>
              <button className="danger-button" type="button" onClick={() => void onAction(() => window.teacherWorkbench.files.softDeleteFile({ fileId: file.id }), '资料已移除。')} disabled={busy}>
                移除
              </button>
            </div>
          </li>
        ))}
        {files.length === 0 && <li className="empty-state">素材库中还没有可用资料。</li>}
      </ul>
      {deletedFiles.length > 0 && (
        <details className="deleted-files">
          <summary>已移除资料（{deletedFiles.length}）</summary>
          <ul className="file-list">
            {deletedFiles.map((file) => (
              <li className="file-row is-deleted" key={file.id}>
                <FileSummary file={file} />
                <button className="link-button" type="button" onClick={() => void onAction(() => window.teacherWorkbench.files.restoreFile({ fileId: file.id }), '资料已恢复。')} disabled={busy}>
                  恢复
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

function FileSummary({ file }: { readonly file: ManagedFileRecord }): React.JSX.Element {
  const source = file.originFileId === null ? '素材库导入' : `副本来源 ${file.originFileId.slice(0, 8)}`
  const verification = file.contentHash === null ? '待核对' : '已核对'
  return (
    <div className="file-summary">
      <strong>{file.originalName}</strong>
      <small>{formatBytes(file.sizeBytes)} · {source} · {verification}</small>
    </div>
  )
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : '资料操作失败，请稍后重试。'
}
