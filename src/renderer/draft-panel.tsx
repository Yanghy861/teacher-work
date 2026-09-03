import { toErrorMessage } from './ui-utils'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { CoreOverview, NoteRecord } from '../shared/core-contracts'
import type { ManagedFileOverview, ManagedFileRecord } from '../shared/file-contracts'
import {
  DRAFT_DEFAULT_MAX_CHARS,
  DRAFT_DEFAULT_MAX_TOKENS,
  DRAFT_KINDS,
  DRAFT_MAX_REFERENCE_FILES,
  DRAFT_REQUIREMENT_MAX_CHARS,
  type DraftKind,
} from '../shared/draft-contracts'
import {
  formatExcludedReferenceNames,
  planDraftBudget,
  type DraftBudgetEntry,
} from '../shared/draft-reference-budget'
import type { SkillRecord } from '../shared/skill-contracts'
import {
  classifyLessonCoursewareFiles,
  isAiEditableFile,
  isAppGeneratedCoursewareFile,
  orderAiEditableFiles,
  isSelectableLessonPrepFile,
  filterLessonMaterialFiles,
  listLessonPrepFiles,
  reconcileSelectedLessonFileIds,
  type LessonPrepContext,
} from './lesson-prep-context'
import { listDraftInbox, listLessonAiResults, type DraftInboxEntry } from './draft-view-model'
import { MarkdownDocument } from './lesson-material-reader'
import { useAppDialog } from './app-confirm-dialog'
import { useCoreOverview } from './core-overview-provider'
import type { PrepLaunchIntent, PrepLaunchMode } from './teaching-content-context'
import {
  buildModificationScope,
  buildModeRequirement,
  buildPublishConfirmation,
  kindLabels,
  modificationNodeLabel,
  parseModificationScope,
  type ModificationMode,
} from './draft-scope'

type BusyAction = DraftKind | 'regenerate' | 'save' | 'delete' | 'publish' | ''

interface ScopedTextPart {
  readonly fileId: string
  readonly title: string
  readonly body: string
}

