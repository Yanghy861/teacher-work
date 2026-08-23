import { useEffect, useMemo, useState } from 'react'

import type { NodeRecord, NoteRecord } from '../shared/core-contracts'
import type { ManagedFileOverview } from '../shared/file-contracts'
import { listLessonPrepFiles, type LessonPrepContext } from './lesson-prep-context'

export default function LessonFilesSection({
  lesson,
  periodTitle,
  prepContext,
  draft,
  onStartPrep,
  onOpenDraft,
}: {
  readonly lesson: NodeRecord | null
  readonly periodTitle: string
  readonly prepContext: LessonPrepContext | null
  readonly draft: NoteRecord | null
  readonly onStartPrep: (context: LessonPrepContext) => void
  readonly onOpenDraft: (context: LessonPrepContext, noteId: string) => void
}): React.JSX.Element {
  const [overview, setOverview] = useState<ManagedFileOverview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lessonFiles = useMemo(
    () => overview === null || lesson === null ? [] : listLessonPrepFiles(overview, lesson.id),
    [lesson, overview],
  )

  useEffect(() => { void reload() }, [lesson?.id])

  useEffect(() => window.teacherWorkbench.files.onContentChanged(() => { void reload() }), [])

  async function reload(): Promise<void> {
    try {
      setOverview(await window.teacherWorkbench.files.getOverview())
      setError('')
    } catch (loadError) {
      setError(toErrorMessage(loadError))
    }
  }

  async function openFile(fileId: string, reveal = false): Promise<void> {
    setBusy(true)
    setError('')
    try {
      if (reveal) await window.teacherWorkbench.files.showFileInFolder({ fileId })
      else await window.teacherWorkbench.files.openFile({ fileId })
    } catch (openError) {
      setError(toErrorMessage(openError))
    } finally {
      setBusy(false)
    }
  }

  function openPrep(): void {
    if (prepContext === null) return
    if (draft === null) onStartPrep(prepContext)
    else onOpenDraft(prepContext, draft.id)
  }

  if (lesson === null) {
    return (
      <div className="lesson-files-section lesson-files-empty">
        <h3>课次资料</h3>
        <p>请先选择一个课次查看资料。</p>
      </div>
    )
  }

  return (
    <div className="lesson-files-section" aria-live="polite">
      {error !== '' && <div className="inline-error" role="alert">{error}</div>}
      <header className="lesson-files-header">
        <div>
          <p className="section-kicker">Viewed Lesson 资料</p>
          <h3>{periodTitle === '' ? lesson.title : `${periodTitle} · ${lesson.title}`}</h3>
          <p>这里只显示本课次的 lesson_files，不包含整门课程资料或学生文件。</p>
        </div>
        <div className="lesson-files-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void reload()}>刷新</button>
          <button className="primary-button" type="button" disabled={busy} onClick={openPrep}>
            {draft === null ? '开始备课' : '继续备课'}
          </button>
        </div>
      </header>
      <ul className="lesson-file-list">
        {lessonFiles.map((file) => (
          <li key={file.id}>
            <div>
              <strong>{file.originalName}</strong>
              <small>{formatBytes(file.sizeBytes)} · {file.contentHash === null ? '待完成文本准备' : '内容已核对'}</small>
            </div>
            <div className="lesson-file-actions">
              <button className="link-button" type="button" disabled={busy} onClick={() => void openFile(file.id)}>打开</button>
              <button className="link-button" type="button" disabled={busy} onClick={() => void openFile(file.id, true)}>所在文件夹</button>
            </div>
          </li>
        ))}
        {overview === null && <li className="empty-state">正在读取本课次资料…</li>}
        {overview !== null && lessonFiles.length === 0 && (
          <li className="empty-state">本课次还没有资料。进入本次备课后，可从外部资料或素材库添加独立副本。</li>
        )}
      </ul>
    </div>
  )
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : '课次资料读取失败，请稍后重试。'
}
