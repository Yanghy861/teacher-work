import { useEffect, useMemo, useRef, useState } from 'react'

import type { CoreOverview, NoteRecord } from '../shared/core-contracts'
import type { ManagedFileOverview } from '../shared/file-contracts'
import {
  DRAFT_DEFAULT_MAX_CHARS,
  DRAFT_DEFAULT_MAX_TOKENS,
  DRAFT_KINDS,
  type DraftKind,
} from '../shared/draft-contracts'
import {
  listLessonPrepFiles,
  reconcileSelectedLessonFileIds,
  type LessonPrepContext,
} from './lesson-prep-context'

const kindLabels: Record<DraftKind, string> = {
  lecture: '讲义',
  example: '例题',
  homework: '作业',
}

export default function DraftPanel({
  context,
  onBackToCourses,
  onBrowseExternal,
  onBrowseMaterials,
}: {
  readonly context: LessonPrepContext | null
  readonly onBackToCourses: () => void
  readonly onBrowseExternal: () => void
  readonly onBrowseMaterials: () => void
}): React.JSX.Element {
  const [files, setFiles] = useState<ManagedFileOverview | null>(null)
  const [core, setCore] = useState<CoreOverview | null>(null)
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [busyKind, setBusyKind] = useState<DraftKind | ''>('')
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const knownLessonFileIds = useRef<Set<string>>(new Set())

  const lessonFiles = useMemo(() => {
    if (files === null || context === null) return []
    return listLessonPrepFiles(files, context.lessonId)
  }, [context, files])
  const lessonFileKey = lessonFiles.map((file) => file.id).join('|')
  const selectedFiles = lessonFiles.filter((file) => selectedFileIds.includes(file.id))
  const lessonNotes = useMemo(
    () => core?.notes.filter((note) =>
      context !== null && note.lessonId === context.lessonId && note.noteKind !== undefined,
    ) ?? [],
    [context, core],
  )

  useEffect(() => {
    knownLessonFileIds.current = new Set()
    setSelectedFileIds([])
    setEditing({})
    if (context !== null) void reload()
  }, [context?.lessonId])

  useEffect(() => {
    const currentSet = new Set(lessonFiles.map((file) => file.id))
    const previousKnown = knownLessonFileIds.current
    setSelectedFileIds((current) =>
      reconcileSelectedLessonFileIds(current, previousKnown, lessonFiles),
    )
    knownLessonFileIds.current = currentSet
  }, [lessonFileKey])

  async function reload(): Promise<void> {
    try {
      const [nextFiles, nextCore] = await Promise.all([
        window.teacherWorkbench.files.getOverview(),
        window.teacherWorkbench.core.getOverview(),
      ])
      setFiles(nextFiles)
      setCore(nextCore)
      setError('')
    } catch (loadError) {
      setError(toErrorMessage(loadError))
    }
  }

  function toggleFile(fileId: string): void {
    setSelectedFileIds((current) => current.includes(fileId)
      ? current.filter((id) => id !== fileId)
      : [...current, fileId])
  }

  async function generate(kind: DraftKind): Promise<void> {
    if (context === null || selectedFiles.length === 0) {
      setError('请先从当前课次资料中选择至少一份资料。')
      return
    }
    setBusyKind(kind)
    setMessage(`正在生成${kindLabels[kind]}…`)
    setError('')
    try {
      const result = await window.teacherWorkbench.drafts.generate({
        requestId: globalThis.crypto.randomUUID(),
        kind,
        lessonId: context.lessonId,
        ...(context.studentId === undefined ? {} : { studentId: context.studentId }),
        sources: selectedFiles.map((file) => ({ fileId: file.id })),
        maxChars: DRAFT_DEFAULT_MAX_CHARS,
        maxTokens: DRAFT_DEFAULT_MAX_TOKENS,
      })
      setMessage(`${kindLabels[kind]}已生成并保存到当前课次草稿。`)
      setEditing((current) => ({ ...current, [result.noteId]: result.bodyMd }))
      await reload()
    } catch (generationError) {
      setMessage('')
      setError(toErrorMessage(generationError))
    } finally {
      setBusyKind('')
    }
  }

  async function saveNote(note: NoteRecord): Promise<void> {
    const body = editing[note.id] ?? note.bodyMd
    if (body.trim() === '') {
      setError('草稿内容不能为空。')
      return
    }
    try {
      await window.teacherWorkbench.core.updateNote({ noteId: note.id, bodyMd: body })
      setMessage('草稿修改已保存。')
      await reload()
    } catch (saveError) {
      setError(toErrorMessage(saveError))
    }
  }

  if (context === null) {
    return (
      <section className="workspace-card prep-empty-state" aria-live="polite">
        <div className="placeholder-icon" aria-hidden="true">✦</div>
        <h2>请先选择一个课次</h2>
        <p>从“我的课程”进入具体课次后点击“开始备课”，不需要另外选择学生。</p>
        <button className="primary-button" type="button" onClick={onBackToCourses}>
          返回我的课程
        </button>
      </section>
    )
  }

  return (
    <section className="lesson-prep-panel" aria-label="当前课次备课">
      {error !== '' && <div className="inline-error" role="alert">{error}</div>}
      {message !== '' && <div className="inline-notice" role="status">{message}</div>}

      <div className="prep-context-bar">
        <div>
          <p className="section-kicker">当前课次</p>
          <h2>{context.courseTitle} / {context.lessonTitle}</h2>
        </div>
        <span className="selection-label">
          {formatStudentContext(context)}
        </span>
      </div>

      <div className="lesson-prep-layout">
        <aside className="workspace-card prep-materials-panel">
          <div className="card-heading">
            <div>
              <p className="section-kicker">已复制到本课</p>
              <h2>本次备课资料</h2>
            </div>
            <span className="count-label">{lessonFiles.length} 份</span>
          </div>
          <ul className="prep-material-list">
            {lessonFiles.map((file) => (
              <li key={file.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedFileIds.includes(file.id)}
                    onChange={() => toggleFile(file.id)}
                  />
                  <span>
                    <strong>{file.originalName}</strong>
                    <small>{file.contentHash === null ? '正在准备文本' : '可用于生成'}</small>
                  </span>
                </label>
              </li>
            ))}
            {files === null && <li className="empty-state">正在读取本次资料…</li>}
            {files !== null && lessonFiles.length === 0 && (
              <li className="empty-state">还没有本次备课资料，请从下方添加。</li>
            )}
          </ul>
          <div className="prep-source-actions">
            <button className="secondary-button" type="button" onClick={onBrowseExternal}>
              从外部资料添加
            </button>
            <button className="secondary-button" type="button" onClick={onBrowseMaterials}>
              从素材库添加
            </button>
          </div>
        </aside>

        <div className="prep-workspace-column">
          <section className="workspace-card">
            <div className="card-heading">
              <div>
                <p className="section-kicker">固定 AI 动作</p>
                <h2>AI 备课</h2>
              </div>
              <span className="selection-label">已选 {selectedFiles.length} 份</span>
            </div>
            <p className="prep-guidance">
              本阶段使用当前课次和已勾选资料生成；Skill 与本次要求将在下一里程碑接入。
            </p>
            <div className="prep-generate-actions">
              {([DRAFT_KINDS.lecture, DRAFT_KINDS.example, DRAFT_KINDS.homework] as DraftKind[]).map((kind) => (
                <button
                  key={kind}
                  className={kind === 'lecture' ? 'primary-button' : 'secondary-button'}
                  type="button"
                  onClick={() => void generate(kind)}
                  disabled={busyKind !== '' || selectedFiles.length === 0}
                >
                  {busyKind === kind ? '生成中…' : `生成${kindLabels[kind]}`}
                </button>
              ))}
            </div>
          </section>

          <section className="workspace-card">
            <div className="card-heading">
              <div>
                <p className="section-kicker">当前课次</p>
                <h2>生成结果</h2>
              </div>
              <span className="count-label">{lessonNotes.length} 份</span>
            </div>
            <div className="draft-note-list">
              {lessonNotes.map((note) => (
                <article className="draft-note" key={note.id}>
                  <div className="card-heading">
                    <strong>{kindLabels[note.noteKind as DraftKind]}</strong>
                    <small>{note.createdAt.slice(0, 10)}</small>
                  </div>
                  <textarea
                    value={editing[note.id] ?? note.bodyMd}
                    onChange={(event) => setEditing((current) => ({
                      ...current,
                      [note.id]: event.target.value,
                    }))}
                    rows={8}
                  />
                  <button className="secondary-button" type="button" onClick={() => void saveNote(note)}>
                    保存修改
                  </button>
                </article>
              ))}
              {lessonNotes.length === 0 && (
                <p className="empty-state">当前课次还没有生成结果。</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  )
}

function formatStudentContext(context: LessonPrepContext): string {
  if (context.courseMode === 'class') {
    return context.studentNames.length === 0
      ? '班课 · 无需选择学生'
      : `班课 · ${context.studentNames.length} 位关联学生`
  }
  return context.studentNames.length === 0
    ? '一对一 · 暂无关联学生'
    : `一对一 · ${context.studentNames.join('、')}`
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ''
    ? error.message
    : '操作失败，请稍后重试。'
}
