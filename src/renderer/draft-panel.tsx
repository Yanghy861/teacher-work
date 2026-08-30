import { useEffect, useMemo, useRef, useState } from 'react'

import type { CoreOverview, NoteRecord } from '../shared/core-contracts'
import type { ManagedFileOverview } from '../shared/file-contracts'
import {
  DRAFT_DEFAULT_MAX_CHARS,
  DRAFT_DEFAULT_MAX_TOKENS,
  DRAFT_KINDS,
  DRAFT_REQUIREMENT_MAX_CHARS,
  type DraftKind,
} from '../shared/draft-contracts'
import type { SkillRecord } from '../shared/skill-contracts'
import {
  isSelectableLessonPrepFile,
  filterLessonMaterialFiles,
  listLessonPrepFiles,
  reconcileSelectedLessonFileIds,
  type LessonPrepContext,
} from './lesson-prep-context'
import { listDraftInbox, listLessonAiResults, type DraftInboxEntry } from './draft-view-model'
import LessonMaterialReader, { LessonMaterialTree, MarkdownDocument } from './lesson-material-reader'

const kindLabels: Record<DraftKind, string> = {
  lecture: '讲义',
  example: '例题',
  homework: '作业',
}

type BusyAction = DraftKind | 'regenerate' | 'save' | 'delete' | 'publish' | ''

