import { useEffect, useMemo, useState } from 'react'

import type { CoreOverview, NoteRecord } from '../shared/core-contracts'
import type { ManagedFileOverview } from '../shared/file-contracts'
import {
  DRAFT_DEFAULT_MAX_CHARS,
  DRAFT_DEFAULT_MAX_TOKENS,
  DRAFT_KINDS,
  type DraftKind,
} from '../shared/draft-contracts'

const kindLabels: Record<DraftKind, string> = {
  lecture: '讲义',
  example: '例题',
  homework: '作业',
}

export default function DraftPanel(): React.JSX.Element {
  const [files, setFiles] = useState<ManagedFileOverview | null>(null)
  const [core, setCore] = useState<CoreOverview | null>(null)
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [fragmentFileId, setFragmentFileId] = useState('')
  const [fragmentText, setFragmentText] = useState('')
  const [studentId, setStudentId] = useState('')
  const [lessonId, setLessonId] = useState('')
  const [maxChars, setMaxChars] = useState(String(DRAFT_DEFAULT_MAX_CHARS))
  const [maxTokens, setMaxTokens] = useState(String(DRAFT_DEFAULT_MAX_TOKENS))
  const [busyKind, setBusyKind] = useState<DraftKind | ''>('')
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const activeFiles = useMemo(
    () => files?.files.filter((file) => file.deletedAt === null) ?? [],
    [files],
  )
  const lessons = useMemo(
    () => core?.nodes.filter((node) => node.kind === 'lesson' && node.deletedAt === null) ?? [],
    [core],
  )
  const students = core?.students ?? []
  const notes = core?.notes ?? []
  const selectedFiles = activeFiles.filter((file) => selectedFileIds.includes(file.id))

  useEffect(() => {
    void reload()
  }, [])

  useEffect(() => {
    if (studentId === '' || !students.some((student) => student.id === studentId)) {
      setStudentId(students[0]?.id ?? '')
    }
  }, [studentId, students])

  useEffect(() => {
    if (lessonId === '' || !lessons.some((lesson) => lesson.id === lessonId)) {
      setLessonId(lessons[0]?.id ?? '')
    }
  }, [lessonId, lessons])

  useEffect(() => {
    if (fragmentFileId === '' || !selectedFileIds.includes(fragmentFileId)) {
      setFragmentFileId(selectedFileIds[0] ?? '')
      setFragmentText('')
    }
  }, [fragmentFileId, selectedFileIds])

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
    if (selectedFiles.length === 0 || studentId === '') {
      setError('请至少选择一份资料和一位学生。')
      return
    }
    const chars = Number(maxChars)
    const tokens = Number(maxTokens)
    if (!Number.isInteger(chars) || chars <= 0 || !Number.isInteger(tokens) || tokens <= 0) {
      setError('字符上限和 token 上限必须是正整数。')
      return
    }
    setBusyKind(kind)
    setMessage(`正在生成${kindLabels[kind]}…`)
    setError('')
    try {
      const result = await window.teacherWorkbench.drafts.generate({
        requestId: globalThis.crypto.randomUUID(),
        kind,
        studentId,
        ...(lessonId === '' ? {} : { lessonId }),
        sources: selectedFiles.map((file) => file.id === fragmentFileId && fragmentText.trim() !== ''
          ? { fileId: file.id, text: fragmentText, position: { type: 'manual' } }
          : { fileId: file.id }),
        maxChars: chars,
        maxTokens: tokens,
      })
      setMessage(`${kindLabels[kind]}已保存为普通 note（${result.metadata.inputChars} 字符上下文）。`)
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
      setError('记录内容不能为空。')
      return
    }
    try {
      await window.teacherWorkbench.core.updateNote({ noteId: note.id, bodyMd: body })
      setMessage('note 已保存。')
      await reload()
    } catch (saveError) {
      setError(toErrorMessage(saveError))
    }
  }

  return (
    <section className="draft-panel" aria-label="AI 备课">
      {error && <div className="inline-error" role="alert">{error}</div>}
      {message && <div className="inline-notice" role="status">{message}</div>}

      <section className="workspace-card">
        <div className="card-heading">
          <div>
            <p className="section-kicker">有限上下文</p>
            <h2>选择资料生成草稿</h2>
          </div>
          <span className="selection-label">已选 {selectedFiles.length} 份</span>
        </div>
        <ul className="draft-file-list">
          {activeFiles.map((file) => (
            <li key={file.id} className="draft-file-option">
              <label>
                <input
                  type="checkbox"
                  checked={selectedFileIds.includes(file.id)}
                  onChange={() => toggleFile(file.id)}
                />
                <span>{file.originalName}</span>
              </label>
              <small>{file.contentHash === null ? '待核对' : '已核对'}</small>
            </li>
          ))}
          {activeFiles.length === 0 && <li className="empty-state">暂无可选资料。</li>}
        </ul>
        <div className="two-column-grid draft-controls-grid">
          <label className="select-field">
            文本片段归属
            <select value={fragmentFileId} onChange={(event) => setFragmentFileId(event.target.value)} disabled={selectedFiles.length === 0}>
              {selectedFiles.length === 0 && <option value="">先选择资料</option>}
              {selectedFiles.map((file) => <option key={file.id} value={file.id}>{file.originalName}</option>)}
            </select>
          </label>
          <label className="select-field">
            目标学生
            <select value={studentId} onChange={(event) => setStudentId(event.target.value)} disabled={students.length === 0}>
              {students.length === 0 && <option value="">暂无学生</option>}
              {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
            </select>
          </label>
        </div>
        <label className="stacked-form">
          可选文本片段（填写后只发送该片段）
          <textarea value={fragmentText} onChange={(event) => setFragmentText(event.target.value)} rows={5} placeholder="留空则使用已索引的所选文件文本。" disabled={selectedFiles.length === 0} />
        </label>
        <div className="two-column-grid draft-controls-grid">
          <label>
            字符上限
            <input type="number" min="1" max="100000" value={maxChars} onChange={(event) => setMaxChars(event.target.value)} />
          </label>
          <label>
            Token 上限
            <input type="number" min="1" max="32000" value={maxTokens} onChange={(event) => setMaxTokens(event.target.value)} />
          </label>
        </div>
        <label className="select-field">
          关联课次（可选）
          <select value={lessonId} onChange={(event) => setLessonId(event.target.value)}>
            <option value="">不关联课次</option>
            {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
          </select>
        </label>
        <div className="file-toolbar">
          {([DRAFT_KINDS.lecture, DRAFT_KINDS.example, DRAFT_KINDS.homework] as DraftKind[]).map((kind) => (
            <button key={kind} className={kind === 'lecture' ? 'primary-button' : 'secondary-button'} type="button" onClick={() => void generate(kind)} disabled={busyKind !== '' || selectedFiles.length === 0}>
              {busyKind === kind ? '生成中…' : `生成${kindLabels[kind]}`}
            </button>
          ))}
        </div>
      </section>

      <section className="workspace-card">
        <div className="card-heading">
          <div>
            <p className="section-kicker">普通 note</p>
            <h2>已保存草稿</h2>
          </div>
          <span className="count-label">{notes.filter((note) => note.noteKind !== undefined).length} 条 AI 草稿</span>
        </div>
        <div className="draft-note-list">
          {notes.filter((note) => note.noteKind !== undefined).map((note) => (
            <article className="draft-note" key={note.id}>
              <div className="card-heading">
                <strong>{kindLabels[note.noteKind as DraftKind]}</strong>
                <small>{note.aiMetadata?.model ?? '本地 note'} · {note.createdAt.slice(0, 10)}</small>
              </div>
              <textarea
                value={editing[note.id] ?? note.bodyMd}
                onChange={(event) => setEditing((current) => ({ ...current, [note.id]: event.target.value }))}
                rows={8}
              />
              <button className="secondary-button" type="button" onClick={() => void saveNote(note)}>保存修改</button>
            </article>
          ))}
          {notes.every((note) => note.noteKind === undefined) && <p className="empty-state">生成后的讲义、例题和作业会出现在这里。</p>}
        </div>
      </section>
    </section>
  )
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : '操作失败，请稍后重试。'
}
