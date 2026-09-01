import { useEffect, useMemo, useState } from 'react'

import type { NodeRecord, NoteRecord } from '../shared/core-contracts'
import type { ManagedFileOverview } from '../shared/file-contracts'
import {
  classifyLessonCoursewareFiles,
  filterLessonMaterialFiles,
  isSelectableLessonPrepFile,
  listLessonPrepFiles,
  type LessonPrepContext,
} from './lesson-prep-context'
import LessonMaterialReader from './lesson-material-reader'
import { useAppDialog } from './app-confirm-dialog'
import type { PrepLaunchIntent } from './teaching-content-context'
import { toErrorMessage } from './ui-utils'

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
  readonly onStartPrep: (context: LessonPrepContext, intent?: PrepLaunchIntent) => void
  readonly onOpenDraft: (context: LessonPrepContext, noteId: string) => void
}): React.JSX.Element {
  const { confirm } = useAppDialog()
  const [overview, setOverview] = useState<ManagedFileOverview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedFileId, setSelectedFileId] = useState('')
  const lessonFiles = useMemo(
    () => overview === null || lesson === null ? [] : filterLessonMaterialFiles(
      listLessonPrepFiles(overview, lesson.id),
      { lessonLabel: lesson.lessonLabel, periodTitle },
    ),
    [lesson, overview, periodTitle],
  )
  const classifiedFiles = useMemo(() => classifyLessonCoursewareFiles(lessonFiles), [lessonFiles])
  const currentVersionFile = classifiedFiles.currentVersion
  const historyFiles = classifiedFiles.history
  const displayFiles = classifiedFiles.currentMaterials
  const hasCourseware = displayFiles.some(isSelectableLessonPrepFile)
  const selectedFile = displayFiles.find((file) => file.id === selectedFileId) ?? null
  const canModifySelectedFile = selectedFile !== null && isSelectableLessonPrepFile(selectedFile)

  useEffect(() => {
    if (currentVersionFile !== null && selectedFileId === '') {
      setSelectedFileId(currentVersionFile.id)
    }
  }, [currentVersionFile, selectedFileId])

  useEffect(() => {
    setSelectedFileId(currentVersionFile?.id ?? '')
    void reload()
  }, [lesson?.id])

  useEffect(() => window.teacherWorkbench.files.onContentChanged(() => { void reload() }), [])

  async function reload(): Promise<void> {
    try {
      setOverview(await window.teacherWorkbench.files.getOverview())
      setError('')
    } catch (loadError) {
      setError(toErrorMessage(loadError, '课次资料读取失败，请稍后重试。'))
    }
  }

  async function openFile(fileId: string, reveal = false): Promise<void> {
    setBusy(true)
    setError('')
    try {
      if (reveal) await window.teacherWorkbench.files.showFileInFolder({ fileId })
      else await window.teacherWorkbench.files.openFile({ fileId })
    } catch (openError) {
      setError(toErrorMessage(openError, '课次资料读取失败，请稍后重试。'))
    } finally {
      setBusy(false)
    }
  }

  async function removeFile(fileId: string): Promise<void> {
    if (lesson === null) return
    const file = lessonFiles.find((candidate) => candidate.id === fileId)
    if (file === undefined) return
    const confirmed = await confirm({
      title: '从本课移除资料？',
      description: <>“{file.originalName}”将从“{lesson.title}”移除。<br />只移除本课的独立副本，不会影响素材库原件或外部资料。</>,
      confirmLabel: '从本课移除',
      destructive: true,
    })
    if (!confirmed) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await window.teacherWorkbench.files.softDeleteFile({ fileId })
      setSelectedFileId('')
      await reload()
      setNotice(`已从本课移除“${file.originalName}”。`)
    } catch (removeError) {
      setError(toErrorMessage(removeError, '课次资料读取失败，请稍后重试。'))
    } finally {
      setBusy(false)
    }
  }

  function openNewPrep(): void {
    if (prepContext === null) return
    if (draft === null) onStartPrep(prepContext, { mode: 'new' })
    else onOpenDraft(prepContext, draft.id)
  }

  function modifySelectedFile(): void {
    if (prepContext === null || selectedFile === null || !isSelectableLessonPrepFile(selectedFile)) return
    onStartPrep(prepContext, { mode: 'single', targetFileId: selectedFile.id })
  }

  function rebuildLesson(): void {
    if (prepContext === null) return
    onStartPrep(prepContext, { mode: 'lesson' })
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
      {notice !== '' && <div className="inline-notice" role="status">{notice}</div>}
      <header className="lesson-files-header">
        <div>
          <p className="section-kicker">本课课件</p>
          <h3>{periodTitle === '' ? lesson.title : `${periodTitle} · ${lesson.title}`}</h3>
          <p>只显示当前课次课件；正文引用的图片和素材挂在对应文档下面，原始文件不会被改写。</p>
        </div>
        <div className="lesson-files-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void reload()}>刷新</button>
          {onToggleImmersive !== undefined && <button className="secondary-button" type="button" onClick={onToggleImmersive}>{immersive ? '退出沉浸阅读' : '沉浸阅读'}</button>}
          {!readOnly && !hasCourseware && <button className="primary-button" type="button" disabled={busy} onClick={openNewPrep}>{draft === null ? 'AI 新建备课' : '继续上次备课'}</button>}
          {!readOnly && hasCourseware && draft !== null && <button className="secondary-button" type="button" disabled={busy} onClick={() => prepContext !== null && onOpenDraft(prepContext, draft.id)}>继续上次修改</button>}
          {!readOnly && hasCourseware && <button className="primary-button" type="button" disabled={busy || !canModifySelectedFile} title={canModifySelectedFile ? `修改${selectedFile.originalName}` : '请选择一份可读文档'} onClick={modifySelectedFile}>✦ 修改这份</button>}
          {!readOnly && hasCourseware && <button className="secondary-button" type="button" disabled={busy} onClick={rebuildLesson}>整课重做</button>}
        </div>
      </header>
      {overview === null ? (
        <div className="material-reader-state">正在读取本课次资料…</div>
      ) : (
        <LessonMaterialReader
          files={displayFiles}
          selectedFileId={selectedFileId}
          onSelectFile={setSelectedFileId}
          onOpenFile={(fileId) => { void openFile(fileId) }}
          onShowInFolder={(fileId) => { void openFile(fileId, true) }}
          onRemoveFile={readOnly ? undefined : (fileId) => { void removeFile(fileId) }}
          hideTree={immersive}
          treeTitle={lesson.title}
        />
      )}
      {historyFiles.length > 0 && (
        <details className="lesson-history-block">
          <summary>🕘 历史版本（{historyFiles.length}）——点开可系统打开查看，旧版永不丢失</summary>
          <ul className="lesson-history-list">
            {historyFiles.map((file) => (
              <li key={file.id}>
                <span>{file.originalName}</span>
                <button className="secondary-button" type="button" onClick={() => { void openFile(file.id) }}>系统打开</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
