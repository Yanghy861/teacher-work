import { useEffect, useMemo, useRef, useState } from 'react'

import type { CoreOverview, NoteRecord } from '../shared/core-contracts'
import type { ManagedFileOverview, ManagedFileRecord } from '../shared/file-contracts'
import {
  DRAFT_DEFAULT_MAX_CHARS,
  DRAFT_DEFAULT_MAX_TOKENS,
  DRAFT_KINDS,
  DRAFT_REQUIREMENT_MAX_CHARS,
  type DraftKind,
} from '../shared/draft-contracts'
import type { SkillRecord } from '../shared/skill-contracts'
import {
  classifyLessonCoursewareFiles,
  isSelectableLessonPrepFile,
  filterLessonMaterialFiles,
  listLessonPrepFiles,
  reconcileSelectedLessonFileIds,
  type LessonPrepContext,
} from './lesson-prep-context'
import { listDraftInbox, listLessonAiResults, type DraftInboxEntry } from './draft-view-model'
import { MarkdownDocument } from './lesson-material-reader'
import type { PrepLaunchIntent, PrepLaunchMode } from './teaching-content-context'

const kindLabels: Record<DraftKind, string> = {
  lecture: '讲义',
  example: '例题',
  homework: '作业',
}

type BusyAction = DraftKind | 'regenerate' | 'save' | 'delete' | 'publish' | ''