export default function DraftPanel({
  context,
  initialDraftId,
  onOpenDraft,
  onBackToCourses,
  onBrowseExternal,
  onBrowseMaterials,
  onOpenCourseware,
  onDirtyChange,
}: {
  readonly context: LessonPrepContext | null
  readonly initialDraftId: string | null
  readonly onOpenDraft: (context: LessonPrepContext, noteId: string) => void
  readonly onBackToCourses: () => void
  readonly onBrowseExternal: () => void
  readonly onBrowseMaterials: () => void
  readonly onOpenCourseware?: () => void
  readonly onDirtyChange?: (dirty: boolean) => void
}): React.JSX.Element {
  const [files, setFiles] = useState<ManagedFileOverview | null>(null)
  const [core, setCore] = useState<CoreOverview | null>(null)
  const [skills, setSkills] = useState<readonly SkillRecord[]>([])
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [previewFileId, setPreviewFileId] = useState('')
  const [selectedSkillId, setSelectedSkillId] = useState('')
  const [requirement, setRequirement] = useState('')
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [showResults, setShowResults] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState('')
  const [busyAction, setBusyAction] = useState<BusyAction>('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [restoreNoticeVisible, setRestoreNoticeVisible] = useState(false)
  const [improvePhase, setImprovePhase] = useState<'' | 'review'>('')
  const [improvePlan, setImprovePlan] = useState('')
  const [improveBusy, setImproveBusy] = useState(false)
  const [improveError, setImproveError] = useState('')
  const [improveBase, setImproveBase] = useState<{ title: string; body: string } | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const knownLessonFileIds = useRef<Set<string>>(new Set())

  const lessonFiles = useMemo(() => {
    if (files === null || context === null) return []
    return filterLessonMaterialFiles(listLessonPrepFiles(files, context.lessonId), {
      lessonLabel: context.lessonLabel,
      periodTitle: context.periodTitle,
    })
  }, [context, files])
  const lessonFileKey = lessonFiles.map((file) => file.id).join('|')
  const selectedFiles = lessonFiles.filter((file) =>
    isSelectableLessonPrepFile(file) && selectedFileIds.includes(file.id),
  )
  const lessonResults = useMemo(
    () => context === null ? [] : listLessonAiResults(core, context.lessonId),
    [context, core],
  )
  const selectedNote = selectedNoteId === null
    ? undefined
    : lessonResults.find((note) => note.id === selectedNoteId)
  const dirty = editing && selectedNote !== undefined && editBody !== selectedNote.bodyMd

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    let cancelled = false
    knownLessonFileIds.current = new Set()
    setSelectedFileIds([])
    setPreviewFileId('')
    setSelectedSkillId('')
    setRequirement('')
    setSelectedNoteId(initialDraftId)
    setShowResults(initialDraftId !== null)
    setEditing(false)
    setEditBody('')
    setMessage('')
    setError('')
    setRestoreNoticeVisible(false)
    setImprovePhase('')
    setImprovePlan('')
    setImproveError('')
    setImproveBase(null)
    setCompareOpen(false)
    void (async () => {
      const loadedCore = await reload()
      if (cancelled || context === null || loadedCore === null) return
      if (initialDraftId !== null) {
        setRestoreNoticeVisible(true)
        return
      }
      const latestDraft = listLessonAiResults(loadedCore, context.lessonId)
        .find((note) => note.draftStatus === 'draft')
      if (latestDraft === undefined) return
      setSelectedNoteId(latestDraft.id)
      setShowResults(true)
      setRestoreNoticeVisible(true)
    })()
    return () => { cancelled = true }
  }, [context?.lessonId, initialDraftId])

  useEffect(() => {
    const currentSet = new Set(lessonFiles.map((file) => file.id))
    const previousKnown = knownLessonFileIds.current
    setSelectedFileIds((current) =>
      reconcileSelectedLessonFileIds(current, previousKnown, lessonFiles),
    )
    knownLessonFileIds.current = currentSet
  }, [lessonFileKey])

  useEffect(() => {
    if (!showResults) return
    if (selectedNoteId !== null) return
    setSelectedNoteId(lessonResults[0]?.id ?? null)
    setEditing(false)
    setEditBody('')
  }, [lessonResults, selectedNoteId, showResults])

  async function reload(): Promise<CoreOverview | null> {
    try {
      const [nextFiles, nextCore, nextSkills] = await Promise.all([
        window.teacherWorkbench.files.getOverview(),
        window.teacherWorkbench.core.getOverview(),
        window.teacherWorkbench.skills.list(),
      ])
      setFiles(nextFiles)
      setCore(nextCore)
      setSkills(nextSkills)
      setError('')
      return nextCore
    } catch (loadError) {
      setError(toErrorMessage(loadError))
      return null
    }
  }

  function toggleFile(fileId: string): void {
    const file = lessonFiles.find((candidate) => candidate.id === fileId)
    if (file === undefined || !isSelectableLessonPrepFile(file)) return
    setSelectedFileIds((current) => current.includes(fileId)
      ? current.filter((id) => id !== fileId)
      : [...current, fileId])
  }

  async function generate(kind: DraftKind): Promise<void> {
    if (context === null || selectedFiles.length === 0) {
      setError('请先从本次课次资料中选择至少一份资料。')
      return
    }
    setBusyAction(kind)
    setMessage(`正在生成${kindLabels[kind]}…`)
    setError('')
    try {
      const result = await window.teacherWorkbench.drafts.generate({
        requestId: globalThis.crypto.randomUUID(),
        kind,
        lessonId: context.lessonId,
        ...(context.studentId === undefined ? {} : { studentId: context.studentId }),
        ...(selectedSkillId === '' ? {} : { skillId: selectedSkillId }),
        ...(requirement.trim() === '' ? {} : { requirement: requirement.trim() }),
        sources: selectedFiles.map((file) => ({ fileId: file.id })),
        maxChars: DRAFT_DEFAULT_MAX_CHARS,
        maxTokens: DRAFT_DEFAULT_MAX_TOKENS,
      })
      await reload()
      setSelectedNoteId(result.noteId)
      setShowResults(true)
      setRestoreNoticeVisible(false)
      setEditing(false)
      setEditBody('')
      setMessage(`已生成，可在修改记录中查看。`)
    } catch (generationError) {
      setMessage('')
      setError(toErrorMessage(generationError))
    } finally {
      setBusyAction('')
    }
  }

  async function startImprovePlan(): Promise<void> {
    const refs = selectedFiles.filter(isSelectableLessonPrepFile)
    if (refs.length === 0) {
      setImproveError('请先勾选要改进的课件或资料。')
      return
    }
    if (requirement.trim() === '') {
      setImproveError('请先填写本次修改要求，AI 需要知道你想怎么改。')
      return
    }
    setImproveBusy(true)
    setImproveError('')
    setMessage('正在生成修改方案…')
    try {
      const refParts: { title: string; body: string }[] = []
      for (const file of refs) {
        const content = await window.teacherWorkbench.files.readContent({ fileId: file.id })
        if (content.kind !== 'text') continue
        refParts.push({ title: file.originalName, body: content.content })
      }
      if (refParts.length === 0) {
        setImproveError('所选资料没有可读文本，无法生成修改方案。')
        setMessage('')
        setImproveBusy(false)
        return
      }
      const prompt = [
        '你是一位备课助理。老师正在改进一节课的已有课件，请基于课件内容和老师的修改要求，输出一份可审阅的修改方案。',
        '要求：分条说明每处「改什么、为什么、怎么改」；不要输出修改后的全文；全文控制在 500 字以内；使用中文。',
        `老师修改要求：${requirement.trim()}`,
        '当前课件内容：',
        ...refParts.map((part) => `【${part.title}】${String.fromCharCode(10)}${part.body}`),
      ].join(String.fromCharCode(10, 10))
      const result = await window.teacherWorkbench.ai.requestText({
        requestId: globalThis.crypto.randomUUID(),
        prompt,
        maxTokens: DRAFT_DEFAULT_MAX_TOKENS,
      })
      setImprovePlan(result.text)
      setImproveBase(refParts[0])
      setImprovePhase('review')
      setMessage('修改方案已生成，请审阅确认后再生成新副本。')
    } catch (planError) {
      setMessage('')
      setImproveError(toErrorMessage(planError))
    } finally {
      setImproveBusy(false)
    }
  }

  async function confirmPlanAndGenerate(kind: DraftKind): Promise<void> {
    if (context === null || improvePlan.trim() === '') return
    const refs = selectedFiles.filter(isSelectableLessonPrepFile)
    if (refs.length === 0) {
      setImproveError('参考资料已变化，请重新发起改进。')
      return
    }
    setImproveBusy(true)
    setImproveError('')
    setMessage(`正在按确认的方案生成${kindLabels[kind]}…`)
    try {
      const planBudget = DRAFT_REQUIREMENT_MAX_CHARS - requirement.trim().length - 40
      const embeddedRequirement = [
        requirement.trim(),
        '【老师已确认的修改方案（请严格按方案修改）】',
        improvePlan.trim().slice(0, Math.max(0, planBudget)),
      ].join(String.fromCharCode(10))
      const result = await window.teacherWorkbench.drafts.generate({
        requestId: globalThis.crypto.randomUUID(),
        kind,
        lessonId: context.lessonId,
        ...(context.studentId === undefined ? {} : { studentId: context.studentId }),
        ...(selectedSkillId === '' ? {} : { skillId: selectedSkillId }),
        requirement: embeddedRequirement,
        sources: refs.map((file) => ({ fileId: file.id })),
        maxChars: DRAFT_DEFAULT_MAX_CHARS,
        maxTokens: DRAFT_DEFAULT_MAX_TOKENS,
      })
      await reload()
      setSelectedNoteId(result.noteId)
      setShowResults(true)
      setRestoreNoticeVisible(false)
      setEditing(false)
      setEditBody('')
      setCompareOpen(true)
      setImprovePhase('')
      setImprovePlan('')
      setMessage(`${kindLabels[kind]}已按方案生成，可用“新旧对比”查看差异。`)
    } catch (generationError) {
      setMessage('')
      setImproveError(toErrorMessage(generationError))
    } finally {
      setImproveBusy(false)
    }
  }

  async function publishVersion(): Promise<void> {
    if (selectedNote === undefined) return
    if (!window.confirm('将把当前内容发布为本课课件新版本，旧版本保留。继续？')) return
    setBusyAction('publish')
    setMessage('')
    setError('')
    try {
      const result = await window.teacherWorkbench.drafts.publishToLesson({
        requestId: globalThis.crypto.randomUUID(),
        noteId: selectedNote.id,
      })
      await reload()
      setMessage(`已发布为课件《${result.file.originalName}》（第 ${result.version} 版），旧版本保留，可在课件区查看。`)
    } catch (publishError) {
      setError(toErrorMessage(publishError))
    } finally {
      setBusyAction('')
    }
  }

  function abandonImprove(): void {
    setImprovePhase('')
    setImprovePlan('')
    setImproveError('')
    setMessage('')
  }

  function selectResult(note: NoteRecord): void {
    if (dirty && !window.confirm('当前修改尚未保存，确定切换到其他结果吗？')) return
    setRestoreNoticeVisible(false)
    setSelectedNoteId(note.id)
    setEditing(false)
    setEditBody('')
    setMessage('')
    setError('')
  }

  function startEditing(): void {
    if (selectedNote === undefined) return
    setEditBody(selectedNote.bodyMd)
    setEditing(true)
    setMessage('')
    setError('')
  }

  function cancelEditing(): void {
    setEditing(false)
    setEditBody('')
    setMessage('已取消本次未保存修改。')
    setError('')
  }

  async function saveModification(): Promise<void> {
    if (selectedNote === undefined || editBody.trim() === '') {
      setError('草稿内容不能为空。')
      return
    }
    setBusyAction('save')
    setError('')
    try {
      await window.teacherWorkbench.core.updateNote({ noteId: selectedNote.id, bodyMd: editBody })
      setEditing(false)
      setEditBody('')
      setMessage('修改已保存。')
      await reload()
    } catch (saveError) {
      setError(toErrorMessage(saveError))
    } finally {
      setBusyAction('')
    }
  }

  async function saveToLesson(): Promise<void> {
    if (selectedNote === undefined) return
    if (editing && editBody.trim() === '') {
      setError('草稿内容不能为空。')
      return
    }
    setBusyAction('save')
    setError('')
    try {
      await window.teacherWorkbench.drafts.saveToLesson({
        noteId: selectedNote.id,
        ...(editing ? { bodyMd: editBody } : {}),
      })
      setEditing(false)
      setEditBody('')
      setMessage('当前版本已保存到本次课次。')
      await reload()
    } catch (saveError) {
      setError(toErrorMessage(saveError))
    } finally {
      setBusyAction('')
    }
  }

  async function regenerate(): Promise<void> {
    if (selectedNote === undefined) return
    if (dirty && !window.confirm('当前修改尚未保存。重新生成会保留旧草稿，但不会保存这次编辑，是否继续？')) return
    setBusyAction('regenerate')
    setMessage('正在重新生成，旧结果会继续保留…')
    setError('')
    try {
      const result = await window.teacherWorkbench.drafts.regenerate({
        requestId: globalThis.crypto.randomUUID(),
        noteId: selectedNote.id,
      })
      await reload()
      setSelectedNoteId(result.noteId)
      setEditing(false)
      setEditBody('')
      setMessage('已生成新草稿，旧结果仍然保留。')
    } catch (regenerationError) {
      setMessage('')
      setError(toErrorMessage(regenerationError))
    } finally {
      setBusyAction('')
    }
  }

  async function deleteDraft(note: NoteRecord): Promise<void> {
    if (note.draftStatus !== 'draft') return
    if (!window.confirm(`确定删除这份尚未发布的${kindLabels[note.noteKind as DraftKind]}修改节点吗？`)) return
    setBusyAction('delete')
    setError('')
    try {
      await window.teacherWorkbench.drafts.softDelete({ noteId: note.id })
      if (selectedNoteId === note.id) {
        setSelectedNoteId(null)
        setEditing(false)
        setEditBody('')
      }
      setMessage('草稿已删除。')
      await reload()
    } catch (deleteError) {
      setError(toErrorMessage(deleteError))
    } finally {
      setBusyAction('')
    }
  }

  function returnToSetup(): void {
    if (dirty && !window.confirm('当前修改尚未保存，确定返回备课设置吗？')) return
    setShowResults(false)
    setEditing(false)
    setEditBody('')
    setMessage('')
    setError('')
  }

  if (context === null) {
    return (
      <DraftInbox
        core={core}
        busy={busyAction !== ''}
        error={error}
        message={message}
        onOpenDraft={onOpenDraft}
        onDeleteDraft={(note) => void deleteDraft(note)}
        onBackToCourses={onBackToCourses}
      />
    )
  }

  return (
    <section className="lesson-prep-panel" aria-label="本次课次备课">
      {error !== '' && <div className="inline-error" role="alert">{error}</div>}
      {message !== '' && <div className="inline-notice" role="status">{message}</div>}
      <div className="prep-context-bar">
        <div><p className="section-kicker">本次备课课次</p><h2>{context.courseTitle} / {context.lessonTitle}</h2></div>
        <div className="prep-context-actions">
          <span className="selection-label">{formatStudentContext(context)}</span>
          <button className="secondary-button" type="button" onClick={onBackToCourses} disabled={busyAction !== ''}>返回课程</button>
        </div>
      </div>
      {showResults ? (
        <ResultWorkspace
          notes={lessonResults}
          selectedNote={selectedNote}
          editing={editing}
          editBody={editBody}
          busy={busyAction !== ''}
          onSelect={selectResult}
          onEdit={startEditing}
          onEditBody={setEditBody}
          onCancelEdit={cancelEditing}
          onSaveModification={() => void saveModification()}
          onSaveToLesson={() => void saveToLesson()}
          onOpenCourseware={onOpenCourseware}
          onRegenerate={() => void regenerate()}
          onDelete={(note) => void deleteDraft(note)}
          onReturnToSetup={returnToSetup}
          restoreNoticeVisible={restoreNoticeVisible}
          onDismissRestoreNotice={() => setRestoreNoticeVisible(false)}
          compareBase={improveBase}
          compareOpen={compareOpen}
          promptVisible={improveBase === null}
          requirement={requirement}
          onRequirement={setRequirement}
          skills={skills}
          selectedSkillId={selectedSkillId}
          onSelectSkill={setSelectedSkillId}
          selectedFilesCount={selectedFiles.length}
          onGeneratePlan={() => void startImprovePlan()}
          onGenerate={(kind) => void generate(kind)}
          improveBusy={improveBusy}
          onPublishToLesson={() => void publishVersion()}
          onToggleCompare={() => setCompareOpen((current) => !current)}
          compareToggleVisible={improveBase !== null}
        />
      ) : (
        <PrepSetup
          files={files}
          lessonFiles={lessonFiles}
          selectedFileIds={selectedFileIds}
          previewFileId={previewFileId}
          selectedFilesCount={selectedFiles.length}
          skills={skills}
          selectedSkillId={selectedSkillId}
          requirement={requirement}
          resultCount={lessonResults.length}
          busyAction={busyAction}
          onToggleFile={toggleFile}
          onPreviewFile={setPreviewFileId}
          onBrowseExternal={onBrowseExternal}
          onBrowseMaterials={onBrowseMaterials}
          onSelectSkill={setSelectedSkillId}
          onRequirement={setRequirement}
          onGenerate={(kind) => void generate(kind)}
          onShowResults={() => { setSelectedNoteId(lessonResults[0]?.id ?? null); setShowResults(true) }}
          improvePhase={improvePhase}
          improvePlan={improvePlan}
          improveBusy={improveBusy}
          improveError={improveError}
          improveAvailable={selectedFiles.some(isSelectableLessonPrepFile)}
          onStartImprove={() => void startImprovePlan()}
          onConfirmImprove={(kind) => void confirmPlanAndGenerate(kind)}
          onAbandonImprove={abandonImprove}
        />
      )}
    </section>
  )
}