interface ScopedTextResult {
  readonly baselineParts: readonly ScopedTextPart[]
  readonly referenceParts: readonly ScopedTextPart[]
  readonly truncated: boolean
}

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
  const { confirm } = useAppDialog()
  const { overview: core, error: coreLoadError, reload: reloadSharedOverview, clearError: clearCoreError } = useCoreOverview()
  const [files, setFiles] = useState<ManagedFileOverview | null>(null)
  const [skills, setSkills] = useState<readonly SkillRecord[]>([])
  const [prepMode, setPrepMode] = useState<PrepLaunchMode>('new')
  const [targetFileId, setTargetFileId] = useState('')
  const [lessonBaselineFileIds, setLessonBaselineFileIds] = useState<string[]>([])
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
  const [referenceCharCounts, setReferenceCharCounts] = useState<ReadonlyMap<string, number>>(new Map())
  const [streamState, setStreamState] = useState<{
    readonly phase: 'reasoning' | 'text'
    readonly reasoningChars: number
    readonly textPreview: string
    readonly requestId: string
    readonly startedAt: number
  } | null>(null)
  // 思考阶段的"已耗时"走本地秒表：流事件只在网络 chunk 到达时触发，
  // 推理模型可能数十秒无事件，纯事件驱动计数会长时间静止。
  const [streamElapsedSeconds, setStreamElapsedSeconds] = useState(0)
  const streamRequestId = useRef('')
  const [referenceNotice, setReferenceNotice] = useState('')
  const confirmedBudgetSignature = useRef('')
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
  const selectableLessonFiles = lessonFiles.filter(isSelectableLessonPrepFile)
  const selectableCurrentFiles = classifiedFiles.currentMaterials.filter(isSelectableLessonPrepFile)
  const appGeneratedCurrentFiles = selectableCurrentFiles.filter(isAppGeneratedCoursewareFile)
  const aiEditableCurrentFiles = orderAiEditableFiles(selectableCurrentFiles.filter(isAiEditableFile))
  const targetFile = selectableLessonFiles.find((file) => file.id === targetFileId) ?? null
  const lessonBaselineFiles = lessonBaselineFileIds
    .map((fileId) => selectableLessonFiles.find((file) => file.id === fileId))
    .filter((file): file is ManagedFileRecord => file !== undefined)
  // D27（V17-B）：单文件修改候选 = 课次全部 md（版本链最新版优先），非 md 不列。
  const modifiableCurrentFiles = prepMode === 'single'
    ? aiEditableCurrentFiles
    : selectableCurrentFiles
  const referenceCandidates = prepMode === 'single'
    ? selectableCurrentFiles.filter((file) => file.id !== targetFile?.id)
    : prepMode === 'lesson'
      ? selectableCurrentFiles.filter((file) => !lessonBaselineFiles.some((base) => base.id === file.id))
      : selectableCurrentFiles
  const selectedReferenceFiles = referenceCandidates.filter((file) => selectedReferenceFileIds.includes(file.id))
  const referenceCandidatesKey = referenceCandidates.map((file) => file.id).join('|')
  const referenceCharTotal = selectedReferenceFiles.reduce(
    (sum, file) => sum + (referenceCharCounts.get(file.id) ?? 0),
    0,
  )
  const referenceFilesFull = selectedReferenceFiles.length >= DRAFT_MAX_REFERENCE_FILES
  const baselineCharTotal = prepMode === 'single'
    ? referenceCharCounts.get(targetFile?.id ?? '') ?? 0
    : lessonBaselineFiles.reduce((sum, file) => sum + (referenceCharCounts.get(file.id) ?? 0), 0)
  const scopedCharTotal = baselineCharTotal + referenceCharTotal
  const referenceBudgetExceeded = scopedCharTotal > DRAFT_DEFAULT_MAX_CHARS
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

  useEffect(() => { clearCoreError() }, [clearCoreError])

  useEffect(() => {
    let cancelled = false
    knownLessonFileIds.current = new Set()
    scopeInitialized.current = false
    setPrepMode(launchIntent?.mode ?? 'new')
    setTargetFileId(launchIntent?.targetFileId ?? '')
    setLessonBaselineFileIds([])
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
    setReferenceNotice('')
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
      const nextMode: PrepLaunchMode = aiEditableCurrentFiles.length === 0
        ? 'new'
        : requestedMode === 'lesson' && appGeneratedCurrentFiles.length > 0 ? 'lesson' : 'single'
      const requestedTarget = aiEditableCurrentFiles.find((file) => file.id === launchIntent?.targetFileId)
      const nextTarget = requestedTarget ?? aiEditableCurrentFiles[0]
      setPrepMode(nextMode)
      setTargetFileId(nextTarget?.id ?? '')
      setLessonBaselineFileIds(nextMode === 'lesson'
        ? appGeneratedCurrentFiles.map((file) => file.id)
        : [])
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

  useEffect(() => {
    let cancelled = false
    if (files === null || selectedNote === undefined) return
    const scope = parseModificationScope(selectedNote)
    if (scope === null || selectedNote.aiMetadata === undefined) return

    const orderedSourceIds = uniqueStrings(selectedNote.aiMetadata.sources.map((source) => source.fileId))
    const baselineIds = orderedSourceIds.slice(0, scope.baselineCount)
    const referenceIds = orderedSourceIds.slice(scope.baselineCount)
    const baselineFiles = baselineIds
      .map((fileId) => lessonFiles.find((file) => file.id === fileId))
      .filter((file): file is ManagedFileRecord => file !== undefined && isSelectableLessonPrepFile(file))

    setPrepMode(scope.mode)
    setTargetFileId(scope.mode === 'single' ? baselineIds[0] ?? '' : '')
    setLessonBaselineFileIds(scope.mode === 'lesson' ? baselineIds : [])
    setSelectedReferenceFileIds(referenceIds)
    setSelectedSkillId(selectedNote.aiMetadata.skill?.id ?? '')
    setRequirement(scope.teacherRequirement)
    setImprovePhase('')
    setImprovePlan('')
    setImproveError('')
    setCompareOpen(false)

    void (async () => {
      const scopedText = await readScopedTextParts(baselineFiles, [], DRAFT_DEFAULT_MAX_CHARS)
      if (cancelled) return
      setImproveBase(buildComparisonBase(scope.mode, scopedText.baselineParts))
    })().catch((restoreError: unknown) => {
      if (cancelled) return
      setImproveBase(null)
      setImproveError(`原始对比内容暂时无法恢复：${toErrorMessage(restoreError, '操作失败，请稍后重试。')}`)
    })

    return () => { cancelled = true }
  }, [files, lessonFileKey, selectedNote?.id])

  // D25：选择区实时显示每份候选参考的字符数与累计占用；readContent 顺序读、小文件成本可接受。
  useEffect(() => {
    let cancelled = false
    if (files === null) return
    const targets = prepMode === 'single'
      ? [...(targetFile === null ? [] : [targetFile]), ...referenceCandidates]
      : [...lessonBaselineFiles, ...referenceCandidates]
    void (async () => {
      const counts = new Map<string, number>()
      for (const file of targets) {
        try {
          const content = await window.teacherWorkbench.files.readContent({ fileId: file.id })
          if (cancelled) return
          if (content.kind === 'text') counts.set(file.id, content.content.length)
        } catch {
          if (cancelled) return
        }
      }
      if (cancelled) return
      setReferenceCharCounts(new Map(counts))
    })()
    return () => { cancelled = true }
  }, [files, lessonFileKey, prepMode, targetFileId, lessonBaselineFileIds.length, referenceCandidatesKey])

  useEffect(() => {
    confirmedBudgetSignature.current = ''
  }, [selectedReferenceFileIds, targetFileId, lessonBaselineFileIds])

  // D22：订阅流事件（按 requestId 过滤）——reasoning 只累计进度计数（不展示思维链原文），text 逐字上屏。
  useEffect(() => window.teacherWorkbench.ai.onStreamEvent((event) => {
    if (event.requestId !== streamRequestId.current) return
    if (event.kind === 'reasoning') {
      setStreamState((current) => current === null
        ? current
        : { ...current, phase: 'reasoning', reasoningChars: event.chars ?? current.reasoningChars })
      return
    }
    if (event.kind === 'text' && event.text !== undefined) {
      setStreamState((current) => current === null
        ? current
        : { ...current, phase: 'text', textPreview: current.textPreview + event.text })
    }
  }), [])

  function beginStreaming(requestId: string): void {
    streamRequestId.current = requestId
    setStreamElapsedSeconds(0)
    setStreamState({ phase: 'reasoning', reasoningChars: 0, textPreview: '', requestId, startedAt: Date.now() })
  }

  function endStreaming(): void {
    streamRequestId.current = ''
    setStreamState(null)
  }

  // 流式面板显示期间每秒推进本地秒表；面板隐藏或组件卸载时停止。
  useEffect(() => {
    if (streamState === null) return
    const timer = setInterval(() => {
      setStreamElapsedSeconds(Math.max(0, Math.floor((Date.now() - streamState.startedAt) / 1000)))
    }, 1000)
    return () => clearInterval(timer)
  }, [streamState === null, streamState?.startedAt])

  async function cancelStreaming(): Promise<void> {
    if (streamState === null) return
    await window.teacherWorkbench.ai.cancel({ requestId: streamState.requestId }).catch(() => undefined)
  }

  async function reload(): Promise<CoreOverview | null> {
    try {
      const [nextFiles, nextSkills, nextCore] = await Promise.all([
        window.teacherWorkbench.files.getOverview(),
        window.teacherWorkbench.skills.list(),
        reloadSharedOverview(),
      ])
      setFiles(nextFiles)
      setSkills(nextSkills)
      setError('')
      return nextCore
    } catch (loadError) {
      setError(toErrorMessage(loadError, '操作失败，请稍后重试。'))
      return null
    }
  }

  function toggleReferenceFile(fileId: string): void {
    const file = referenceCandidates.find((candidate) => candidate.id === fileId)
    if (file === undefined) return
    setSelectedReferenceFileIds((current) => {
      if (current.includes(fileId)) return current.filter((id) => id !== fileId)
      // D25：补充参考最多 10 份，超限禁止继续勾选并提示。
      if (current.length >= DRAFT_MAX_REFERENCE_FILES) {
        setReferenceNotice(`补充参考最多选择 ${DRAFT_MAX_REFERENCE_FILES} 份，请先取消一份再勾选。`)
        return current
      }
      setReferenceNotice('')
      return [...current, fileId]
    })
  }

  function selectTargetFile(fileId: string): void {
    if (!modifiableCurrentFiles.some((file) => file.id === fileId)) return
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
    // D27：单文件模式只需课次内存在 md；整课重做沿用应用内课件版本基线（V17-B 不动）。
    const modeAvailable = nextMode === 'single'
      ? aiEditableCurrentFiles.length > 0
      : appGeneratedCurrentFiles.length > 0
    if (!modeAvailable || prepMode === nextMode) return
    setPrepMode(nextMode)
    if (nextMode === 'single' && !modifiableCurrentFiles.some((file) => file.id === targetFileId)) {
      setTargetFileId(classifiedFiles.currentVersion?.id ?? modifiableCurrentFiles[0]?.id ?? '')
    }
    if (nextMode === 'lesson') {
      setLessonBaselineFileIds(appGeneratedCurrentFiles.map((file) => file.id))
    }
    setSelectedReferenceFileIds([])
    setReferenceNotice('')
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
    const requestId = globalThis.crypto.randomUUID()
    setMessage(`正在生成${kindLabels[kind]}…`)
    setError('')
    beginStreaming(requestId)
    try {
      const result = await window.teacherWorkbench.drafts.generate({
        requestId,
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
      setError(toErrorMessage(generationError, '操作失败，请稍后重试。'))
    } finally {
      endStreaming()
      setBusyAction('')
    }
  }

  function buildBudgetEntries(files: readonly ManagedFileRecord[]): DraftBudgetEntry[] {
    return files.flatMap((file) => {
      const chars = referenceCharCounts.get(file.id)
      return chars === undefined ? [] : [{ fileId: file.id, title: file.originalName, chars }]
    })
  }

  /** D25：发起前预算检查——预算耗尽时明确列出未纳入/未完整纳入的参考，需老师确认继续或删减（同一确认在方案与确认生成间复用）。 */
  async function confirmReferenceBudget(baselineFiles: readonly ManagedFileRecord[]): Promise<boolean> {
    const baseline = buildBudgetEntries(baselineFiles)
    const references = buildBudgetEntries(selectedReferenceFiles)
    const plan = planDraftBudget(baseline, references, DRAFT_DEFAULT_MAX_CHARS)
    const unmeasuredCount = selectedReferenceFiles.filter(
      (file) => !referenceCharCounts.has(file.id),
    ).length
    const overflowCount = plan.excludedReferences.length
    if (overflowCount === 0 && unmeasuredCount === 0) return true
    const signature = `${baselineFiles.map((file) => file.id).join(',')}#${selectedReferenceFiles.map((file) => file.id).join(',')}:${overflowCount}`
    if (signature === confirmedBudgetSignature.current) return true
    const overflowNames = overflowCount > 0
      ? `按 ${DRAFT_DEFAULT_MAX_CHARS} 字预算，以下参考未纳入或未完整纳入：${formatExcludedReferenceNames(plan.excludedReferences)}。`
      : ''
    const unmeasuredHint = unmeasuredCount > 0
      ? `${unmeasuredCount} 份参考（如 Office/PDF）无法预读字符数，实际发送时按解析文本优先计入。`
      : ''
    const confirmed = await confirm({
      title: '部分参考未完整纳入本次 AI 请求',
      description: <>{overflowNames}{overflowNames !== '' && unmeasuredHint !== '' ? ' ' : ''}{unmeasuredHint}<br />可以继续生成，也可以返回取消勾选。</>,
      confirmLabel: '继续生成',
    })
    if (!confirmed) return false
    confirmedBudgetSignature.current = signature
    return true
  }

  async function startImprovePlan(): Promise<void> {
    if (prepMode === 'new') return
    const baselineFiles = prepMode === 'single'
      ? targetFile === null ? [] : [targetFile]
      : lessonBaselineFiles
    if (baselineFiles.length === 0) {
      setImproveError(prepMode === 'single' ? '请先选择要修改的文件。' : '本课没有可用于整课重做的基线内容。')
      return
    }
    if (requirement.trim() === '') {
      setImproveError('请先填写本次修改要求，AI 需要知道你想怎么改。')
      return
    }
    if (!await confirmReferenceBudget(baselineFiles)) {
      setImproveError('已取消。请删减补充参考后重试，或再次发起并选择“继续生成”。')
      return
    }
    const planRequestId = globalThis.crypto.randomUUID()
    setImproveBusy(true)
    setImproveError('')
    setMessage('正在生成修改方案…')
    beginStreaming(planRequestId)
    try {
      const scopedText = await readScopedTextParts(
        baselineFiles,
        selectedReferenceFiles,
        DRAFT_DEFAULT_MAX_CHARS,
      )
      if (scopedText.baselineParts.length === 0) {
        setImproveError(prepMode === 'single'
          ? '修改对象没有可读文本，无法生成修改方案。'
          : '本课基线没有可读文本，无法生成整课重做方案。')
        setMessage('')
        return
      }
      const prompt = buildPlanPrompt(prepMode, requirement.trim(), scopedText)
      const result = await window.teacherWorkbench.ai.requestText({
        requestId: planRequestId,
        prompt,
        maxTokens: DRAFT_DEFAULT_MAX_TOKENS,
        stream: true,
      })
      setImprovePlan(result.text)
      setImproveBase(buildComparisonBase(prepMode, scopedText.baselineParts))
      setImprovePhase('review')
      setMessage(prepMode === 'single'
        ? '单文件修改方案已生成，请审阅确认后再生成新副本。'
        : '整课重做方案已生成，请审阅确认后再生成完整新版本。')
    } catch (planError) {
      setMessage('')
      setImproveError(toErrorMessage(planError, '操作失败，请稍后重试。'))
    } finally {
      endStreaming()
      setImproveBusy(false)
    }
  }

  async function confirmPlanAndGenerate(kind: DraftKind): Promise<void> {
    if (context === null || improvePlan.trim() === '' || prepMode === 'new') return
    const baselineFiles = prepMode === 'single'
      ? targetFile === null ? [] : [targetFile]
      : lessonBaselineFiles
    if (baselineFiles.length === 0) {
      setImproveError('修改对象或整课基线已变化，请重新发起修改。')
      return
    }
    if (!await confirmReferenceBudget(baselineFiles)) {
      setImproveError('已取消。请删减补充参考后重试，或再次确认并选择“继续生成”。')
      return
    }
    const orderedSources = uniqueFiles([...baselineFiles, ...selectedReferenceFiles])
    const generatedKind = prepMode === 'lesson' ? DRAFT_KINDS.lecture : kind
    const streamRequestId = globalThis.crypto.randomUUID()
    setImproveBusy(true)
    setImproveError('')
    setMessage(prepMode === 'single'
      ? `正在按确认的方案修订《${baselineFiles[0].originalName}》…`
      : '正在按确认的方案重做整课课件…')
    beginStreaming(streamRequestId)
    try {
      const teacherRequirement = requirement.trim()
      const confirmedPlan = improvePlan.trim()
      const embeddedRequirement = buildModeRequirement(
        prepMode,
        baselineFiles[0],
        baselineFiles.length,
        teacherRequirement,
        confirmedPlan,
      )
      const modification = buildModificationScope(
        prepMode,
        prepMode === 'single' ? baselineFiles[0] : null,
        baselineFiles.length,
        teacherRequirement,
        confirmedPlan,
      )
      const result = await window.teacherWorkbench.drafts.generate({
        requestId: streamRequestId,
        kind: generatedKind,
        lessonId: context.lessonId,
        ...(context.studentId === undefined ? {} : { studentId: context.studentId }),
        ...(selectedSkillId === '' ? {} : { skillId: selectedSkillId }),
        requirement: embeddedRequirement,
        modification,
        sources: orderedSources.map((file) => ({ fileId: file.id })),
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
      setMessage(prepMode === 'single'
        ? `《${baselineFiles[0].originalName}》已按方案生成完整修订稿，可用“新旧对比”查看差异。`
        : '整课完整新版本已生成，包含讲义、例题、课堂练习与课后作业，可用“新旧对比”审阅。')
    } catch (generationError) {
      setMessage('')
      setImproveError(toErrorMessage(generationError, '操作失败，请稍后重试。'))
    } finally {
      endStreaming()
      setImproveBusy(false)
    }
  }

  async function publishVersion(): Promise<void> {
    if (selectedNote === undefined) return
    if (!await confirm({
      title: '保存为新版本？',
      description: buildPublishConfirmation(selectedNote),
      confirmLabel: '保存为新版本',
    })) return
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
      setError(toErrorMessage(publishError, '操作失败，请稍后重试。'))
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

  async function selectResult(note: NoteRecord): Promise<void> {
    if (dirty && !await confirm({
      title: '切换修改记录？',
      description: '当前修改尚未保存，切换后将丢失本次编辑。',
      confirmLabel: '继续切换',
      destructive: true,
    })) return
    setRestoreNoticeVisible(false)
    setSelectedNoteId(note.id)
    setEditing(false)
    setEditBody('')
    setImprovePhase('')
    setImprovePlan('')
    setImproveError('')
    setImproveBase(null)
    setCompareOpen(false)
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
      setError(toErrorMessage(saveError, '操作失败，请稍后重试。'))
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
      setError(toErrorMessage(saveError, '操作失败，请稍后重试。'))
    } finally {
      setBusyAction('')
    }
  }

  async function regenerate(): Promise<void> {
    if (selectedNote === undefined) return
    if (dirty && !await confirm({
      title: '重新生成修改稿？',
      description: '当前修改尚未保存。重新生成会保留旧草稿，但不会保存这次编辑。',
      confirmLabel: '重新生成',
      destructive: true,
    })) return
    setBusyAction('regenerate')
    const requestId = globalThis.crypto.randomUUID()
    setMessage('正在重新生成，旧结果会继续保留…')
    setError('')
    beginStreaming(requestId)
    try {
      const result = await window.teacherWorkbench.drafts.regenerate({
        requestId,
        noteId: selectedNote.id,
      })
      await reload()
      setSelectedNoteId(result.noteId)
      setEditing(false)
      setEditBody('')
      setMessage('已生成新草稿，旧结果仍然保留。')
    } catch (regenerationError) {
      setMessage('')
      setError(toErrorMessage(regenerationError, '操作失败，请稍后重试。'))
    } finally {
      endStreaming()
      setBusyAction('')
    }
  }

  async function deleteDraft(note: NoteRecord): Promise<void> {
    if (note.draftStatus !== 'draft') return
    if (!await confirm({
      title: '删除未发布修改？',
      description: `这份${kindLabels[note.noteKind as DraftKind]}修改节点尚未发布，删除后无法恢复。`,
      confirmLabel: '删除修改',
      destructive: true,
    })) return
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
      setError(toErrorMessage(deleteError, '操作失败，请稍后重试。'))
    } finally {
      setBusyAction('')
    }
  }

  if (context === null) {
    return (
      <DraftInbox
        core={core}
        busy={busyAction !== ''}
        error={error !== '' ? error : coreLoadError}
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
      {prepMode !== 'new' && (
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
              <div className="card-heading"><div><p className="section-kicker">修改对象</p><h2>选择一份课件版本</h2></div><span className="count-label">单选</span></div>
              <ScopeFileList files={modifiableCurrentFiles} selection="radio" selectedIds={targetFile === null ? [] : [targetFile.id]} onSelect={selectTargetFile} currentVersionId={classifiedFiles.currentVersion?.id} charCounts={referenceCharCounts} emptyText="本课还没有 Markdown 课件，可先导入 md 讲义或用 AI 生成第一版课件。" />
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
              <div className="card-heading"><div><p className="section-kicker">可选</p><h2>补充参考</h2></div><span className="count-label">{selectedReferenceFiles.length} / {DRAFT_MAX_REFERENCE_FILES} 份</span></div>
              <p className="prep-reference-hint">只帮助 AI 理解要求，不会改变修改对象。</p>
              <ScopeFileList files={referenceCandidates} selection="checkbox" selectedIds={selectedReferenceFileIds} onSelect={toggleReferenceFile} currentVersionId={classifiedFiles.currentVersion?.id} charCounts={referenceCharCounts} emptyText="没有额外参考；可从外部资料或素材库添加。" />
              <p className={`prep-budget-hint${referenceBudgetExceeded ? ' is-over' : ''}`} role="status">
                {referenceNotice !== '' ? `${referenceNotice} ` : ''}
                参考已占用 {referenceCharTotal.toLocaleString('zh-CN')} / {DRAFT_DEFAULT_MAX_CHARS.toLocaleString('zh-CN')} 字（含修改对象共 {scopedCharTotal.toLocaleString('zh-CN')} 字）{referenceFilesFull ? `；已选满 ${DRAFT_MAX_REFERENCE_FILES} 份` : ''}
              </p>
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
                  <button type="button" className="draft-result-select" onClick={() => { void selectResult(note) }} disabled={busyAction !== ''}>
                    <span className="draft-kind-icon" aria-hidden="true">{kindIcon(kind)}</span>
                    <span><strong>{modificationNodeLabel(note)}</strong><small>{formatDateTime(note.updatedAt)}</small></span>
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
            {prepMode === 'single' && aiEditableCurrentFiles.length === 0 && (
              <div className="inline-notice" role="status">
                本课还没有 Markdown 课件，可先导入 md 讲义或用 AI 生成第一版课件。
              </div>
            )}
            {prepMode === 'lesson' && appGeneratedCurrentFiles.length === 0 && (
              <div className="inline-notice" role="status">
                本课还没有应用内生成的课件版本，整课重做需要先用 AI 生成第一版课件；单文件修改已支持外部导入的 md。
              </div>
            )}
          </div>
          {streamState !== null && (
            <div className="draft-stream-panel" role="status">
              <div className="draft-stream-head">
                <strong>{streamState.phase === 'reasoning' ? 'AI 正在思考…' : 'AI 正在生成正文…'}</strong>
                <button className="secondary-button" type="button" onClick={() => { void cancelStreaming() }}>取消生成</button>
              </div>
              <p className="draft-stream-reasoning">AI 思考中…（已思考 {streamState.reasoningChars.toLocaleString('zh-CN')} 字，已耗时 {streamElapsedSeconds} 秒）</p>
              {streamState.textPreview !== '' && (
                <div className="draft-stream-preview">
                  <MarkdownDocument body={streamState.textPreview} files={[]} />
                </div>
              )}
            </div>
          )}
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
                <div><p className="section-kicker">{selectedNote.draftStatus === 'draft' ? '修改中 · 尚未发布' : '已确认 · 本次课次成果'}</p><h2>{modificationNodeLabel(selectedNote)}</h2></div>
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

function ScopeFileList({ files, selection, selectedIds, onSelect, currentVersionId, charCounts, emptyText }: {
  readonly files: readonly ManagedFileRecord[]
  readonly selection: 'checkbox' | 'radio' | 'summary'
  readonly selectedIds: readonly string[]
  readonly onSelect: (fileId: string) => void
  readonly currentVersionId?: string
  readonly charCounts?: ReadonlyMap<string, number>
  readonly emptyText: string
}): React.JSX.Element {
  if (files.length === 0) return <p className="empty-state prep-scope-empty">{emptyText}</p>
  return (
    <ul className="prep-scope-file-list">
      {files.map((file) => {
        const chars = charCounts?.get(file.id)
        return (
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
              {chars !== undefined && <span className="prep-scope-file-chars">{chars.toLocaleString('zh-CN')} 字</span>}
              {file.id === currentVersionId && <span className="prep-current-badge">当前</span>}
            </label>
          </li>
        )
      })}
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
        <span><strong>{modificationNodeLabel(entry.note)}</strong><small>{entry.courseTitle} / {entry.lessonTitle}</small></span>
        <time dateTime={entry.note.updatedAt}>{formatDateTime(entry.note.updatedAt)}</time>
      </button>
      <button className="danger-button" type="button" disabled={busy} onClick={() => onDeleteDraft(entry.note)}>删除</button>
    </li>
  )
}

async function readScopedTextParts(
  baselineFiles: readonly ManagedFileRecord[],
  referenceFiles: readonly ManagedFileRecord[],
  maxChars: number,
): Promise<ScopedTextResult> {
  let remaining = maxChars
  let truncated = false

  async function readGroup(group: readonly ManagedFileRecord[]): Promise<ScopedTextPart[]> {
    const parts: ScopedTextPart[] = []
    for (const file of group) {
      if (remaining <= 0) {
        truncated = true
        break
      }
      const content = await window.teacherWorkbench.files.readContent({ fileId: file.id })
      if (content.kind !== 'text' || content.content.trim() === '') continue
      const body = content.content.slice(0, remaining)
      if (body.length < content.content.length) truncated = true
      if (body.trim() === '') continue
      parts.push({ fileId: file.id, title: file.originalName, body })
      remaining -= body.length
    }
    return parts
  }

  const baselineParts = await readGroup(baselineFiles)
  const referenceParts = await readGroup(referenceFiles)
  return { baselineParts, referenceParts, truncated }
}

function buildPlanPrompt(
  mode: ModificationMode,
  teacherRequirement: string,
  scopedText: ScopedTextResult,
): string {
  const baselineHeading = mode === 'single' ? '唯一修改对象' : '自动整课基线'
  const roleInstruction = mode === 'single'
    ? '老师要修改一份指定课件。只能把「唯一修改对象」视为待修改文件；补充参考只用于理解要求，不能变成额外修改对象。'
    : '老师要按新要求重做整节课。请把「自动整课基线」视为原课完整范围；补充参考只用于辅助，不得替代基线。'
  const planInstruction = mode === 'single'
    ? '分条说明对目标文件每处「改什么、为什么、怎么改」；未被要求修改的内容应保持；不要输出修改后的全文。'
    : '先概括整课结构与难度调整，再分条说明讲义、典型例题、课堂互动练习、课后作业及其衔接各自「改什么、为什么、怎么改」；不要输出重做后的全文。'
  return [
    '你是一位备课助理。请基于老师的明确要求，输出一份可审阅的修改方案。',
    roleInstruction,
    `${planInstruction} 全文控制在 500 字以内，使用中文。`,
    `老师修改要求：${teacherRequirement}`,
    `${baselineHeading}：`,
    ...scopedText.baselineParts.map(formatScopedTextPart),
    ...(scopedText.referenceParts.length === 0
      ? ['补充参考：无']
      : ['补充参考（只辅助理解）：', ...scopedText.referenceParts.map(formatScopedTextPart)]),
  ].join(String.fromCharCode(10, 10))
}

function buildComparisonBase(
  mode: ModificationMode,
  baselineParts: readonly ScopedTextPart[],
): { title: string; body: string } | null {
  if (baselineParts.length === 0) return null
  if (mode === 'single') {
    return { title: baselineParts[0].title, body: baselineParts[0].body }
  }
  return {
    title: `整课原始基线（${baselineParts.length} 份）`,
    body: baselineParts.map((part) => `## ${part.title}${String.fromCharCode(10, 10)}${part.body}`).join(String.fromCharCode(10, 10)),
  }
}

function formatScopedTextPart(part: ScopedTextPart): string {
  return `【${part.title}】${String.fromCharCode(10)}${part.body}`
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
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