export default function DraftPanel({
  context,
  initialDraftId,
  launchIntent,
  onOpenDraft,
  onBackToCourses,
  onBrowseExternal,
  onBrowseMaterials,
  onOpenCourseware,
  onDirtyChange,
}: {
  readonly context: LessonPrepContext | null
  readonly initialDraftId: string | null
  readonly launchIntent?: PrepLaunchIntent
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
  const [prepMode, setPrepMode] = useState<PrepLaunchMode>('new')
  const [targetFileId, setTargetFileId] = useState('')
  const [selectedReferenceFileIds, setSelectedReferenceFileIds] = useState<string[]>([])
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
  const [improveKind, setImproveKind] = useState<DraftKind>('lecture')
  const knownLessonFileIds = useRef<Set<string>>(new Set())
  const scopeInitialized = useRef(false)

  const lessonFiles = useMemo(() => {
    if (files === null || context === null) return []
    return filterLessonMaterialFiles(listLessonPrepFiles(files, context.lessonId), {
      lessonLabel: context.lessonLabel,
      periodTitle: context.periodTitle,
    })
  }, [context, files])
  const lessonFileKey = lessonFiles.map((file) => file.id).join('|')
  const classifiedFiles = useMemo(() => classifyLessonCoursewareFiles(lessonFiles), [lessonFiles])
  const selectableCurrentFiles = classifiedFiles.currentMaterials.filter(isSelectableLessonPrepFile)
  const hasCourseware = selectableCurrentFiles.length > 0
  const targetFile = selectableCurrentFiles.find((file) => file.id === targetFileId) ?? null
  const lessonBaselineFiles = classifiedFiles.currentVersion !== null && isSelectableLessonPrepFile(classifiedFiles.currentVersion)
    ? [classifiedFiles.currentVersion]
    : selectableCurrentFiles
  const referenceCandidates = prepMode === 'single'
    ? selectableCurrentFiles.filter((file) => file.id !== targetFile?.id)
    : prepMode === 'lesson'
      ? selectableCurrentFiles.filter((file) => !lessonBaselineFiles.some((base) => base.id === file.id))
      : selectableCurrentFiles
  const selectedReferenceFiles = referenceCandidates.filter((file) => selectedReferenceFileIds.includes(file.id))
  const selectedFiles = uniqueFiles(prepMode === 'single'
    ? [...(targetFile === null ? [] : [targetFile]), ...selectedReferenceFiles]
    : prepMode === 'lesson'
      ? [...lessonBaselineFiles, ...selectedReferenceFiles]
      : selectedReferenceFiles)
  const plannedDraftKind = prepMode === 'lesson'
    ? DRAFT_KINDS.lecture
    : prepMode === 'single'
      ? inferDraftKind(targetFile)
      : improveKind
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
    scopeInitialized.current = false
    setPrepMode(launchIntent?.mode ?? 'new')
    setTargetFileId(launchIntent?.targetFileId ?? '')
    setSelectedReferenceFileIds([])
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
      if (launchIntent !== undefined) return
      const latestDraft = listLessonAiResults(loadedCore, context.lessonId)
        .find((note) => note.draftStatus === 'draft')
      if (latestDraft === undefined) return
      setSelectedNoteId(latestDraft.id)
      setShowResults(true)
      setRestoreNoticeVisible(true)
    })()
    return () => { cancelled = true }
  }, [context?.lessonId, initialDraftId, launchIntent?.mode, launchIntent?.targetFileId])

  useEffect(() => {
    if (files === null) return
    const currentSet = new Set(lessonFiles.map((file) => file.id))
    const previousKnown = knownLessonFileIds.current
    if (!scopeInitialized.current) {
      const requestedMode = launchIntent?.mode
      const nextMode: PrepLaunchMode = selectableCurrentFiles.length === 0
        ? 'new'
        : requestedMode === 'lesson' ? 'lesson' : 'single'
      const requestedTarget = selectableCurrentFiles.find((file) => file.id === launchIntent?.targetFileId)
      const nextTarget = requestedTarget
        ?? (classifiedFiles.currentVersion !== null && isSelectableLessonPrepFile(classifiedFiles.currentVersion)
          ? classifiedFiles.currentVersion
          : selectableCurrentFiles[0])
      setPrepMode(nextMode)
      setTargetFileId(nextTarget?.id ?? '')
      setSelectedReferenceFileIds(nextMode === 'new' ? selectableCurrentFiles.map((file) => file.id) : [])
      knownLessonFileIds.current = currentSet
      scopeInitialized.current = true
      return
    }
    setSelectedReferenceFileIds((current) =>
      reconcileSelectedLessonFileIds(current, previousKnown, lessonFiles),
    )
    knownLessonFileIds.current = currentSet
  }, [files, lessonFileKey, launchIntent?.mode, launchIntent?.targetFileId])

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

  function toggleReferenceFile(fileId: string): void {
    const file = referenceCandidates.find((candidate) => candidate.id === fileId)
    if (file === undefined) return
    setSelectedReferenceFileIds((current) => current.includes(fileId)
      ? current.filter((id) => id !== fileId)
      : [...current, fileId])
  }

  function selectTargetFile(fileId: string): void {
    if (!selectableCurrentFiles.some((file) => file.id === fileId)) return
    setTargetFileId(fileId)
    setSelectedReferenceFileIds((current) => current.filter((id) => id !== fileId))
    setImprovePhase('')
    setImprovePlan('')
    setImproveError('')
    setImproveBase(null)
    setCompareOpen(false)
    setMessage('')
  }

  function changePrepMode(nextMode: Exclude<PrepLaunchMode, 'new'>): void {
    if (!hasCourseware || prepMode === nextMode) return
    setPrepMode(nextMode)
    if (nextMode === 'single' && targetFile === null) {
      setTargetFileId(classifiedFiles.currentVersion?.id ?? selectableCurrentFiles[0]?.id ?? '')
    }
    setSelectedReferenceFileIds([])
    setImprovePhase('')
    setImprovePlan('')
    setImproveError('')
    setImproveBase(null)
    setCompareOpen(false)
    setMessage('')
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
    <section className="lesson-prep-workspace" aria-live="polite">
      {error !== '' && <div className="inline-error" role="alert">{error}</div>}
      {message !== '' && <div className="inline-notice" role="status">{message}</div>}
      {hasCourseware && (
        <div className="prep-mode-bar">
          <div><strong>这次想怎么改？</strong><span>先确定修改对象，再选择可选参考</span></div>
          <div className="segmented-control prep-mode-switch" aria-label="AI 修改方式">
            <button className={prepMode === 'single' ? 'is-active' : ''} type="button" onClick={() => changePrepMode('single')} disabled={busyAction !== '' || improveBusy}>修改当前文件</button>
            <button className={prepMode === 'lesson' ? 'is-active' : ''} type="button" onClick={() => changePrepMode('lesson')} disabled={busyAction !== '' || improveBusy}>整课重做</button>
          </div>
        </div>
      )}
      <div className="lesson-prep-workspace-grid">
        <aside className="workspace-card prep-ref-panel">
          {prepMode === 'new' ? (
            <>
              <div className="card-heading"><div><p className="section-kicker">新建备课</p><h2>选择生成依据</h2></div><span className="count-label">{referenceCandidates.length} 份</span></div>
              {files === null ? <div className="material-reader-state">正在读取本次资料…</div> : (
                <ScopeFileList files={referenceCandidates} selection="checkbox" selectedIds={selectedReferenceFileIds} onSelect={toggleReferenceFile} emptyText="先从外部资料或素材库添加生成依据。" />
              )}
            </>
          ) : prepMode === 'single' ? (
            <>
              <div className="card-heading"><div><p className="section-kicker">修改对象</p><h2>选择一份文件</h2></div><span className="count-label">单选</span></div>
              <ScopeFileList files={selectableCurrentFiles} selection="radio" selectedIds={targetFile === null ? [] : [targetFile.id]} onSelect={selectTargetFile} currentVersionId={classifiedFiles.currentVersion?.id} emptyText="本课没有可修改的文本文件。" />
            </>
          ) : (
            <>
              <div className="card-heading"><div><p className="section-kicker">修改对象</p><h2>本课全部内容</h2></div><span className="count-label">自动</span></div>
              <div className="prep-auto-scope">
                <strong>{classifiedFiles.currentVersion === null ? '本课现有可读内容' : '当前正式课件'}</strong>
                <p>{classifiedFiles.currentVersion === null ? '系统自动纳入进入工作台时已有的文本内容。' : '系统自动使用最新正式版本，历史版本不会参与。'}</p>
                <ScopeFileList files={lessonBaselineFiles} selection="summary" selectedIds={[]} onSelect={() => undefined} currentVersionId={classifiedFiles.currentVersion?.id} emptyText="本课没有可重做的文本内容。" />
              </div>
            </>
          )}
          {prepMode !== 'new' && (
            <div className="prep-reference-section">
              <div className="card-heading"><div><p className="section-kicker">可选</p><h2>补充参考</h2></div><span className="count-label">{selectedReferenceFiles.length} 份</span></div>
              <p className="prep-reference-hint">只帮助 AI 理解要求，不会改变修改对象。</p>
              <ScopeFileList files={referenceCandidates} selection="checkbox" selectedIds={selectedReferenceFileIds} onSelect={toggleReferenceFile} currentVersionId={classifiedFiles.currentVersion?.id} emptyText="没有额外参考；可从外部资料或素材库添加。" />
            </div>
          )}
          <div className="prep-source-actions">
            <button className="secondary-button" type="button" onClick={onBrowseExternal}>从外部资料添加</button>
            <button className="secondary-button" type="button" onClick={onBrowseMaterials}>从素材库添加</button>
          </div>
          <div className="card-heading" style={{ marginTop: 14 }}><div><p className="section-kicker">修改记录</p><h2>本课修改节点</h2></div><span className="count-label">{lessonResults.length} 份</span></div>
          <ul className="draft-result-list">
            {lessonResults.map((note) => {
              const kind = note.noteKind as DraftKind
              return (
                <li key={note.id} className={selectedNote?.id === note.id ? 'is-selected' : ''}>
                  <button type="button" className="draft-result-select" onClick={() => selectResult(note)} disabled={busyAction !== ''}>
                    <span className="draft-kind-icon" aria-hidden="true">{kindIcon(kind)}</span>
                    <span><strong>{kindLabels[kind]}{note.draftStatus === 'draft' ? '修改节点' : '已确认成果'}</strong><small>{formatDateTime(note.updatedAt)}</small></span>
                    <span className={`draft-status draft-status-${note.draftStatus}`}>{note.draftStatus === 'draft' ? '修改中' : '已确认'}</span>
                  </button>
                  {note.draftStatus === 'draft' && <button className="danger-button" type="button" onClick={() => void deleteDraft(note)} disabled={busyAction !== ''}>删除</button>}
                </li>
              )
            })}
            {lessonResults.length === 0 && <li className="empty-state">本课还没有修改节点，右侧生成后出现在这里。</li>}
          </ul>
        </aside>
        <section className="workspace-card prep-work-panel">
          {prepMode !== 'new' && (
            <div className="prep-scope-strip">
              <div><strong>{prepMode === 'single' ? `修改对象：${targetFile?.originalName ?? '尚未选择'}` : '修改范围：本课完整课件'}</strong><span>{prepMode === 'single' ? 'AI 只改这份文件，未提及部分保持不变。' : `系统自动纳入 ${lessonBaselineFiles.length} 份基线内容，输出一份完整新版本。`}</span></div>
              <span className="prep-scope-status">{prepMode === 'single' ? kindLabels[plannedDraftKind] : '整课'}</span>
            </div>
          )}
          <div className="draft-prompt-block">
            <div className="kicker">{prepMode === 'new' ? '生成要求' : prepMode === 'single' ? '单文件修改要求' : '整课重做要求'}（每次生成都以它为准）</div>
            <textarea value={requirement} onChange={(event) => setRequirement(event.target.value)} maxLength={DRAFT_REQUIREMENT_MAX_CHARS} rows={3} placeholder="例如：每个概念后配一道即时练习；平方根易错点整理成辨析表；结尾加下一讲衔接。" disabled={busyAction !== ''} />
            <div className="draft-prompt-actions">
              <label className="improve-kind-label">Skill：
                <select value={selectedSkillId} onChange={(event) => setSelectedSkillId(event.target.value)} disabled={busyAction !== ''}>
                  <option value="">不使用 Skill</option>
                  {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
                </select>
              </label>
              {prepMode !== 'new' && <button className="primary-button" type="button" onClick={() => void startImprovePlan()} disabled={improveBusy || busyAction !== '' || selectedFiles.length === 0}>{improveBusy ? '正在生成修改方案…' : prepMode === 'single' ? '✦ 生成单文件修改方案' : '✦ 生成整课重做方案'}</button>}
              {prepMode === 'new' && ([DRAFT_KINDS.lecture, DRAFT_KINDS.example, DRAFT_KINDS.homework] as DraftKind[]).map((kind) => (
                <button key={kind} className="btn-ghost small" type="button" onClick={() => void generate(kind)} disabled={busyAction !== '' || selectedFiles.length === 0}>{busyAction === kind ? '生成中…' : `生成${kindLabels[kind]}`}</button>
              ))}
            </div>
            {improveError !== '' && <p className="inline-error" role="alert">{improveError}</p>}
          </div>
          {improvePhase === 'review' && (
            <div className="improve-review-card">
              <div className="card-heading"><div><p className="section-kicker">改进流程</p><h2>修改方案（先审阅，再生成）</h2></div></div>
              <div className="improve-plan-body"><MarkdownDocument body={improvePlan} files={[]} /></div>
              <div className="improve-review-actions">
                {prepMode === 'new' && <label className="improve-kind-label">生成类型
                  <select value={improveKind} onChange={(event) => setImproveKind(event.target.value as DraftKind)} disabled={improveBusy}>
                    <option value="lecture">讲义</option>
                    <option value="example">例题</option>
                    <option value="homework">作业</option>
                  </select>
                </label>}
                <button className="primary-button" type="button" onClick={() => void confirmPlanAndGenerate(plannedDraftKind)} disabled={improveBusy}>{improveBusy ? '生成中…' : prepMode === 'lesson' ? '确认并生成完整新版本' : '确认方案并生成'}</button>
                <button className="secondary-button" type="button" onClick={() => void startImprovePlan()} disabled={improveBusy}>重新出方案</button>
                <button className="secondary-button" type="button" onClick={abandonImprove} disabled={improveBusy}>放弃改进</button>
              </div>
            </div>
          )}
          {selectedNote === undefined ? (
            <div className="draft-content-empty"><p>左侧选择修改节点，或在上方生成新内容。正式课件的阅读在「课件」分区。</p></div>
          ) : (
            <>
              {restoreNoticeVisible && selectedNote.draftStatus === 'draft' && (
                <div className="draft-restore-notice" role="status">
                  <span>已恢复最近的工作副本：修改尚未发布，不会改变正式课件与已确认成果。</span>
                  <button className="secondary-button" type="button" onClick={() => setRestoreNoticeVisible(false)}>知道了</button>
                </div>
              )}
              <div className="draft-content-header">
                <div><p className="section-kicker">{selectedNote.draftStatus === 'draft' ? '修改中 · 尚未发布' : '已确认 · 本次课次成果'}</p><h2>{kindLabels[selectedNote.noteKind as DraftKind]}{selectedNote.draftStatus === 'draft' ? '修改节点' : '成果'}</h2></div>
                <div className="draft-content-actions">
                  {editing ? <><button className="secondary-button" type="button" onClick={cancelEditing} disabled={busyAction !== ''}>取消编辑</button><button className="secondary-button" type="button" onClick={() => void saveModification()} disabled={busyAction !== ''}>保存修改</button></> : <button className="secondary-button" type="button" onClick={startEditing} disabled={busyAction !== ''}>编辑</button>}
                  <button className="secondary-button" type="button" onClick={() => void regenerate()} disabled={busyAction !== ''}>重新生成</button>
                  {improveBase !== null && <button className="secondary-button" type="button" onClick={() => setCompareOpen((current) => !current)} disabled={busyAction !== ''}>{compareOpen ? '关闭新旧对比' : '新旧对比'}</button>}
                  {selectedNote.draftStatus === 'draft' && <button className="primary-button" type="button" onClick={() => void saveToLesson()} disabled={busyAction !== ''}>保存到本次课次</button>}
                  <button className="secondary-button" type="button" onClick={() => void publishVersion()} disabled={busyAction !== ''}>保存为新版本</button>
                  {onOpenCourseware !== undefined && <button className="secondary-button" type="button" onClick={onOpenCourseware} disabled={busyAction !== ''}>查看课件</button>}
                </div>
              </div>
              {compareOpen && improveBase !== null && (
                <div className="draft-compare-grid">
                  <div className="draft-compare-pane"><p className="section-kicker">参考课件：{improveBase.title}</p><MarkdownDocument body={improveBase.body} files={[]} /></div>
                  <div className="draft-compare-pane"><p className="section-kicker">新工作副本（未发布）</p>{editing ? <textarea aria-label="编辑新工作副本" value={editBody} onChange={(event) => setEditBody(event.target.value)} rows={16} disabled={busyAction !== ''} /> : <MarkdownDocument body={selectedNote.bodyMd} files={[]} />}</div>
                </div>
              )}
              <div className={`draft-content-body${editing ? ' is-editing' : ' is-preview'}`}>
                {editing ? <textarea aria-label="编辑生成结果" value={editBody} onChange={(event) => setEditBody(event.target.value)} rows={24} disabled={busyAction !== ''} /> : <MarkdownDocument body={selectedNote.bodyMd} files={[]} />}
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  )
}

function ScopeFileList({ files, selection, selectedIds, onSelect, currentVersionId, emptyText }: {
  readonly files: readonly ManagedFileRecord[]
  readonly selection: 'checkbox' | 'radio' | 'summary'
  readonly selectedIds: readonly string[]
  readonly onSelect: (fileId: string) => void
  readonly currentVersionId?: string
  readonly emptyText: string
}): React.JSX.Element {
  if (files.length === 0) return <p className="empty-state prep-scope-empty">{emptyText}</p>
  return (
    <ul className="prep-scope-file-list">
      {files.map((file) => (
        <li key={file.id}>
          <label className={selectedIds.includes(file.id) ? 'is-selected' : ''}>
            {selection !== 'summary' && (
              <input
                type={selection}
                name={selection === 'radio' ? 'prep-target-file' : undefined}
                checked={selectedIds.includes(file.id)}
                onChange={() => onSelect(file.id)}
              />
            )}
            <span className="prep-scope-file-name">{file.originalName}</span>
            {file.id === currentVersionId && <span className="prep-current-badge">当前</span>}
          </label>
        </li>
      ))}
    </ul>
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


function kindIcon(kind: DraftKind): string { return kind === 'lecture' ? '讲' : kind === 'example' ? '例' : '作' }

function inferDraftKind(file: ManagedFileRecord | null): DraftKind {
  if (file === null) return DRAFT_KINDS.lecture
  if (/作业|课后|习题/u.test(file.originalName)) return DRAFT_KINDS.homework
  if (/例题|练习|题目/u.test(file.originalName)) return DRAFT_KINDS.example
  return DRAFT_KINDS.lecture
}

function uniqueFiles(files: readonly ManagedFileRecord[]): ManagedFileRecord[] {
  const seen = new Set<string>()
  return files.filter((file) => {
    if (seen.has(file.id)) return false
    seen.add(file.id)
    return true
  })
}

function formatDateTime(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('zh-CN', { hour12: false })
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : '操作失败，请稍后重试。'
}