function DraftInbox({ core, busy, error, message, onOpenDraft, onDeleteDraft, onBackToCourses }: {
  readonly core: CoreOverview | null
  readonly busy: boolean
  readonly error: string
  readonly message: string
  readonly onOpenDraft: (context: LessonPrepContext, noteId: string) => void
  readonly onDeleteDraft: (note: NoteRecord) => void
  readonly onBackToCourses: () => void
}): React.JSX.Element {
  const entries = listDraftInbox(core)
  return (
    <section className="draft-inbox-panel" aria-label="修改记录">
      {error !== '' && <div className="inline-error" role="alert">{error}</div>}
      {message !== '' && <div className="inline-notice" role="status">{message}</div>}
      <div className="workspace-card">
        <div className="card-heading">
          <div><p className="section-kicker">AI 协作</p><h2>修改记录</h2><p>这里列出各课次尚未发布（修改中）的 AI 修改节点，点击进入对应课次的 AI 备课。</p></div>
          <span className="count-label">{entries.length} 份</span>
        </div>
        <ul className="draft-inbox-list">
          {entries.map((entry) => (
            <DraftInboxRow key={entry.note.id} entry={entry} busy={busy} onOpenDraft={onOpenDraft} onDeleteDraft={onDeleteDraft} />
          ))}
          {core === null && <li className="empty-state">正在读取草稿…</li>}
          {core !== null && entries.length === 0 && <li className="empty-state">暂无修改节点。生成内容后会自动出现在这里。</li>}
        </ul>
        <button className="secondary-button" type="button" onClick={onBackToCourses}>前往我的课程开始备课</button>
      </div>
    </section>
  )
}

