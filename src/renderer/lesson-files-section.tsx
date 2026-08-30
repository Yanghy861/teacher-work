import { useEffect, useMemo, useState } from 'react'

import type { NodeRecord, NoteRecord } from '../shared/core-contracts'
import type { ManagedFileOverview } from '../shared/file-contracts'
import { filterLessonMaterialFiles, listLessonPrepFiles, type LessonPrepContext } from './lesson-prep-context'
import LessonMaterialReader from './lesson-material-reader'

// Legacy V1.2 boundary retained: 不包含整门课程资料或学生文件。

export default function LessonFilesSection({
  lesson,
  periodTitle,
  prepContext,
  draft,
  readOnly = false,
  immersive = false,
  onToggleImmersive,
  onStartPrep,
  onOpenDraft,
}: {
  readonly lesson: NodeRecord | null
  readonly periodTitle: string
  readonly prepContext: LessonPrepContext | null
  readonly draft: NoteRecord | null
  readonly readOnly?: boolean
  readonly immersive?: boolean
  readonly onToggleImmersive?: () => void
  readonly onStartPrep: (context: LessonPrepContext) => void
  readonly onOpenDraft: (context: LessonPrepContext, noteId: string) => void
}): React.JSX.Element {
  const [overview, setOverview] = useState<ManagedFileOverview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectedFileId, setSelectedFileId] = useState('')
  const lessonFiles = useMemo(
    () => overview === null || lesson === null ? [] : filterLessonMaterialFiles(
      listLessonPrepFiles(overview, lesson.id),
      { lessonLabel: lesson.lessonLabel, periodTitle },
    ),
    [lesson, overview, periodTitle],
  )
  const hasCourseware = lessonFiles.length > 0

  useEffect(() => {
    setSelectedFileId('')
    void reload()
  }, [lesson?.id])

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
    <div className={`lesson-files-section${immersive ? ' is-immersive' : ''}`} aria-live="polite">
      {error !== '' && <div className="inline-error" role="alert">{error}</div>}
      <header className="lesson-files-header">
        <div>
          <p className="section-kicker">本课课件</p>
          <h3>{periodTitle === '' ? lesson.title : `${periodTitle} · ${lesson.title}`}</h3>
          <p>只显示当前课次课件；正文引用的图片和素材挂在对应文档下面，原始文件不会被改写。</p>
        </div>
        <div className="lesson-files-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void reload()}>刷新</button>
          {onToggleImmersive !== undefined && <button className="secondary-button" type="button" onClick={onToggleImmersive}>{immersive ? '退出沉浸阅读' : '沉浸阅读'}</button>}
          {!readOnly && <button className="primary-button" type="button" disabled={busy} onClick={openPrep}>{hasCourseware ? '✦ AI 修改' : 'AI 新建备课'}</button>}
        </div>
      </header>
      {overview === null ? (
        <div className="material-reader-state">正在读取本课次资料…</div>
      ) : (
        <LessonMaterialReader
          files={lessonFiles}
          selectedFileId={selectedFileId}
          onSelectFile={setSelectedFileId}
          onOpenFile={(fileId) => { void openFile(fileId) }}
          onShowInFolder={(fileId) => { void openFile(fileId, true) }}
          hideTree={immersive}
          treeTitle={lesson.title}
        />
      )}
    </div>
  )
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : '课次资料读取失败，请稍后重试。'
}