function DraftInboxRow({ entry, busy, onOpenDraft, onDeleteDraft }: {
  readonly entry: DraftInboxEntry
  readonly busy: boolean
  readonly onOpenDraft: (context: LessonPrepContext, noteId: string) => void
  readonly onDeleteDraft: (note: NoteRecord) => void
}): React.JSX.Element {
  const kind = entry.note.noteKind as DraftKind
  return (
    <li>
      <button className="draft-inbox-open" type="button" disabled={busy || entry.context === null} onClick={() => entry.context !== null && onOpenDraft(entry.context, entry.note.id)}>
        <span className="draft-kind-icon" aria-hidden="true">{kindIcon(kind)}</span>
        <span><strong>{kindLabels[kind]}修改节点</strong><small>{entry.courseTitle} / {entry.lessonTitle}</small></span>
        <time dateTime={entry.note.updatedAt}>{formatDateTime(entry.note.updatedAt)}</time>
      </button>
      <button className="danger-button" type="button" disabled={busy} onClick={() => onDeleteDraft(entry.note)}>删除</button>
    </li>
  )
}

function PrepSetup({ files, lessonFiles, selectedFileIds, previewFileId, selectedFilesCount, skills, selectedSkillId, requirement, resultCount, busyAction, onToggleFile, onPreviewFile, onBrowseExternal, onBrowseMaterials, onSelectSkill, onRequirement, onGenerate, onShowResults, improvePhase, improvePlan, improveBusy, improveError, improveAvailable, onStartImprove, onConfirmImprove, onAbandonImprove }: {
  readonly files: ManagedFileOverview | null
  readonly lessonFiles: ManagedFileOverview['files']
  readonly selectedFileIds: readonly string[]
  readonly previewFileId: string
  readonly selectedFilesCount: number
  readonly skills: readonly SkillRecord[]
  readonly selectedSkillId: string
  readonly requirement: string
  readonly resultCount: number
  readonly busyAction: BusyAction
  readonly onToggleFile: (fileId: string) => void
  readonly onPreviewFile: (fileId: string) => void
  readonly onBrowseExternal: () => void
  readonly onBrowseMaterials: () => void
  readonly onSelectSkill: (skillId: string) => void
  readonly onRequirement: (value: string) => void
  readonly onGenerate: (kind: DraftKind) => void
  readonly onShowResults: () => void
  readonly improvePhase: '' | 'review'
  readonly improvePlan: string
  readonly improveBusy: boolean
  readonly improveError: string
  readonly improveAvailable: boolean
  readonly onStartImprove: () => void
  readonly onConfirmImprove: (kind: DraftKind) => void
  readonly onAbandonImprove: () => void
}): React.JSX.Element {
  const [improveKind, setImproveKind] = useState<DraftKind>('lecture')
  return (
    <div className="lesson-prep-layout lesson-prep-layout-reader">
      <aside className="workspace-card prep-materials-panel">
        <div className="card-heading"><div><p className="section-kicker">资料目录</p><h2>本次备课资料</h2></div><span className="count-label">{lessonFiles.filter(isSelectableLessonPrepFile).length} 份文档</span></div>
        {files === null ? <div className="material-reader-state">正在读取本次资料…</div> : (
          <LessonMaterialTree
            files={lessonFiles}
            selectedFileId={previewFileId}
            onSelectFile={onPreviewFile}
            selectedFileIds={selectedFileIds}
            onToggleFile={onToggleFile}
            showHeading={false}
          />
        )}
      </aside>
      <section className="workspace-card prep-reader-card">
        <div className="card-heading"><div><p className="section-kicker">正文阅读</p><h2>像笔记一样阅读资料</h2></div><span className="selection-label">先读，再勾选生成</span></div>
        <LessonMaterialReader
          files={lessonFiles}
          selectedFileId={previewFileId}
          onSelectFile={onPreviewFile}
          hideTree
        />
      </section>
      <div className="prep-workspace-column prep-ai-column">
        <section className="workspace-card prep-ai-card">
          <div className="card-heading"><div><p className="section-kicker">备课动作</p><h2>AI 备课</h2></div><span className="selection-label">已选 {selectedFilesCount} 份文档</span></div>
          <p className="prep-guidance">图片和其他素材会跟随 Markdown 正文阅读；勾选要作为本次生成依据的文档。</p>
          <div className="prep-input-grid">
            <label>我的 Skill（可选）<select value={selectedSkillId} onChange={(event) => onSelectSkill(event.target.value)} disabled={busyAction !== ''}><option value="">不使用 Skill</option>{skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
            <label>本次要求（可选）<textarea value={requirement} onChange={(event) => onRequirement(event.target.value)} maxLength={DRAFT_REQUIREMENT_MAX_CHARS} rows={4} placeholder="例如：今天少讲理论，多安排基础题，重点讲圆的面积。" disabled={busyAction !== ''} /><small className="field-counter">{requirement.length} / {DRAFT_REQUIREMENT_MAX_CHARS}</small></label>
          </div>
          <div className="prep-generate-actions">
            {([DRAFT_KINDS.lecture, DRAFT_KINDS.example, DRAFT_KINDS.homework] as DraftKind[]).map((kind) => (
              <button key={kind} className={kind === 'lecture' ? 'primary-button' : 'secondary-button'} type="button" onClick={() => onGenerate(kind)} disabled={busyAction !== '' || selectedFilesCount === 0}>{busyAction === kind ? '生成中…' : `生成${kindLabels[kind]}`}</button>
            ))}
          </div>
          {improvePhase === 'review' ? (
            <div className="improve-review-card">
              <div className="card-heading"><div><p className="section-kicker">改进流程</p><h2>修改方案（先审阅，再生成）</h2></div></div>
              <div className="improve-plan-body"><MarkdownDocument body={improvePlan} files={[]} /></div>
              <div className="improve-review-actions">
                <label className="improve-kind-label">生成类型
                  <select value={improveKind} onChange={(event) => setImproveKind(event.target.value as DraftKind)} disabled={improveBusy}>
                    <option value="lecture">讲义</option>
                    <option value="example">例题</option>
                    <option value="homework">作业</option>
                  </select>
                </label>
                <button className="primary-button" type="button" onClick={() => onConfirmImprove(improveKind)} disabled={improveBusy}>{improveBusy ? '生成中…' : '确认方案并生成'}</button>
                <button className="secondary-button" type="button" onClick={onStartImprove} disabled={improveBusy}>重新出方案</button>
                <button className="secondary-button" type="button" onClick={onAbandonImprove} disabled={improveBusy}>放弃改进</button>
              </div>
            </div>
          ) : (
            <button className="secondary-button improve-entry-button" type="button" onClick={onStartImprove} disabled={busyAction !== '' || !improveAvailable || improveBusy}>{improveBusy ? '正在生成修改方案…' : '基于课件改进（AI 先出修改方案）'}</button>
          )}
          {improveError !== '' && <p className="inline-error" role="alert">{improveError}</p>}
        </section>
        <div className="prep-source-actions prep-ai-sources">
          <button className="secondary-button" type="button" onClick={onBrowseExternal}>从外部资料添加</button>
          <button className="secondary-button" type="button" onClick={onBrowseMaterials}>从素材库添加</button>
        </div>
        {resultCount > 0 && <button className="secondary-button result-entry-button" type="button" onClick={onShowResults}>查看本次课次生成结果（{resultCount}）</button>}
      </div>
    </div>
  )
}

function ResultWorkspace({ notes, selectedNote, editing, editBody, busy, onSelect, onEdit, onEditBody, onCancelEdit, onSaveModification, onSaveToLesson, onOpenCourseware, onRegenerate, onDelete, onReturnToSetup, restoreNoticeVisible, onDismissRestoreNotice, compareBase, compareOpen, onToggleCompare, compareToggleVisible, onPublishToLesson, promptVisible, requirement, onRequirement, skills, selectedSkillId, onSelectSkill, selectedFilesCount, onGeneratePlan, onGenerate, improveBusy }: {
  readonly notes: readonly NoteRecord[]
  readonly selectedNote: NoteRecord | undefined
  readonly editing: boolean
  readonly editBody: string
  readonly busy: boolean
  readonly onSelect: (note: NoteRecord) => void
  readonly onEdit: () => void
  readonly onEditBody: (body: string) => void
  readonly onCancelEdit: () => void
  readonly onSaveModification: () => void
  readonly onSaveToLesson: () => void
  readonly onOpenCourseware?: () => void
  readonly onRegenerate: () => void
  readonly onDelete: (note: NoteRecord) => void
  readonly onReturnToSetup: () => void
  readonly restoreNoticeVisible: boolean
  readonly onDismissRestoreNotice: () => void
  readonly compareBase: { title: string; body: string } | null
  readonly compareOpen: boolean
  readonly onToggleCompare: () => void
  readonly compareToggleVisible: boolean
  readonly onPublishToLesson?: () => void
  readonly promptVisible: boolean
  readonly requirement: string
  readonly onRequirement: (value: string) => void
  readonly skills: readonly SkillRecord[]
  readonly selectedSkillId: string
  readonly onSelectSkill: (skillId: string) => void
  readonly selectedFilesCount: number
  readonly onGeneratePlan: () => void
  readonly onGenerate: (kind: DraftKind) => void
  readonly improveBusy: boolean
}): React.JSX.Element {
  return (
    <div className="draft-result-layout">
      <aside className="workspace-card draft-result-list-panel">
        <div className="card-heading"><div><p className="section-kicker">本次课次</p><h2>生成结果</h2></div><span className="count-label">{notes.length} 份</span></div>
        <ul className="draft-result-list">
          {notes.map((note) => {
            const kind = note.noteKind as DraftKind
            return (
              <li key={note.id} className={selectedNote?.id === note.id ? 'is-selected' : ''}>
                <button type="button" className="draft-result-select" onClick={() => onSelect(note)} disabled={busy}>
                  <span className="draft-kind-icon" aria-hidden="true">{kindIcon(kind)}</span>
                  <span><strong>{kindLabels[kind]}{note.draftStatus === 'draft' ? '修改节点' : '已确认成果'}</strong><small>{formatDateTime(note.updatedAt)}</small></span>
                  <span className={`draft-status draft-status-${note.draftStatus}`}>{note.draftStatus === 'draft' ? '修改中' : '已确认'}</span>
                </button>
                {note.draftStatus === 'draft' && <button className="danger-button" type="button" onClick={() => onDelete(note)} disabled={busy}>删除</button>}
              </li>
            )
          })}
          {notes.length === 0 && <li className="empty-state">本次课次还没有生成结果。</li>}
        </ul>
        <button className="secondary-button" type="button" onClick={onReturnToSetup} disabled={busy}>返回备课设置</button>
      </aside>
      <section className="workspace-card draft-content-panel" aria-label="生成结果内容区">
        {selectedNote === undefined ? (
          <div className="draft-content-empty"><p>请选择左侧结果，或返回备课设置生成新内容。</p></div>
        ) : (
          <>
            {promptVisible && (
              <div className="draft-prompt-block">
                <div className="kicker">修改要求（你的提示词，每次出方案都以它为准）</div>
                <textarea value={requirement} onChange={(event) => onRequirement(event.target.value)} maxLength={DRAFT_REQUIREMENT_MAX_CHARS} rows={3} placeholder="例如：每个概念后配一道即时练习；平方根易错点整理成辨析表。" disabled={busy} />
                <div className="draft-prompt-actions">
                  <label className="improve-kind-label">Skill：
                    <select value={selectedSkillId} onChange={(event) => onSelectSkill(event.target.value)} disabled={busy}>
                      <option value="">不使用 Skill</option>
                      {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
                    </select>
                  </label>
                  <button className="secondary-button" type="button" onClick={onGeneratePlan} disabled={improveBusy || selectedFilesCount === 0}>{improveBusy ? '正在生成修改方案…' : '✦ 生成修改方案'}</button>
                  {([DRAFT_KINDS.lecture, DRAFT_KINDS.example, DRAFT_KINDS.homework] as DraftKind[]).map((kind) => (
                    <button key={kind} className="btn-ghost small" type="button" onClick={() => onGenerate(kind)} disabled={busy || selectedFilesCount === 0}>生成{kindLabels[kind]}</button>
                  ))}
                </div>
              </div>
            )}
            {restoreNoticeVisible && selectedNote.draftStatus === 'draft' && (
              <div className="draft-restore-notice" role="status">
                <span>已恢复最近的工作副本：修改尚未发布，不会改变正式课件与已确认成果。</span>
                <button className="secondary-button" type="button" onClick={onDismissRestoreNotice}>知道了</button>
              </div>
            )}
            <div className="draft-content-header">
              <div><p className="section-kicker">{selectedNote.draftStatus === 'draft' ? '修改中 · 尚未发布' : '已确认 · 本次课次成果'}</p><h2>{kindLabels[selectedNote.noteKind as DraftKind]}{selectedNote.draftStatus === 'draft' ? '修改节点' : '成果'}</h2></div>
              <div className="draft-content-actions">
                {editing ? <><button className="secondary-button" type="button" onClick={onCancelEdit} disabled={busy}>取消编辑</button><button className="secondary-button" type="button" onClick={onSaveModification} disabled={busy}>保存修改</button></> : <button className="secondary-button" type="button" onClick={onEdit} disabled={busy}>编辑</button>}
                <button className="secondary-button" type="button" onClick={onRegenerate} disabled={busy}>重新生成</button>
                {compareToggleVisible && compareBase !== null && <button className="secondary-button" type="button" onClick={onToggleCompare} disabled={busy}>{compareOpen ? '关闭新旧对比' : '新旧对比'}</button>}
                {selectedNote.draftStatus === 'draft' && <button className="primary-button" type="button" onClick={onSaveToLesson} disabled={busy}>保存到本次课次</button>}
                {onPublishToLesson !== undefined && <button className="secondary-button" type="button" onClick={onPublishToLesson} disabled={busy}>保存为新版本</button>}
                {onOpenCourseware !== undefined && <button className="secondary-button" type="button" onClick={onOpenCourseware} disabled={busy}>查看课件</button>}
              </div>
            </div>
            {compareOpen && compareBase !== null && (
              <div className="draft-compare-grid">
                <div className="draft-compare-pane"><p className="section-kicker">参考课件：{compareBase.title}</p><MarkdownDocument body={compareBase.body} files={[]} /></div>
                <div className="draft-compare-pane"><p className="section-kicker">新工作副本（未发布）</p>{editing ? <textarea aria-label="编辑新工作副本" value={editBody} onChange={(event) => onEditBody(event.target.value)} rows={16} disabled={busy} /> : <MarkdownDocument body={selectedNote.bodyMd} files={[]} />}</div>
              </div>
            )}
            <div className={`draft-content-body${editing ? ' is-editing' : ' is-preview'}`}>
              {editing ? <textarea aria-label="编辑生成结果" value={editBody} onChange={(event) => onEditBody(event.target.value)} rows={24} disabled={busy} /> : <MarkdownDocument body={selectedNote.bodyMd} files={[]} />}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function kindIcon(kind: DraftKind): string { return kind === 'lecture' ? '讲' : kind === 'example' ? '例' : '作' }

function formatStudentContext(context: LessonPrepContext): string {
  if (context.courseMode === 'class') return context.studentNames.length === 0 ? '班课 · 无需选择学生' : `班课 · ${context.studentNames.length} 位关联学生`
  return context.studentNames.length === 0 ? '一对一 · 暂无关联学生' : `一对一 · ${context.studentNames.join('、')}`
}

function formatDateTime(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('zh-CN', { hour12: false })
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : '操作失败，请稍后重试。'
}
