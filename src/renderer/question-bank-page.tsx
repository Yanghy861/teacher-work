import { useEffect, useMemo, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

import type { CoreOverview, NodeRecord } from '../shared/core-contracts'
import type {
  QuestionBankDetail,
  QuestionBankSearchItem,
  QuestionBankSearchRequest,
  QuestionBankSearchResult,
  QuestionBankSummary,
} from '../shared/question-bank-contracts'
import Modal from './modal'
import './question-bank.css'

interface FilterState {
  readonly text: string
  readonly grade: string
  readonly year: string
  readonly month: string
  readonly type: string
  readonly tag: string
  readonly difficultyMin: string
  readonly difficultyMax: string
}

const EMPTY_FILTERS: FilterState = {
  text: '',
  grade: '',
  year: '',
  month: '',
  type: '',
  tag: '',
  difficultyMin: '',
  difficultyMax: '',
}

export default function QuestionBankPage(): React.JSX.Element {
  const [summary, setSummary] = useState<QuestionBankSummary | null>(null)
  const [coreOverview, setCoreOverview] = useState<CoreOverview | null>(null)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [result, setResult] = useState<QuestionBankSearchResult | null>(null)
  const [offset, setOffset] = useState(0)
  const [selectedQuestionId, setSelectedQuestionId] = useState('')
  const [detail, setDetail] = useState<QuestionBankDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copyModalOpen, setCopyModalOpen] = useState(false)
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [selectedLessonId, setSelectedLessonId] = useState('')

  const courseTargets = useMemo(() => buildCourseTargets(coreOverview), [coreOverview])
  const selectedCourse = courseTargets.find((target) => target.course.id === selectedCourseId) ?? null

  useEffect(() => {
    let active = true
    void Promise.all([
      window.teacherWorkbench.questionBank.getSummary(),
      window.teacherWorkbench.core.getOverview(),
    ]).then(([nextSummary, nextCore]) => {
      if (!active) return
      setSummary(nextSummary)
      setCoreOverview(nextCore)
      setError('')
    }).catch((loadError: unknown) => {
      if (active) setError(toErrorMessage(loadError, '无法读取题库。'))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (summary?.installed !== true) return
    let active = true
    const timer = window.setTimeout(() => {
      setSearching(true)
      void window.teacherWorkbench.questionBank.search(toSearchRequest(filters, offset))
        .then((nextResult) => {
          if (!active) return
          setResult(nextResult)
          setError('')
          setSelectedQuestionId((current) =>
            current !== '' && nextResult.items.some((item) => item.id === current)
              ? current
              : '',
          )
        })
        .catch((searchError: unknown) => {
          if (active) setError(toErrorMessage(searchError, '题库搜索失败。'))
        })
        .finally(() => {
          if (active) setSearching(false)
        })
    }, 220)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [summary?.packageId, filters, offset])

  useEffect(() => {
    if (selectedQuestionId === '') {
      setDetail(null)
      return
    }
    let active = true
    setDetail(null)
    setDetailLoading(true)
    void window.teacherWorkbench.questionBank.getQuestion({ questionId: selectedQuestionId })
      .then((nextDetail) => {
        if (active) {
          setDetail(nextDetail)
          setError('')
        }
      })
      .catch((detailError: unknown) => {
        if (active) setError(toErrorMessage(detailError, '无法读取题目详情。'))
      })
      .finally(() => {
        if (active) setDetailLoading(false)
      })
    return () => { active = false }
  }, [selectedQuestionId])

  useEffect(() => {
    if (courseTargets.length === 0) {
      setSelectedCourseId('')
      setSelectedLessonId('')
      return
    }
    if (!courseTargets.some((target) => target.course.id === selectedCourseId)) {
      setSelectedCourseId(courseTargets[0]?.course.id ?? '')
    }
  }, [courseTargets, selectedCourseId])

  useEffect(() => {
    const lessons = selectedCourse?.lessons ?? []
    if (!lessons.some((lesson) => lesson.id === selectedLessonId)) {
      setSelectedLessonId(lessons[0]?.id ?? '')
    }
  }, [selectedCourse, selectedLessonId])

  function updateFilter<Key extends keyof FilterState>(key: Key, value: FilterState[Key]): void {
    setFilters((current) => ({ ...current, [key]: value }))
    setOffset(0)
  }

  async function importSnapshot(): Promise<void> {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const imported = await window.teacherWorkbench.questionBank.chooseAndImport()
      if (imported === null) {
        setNotice('已取消导入。')
        return
      }
      setSummary(imported)
      setFilters(EMPTY_FILTERS)
      setOffset(0)
      setSelectedQuestionId('')
      setDetail(null)
      setNotice(`题库已导入，共 ${imported.questionCount.toLocaleString('zh-CN')} 道题。`)
    } catch (importError) {
      setError(toErrorMessage(importError, '题库导入失败。'))
    } finally {
      setBusy(false)
    }
  }

  async function copyToLibrary(): Promise<void> {
    if (detail === null) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const file = await window.teacherWorkbench.questionBank.copyToLibrary({ questionId: detail.id })
      setNotice(`“${file.originalName}”已作为独立副本导入素材库。`)
    } catch (copyError) {
      setError(toErrorMessage(copyError, '题目导入素材库失败。'))
    } finally {
      setBusy(false)
    }
  }

  async function copyToLesson(): Promise<void> {
    if (detail === null || selectedLessonId === '') return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const file = await window.teacherWorkbench.questionBank.copyToLesson({
        questionId: detail.id,
        lessonId: selectedLessonId,
      })
      setNotice(`“${file.originalName}”已加入所选课次。`)
      setCopyModalOpen(false)
    } catch (copyError) {
      setError(toErrorMessage(copyError, '题目加入课次失败。'))
    } finally {
      setBusy(false)
    }
  }

  if (loading && summary === null) {
    return <section className="workspace-card">正在读取题库…</section>
  }

  if (summary?.installed !== true) {
    return (
      <section className="question-bank-empty workspace-card" aria-live="polite">
        {error !== '' && <div className="inline-error" role="alert">{error}</div>}
        {notice !== '' && <div className="inline-notice" role="status">{notice}</div>}
        <div className="question-bank-empty-icon" aria-hidden="true">题</div>
        <p className="section-kicker">本地只读题库</p>
        <h1>导入题库后开始找题</h1>
        <p>选择一个完整的 <code>.tqbank</code> 快照。工作台只读取自己的副本，不会修改旧题库。</p>
        <button className="primary-button" type="button" onClick={() => void importSnapshot()} disabled={busy}>
          {busy ? '正在导入…' : '导入题库快照'}
        </button>
      </section>
    )
  }

  return (
    <div className="question-bank-page" aria-live="polite">
      <header className="question-bank-topbar">
        <div>
          <p className="section-kicker">本地只读题库</p>
          <h1>题库</h1>
          <p>
            {summary.questionCount.toLocaleString('zh-CN')} 道题 · {summary.paperCount.toLocaleString('zh-CN')} 份试卷
            {summary.exportedAt === null ? '' : ` · ${formatDate(summary.exportedAt)} 导出`}
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void importSnapshot()} disabled={busy}>
          {busy ? '正在处理…' : '更换题库'}
        </button>
      </header>

      {error !== '' && <div className="inline-error" role="alert">{error}</div>}
      {notice !== '' && <div className="inline-notice" role="status">{notice}</div>}

      <div className={`question-bank-workspace${selectedQuestionId === '' ? '' : ' is-detail-open'}`}>
        <aside className="question-bank-browser">
          <div className="question-bank-searchbox">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={filters.text}
              onChange={(event) => updateFilter('text', event.target.value)}
              placeholder="搜索题干、答案、解析或试卷名"
              aria-label="搜索题库"
            />
            {searching && <small>搜索中</small>}
          </div>
          <div className="question-bank-filters">
            <FacetSelect label="年级" value={filters.grade} options={summary.grades} onChange={(value) => updateFilter('grade', value)} />
            <FacetSelect label="年份" value={filters.year} options={summary.years} onChange={(value) => updateFilter('year', value)} />
            <FacetSelect label="月份" value={filters.month} options={summary.months} onChange={(value) => updateFilter('month', value)} />
            <FacetSelect label="题型" value={filters.type} options={summary.types} onChange={(value) => updateFilter('type', value)} />
            <FacetSelect label="标签" value={filters.tag} options={summary.tags} onChange={(value) => updateFilter('tag', value)} />
            <label className="question-bank-difficulty">
              <span>难度</span>
              <input type="number" min="0" max="100" value={filters.difficultyMin} placeholder="最低" onChange={(event) => updateFilter('difficultyMin', event.target.value)} />
              <b>—</b>
              <input type="number" min="0" max="100" value={filters.difficultyMax} placeholder="最高" onChange={(event) => updateFilter('difficultyMax', event.target.value)} />
            </label>
            <button className="question-bank-clear" type="button" onClick={() => { setFilters(EMPTY_FILTERS); setOffset(0) }}>
              清除筛选
            </button>
          </div>

          <div className="question-bank-results-heading">
            <strong>{result?.total.toLocaleString('zh-CN') ?? '—'} 道题</strong>
            <span>点击题目查看详情</span>
          </div>
          <div className="question-bank-results">
            {result?.items.map((item) => (
              <QuestionResultCard
                key={item.id}
                item={item}
                selected={item.id === selectedQuestionId}
                onSelect={() => setSelectedQuestionId(item.id)}
              />
            ))}
            {result !== null && result.items.length === 0 && (
              <div className="question-bank-no-results">没有符合当前条件的题目。</div>
            )}
          </div>
          <div className="question-bank-pagination">
            <button type="button" disabled={offset === 0 || searching} onClick={() => setOffset(Math.max(0, offset - 50))}>上一页</button>
            <span>第 {Math.floor(offset / 50) + 1} 页</span>
            <button type="button" disabled={result === null || offset + result.limit >= result.total || searching} onClick={() => setOffset(offset + 50)}>下一页</button>
          </div>
        </aside>

        {selectedQuestionId !== '' && <main className="question-bank-detail-pane">
          {detailLoading && detail === null ? (
            <div className="question-bank-detail-empty">正在读取题目…</div>
          ) : detail === null ? (
            <div className="question-bank-detail-empty">从左侧选择一道题查看。</div>
          ) : (
            <QuestionDetailView
              detail={detail}
              busy={busy}
              onCopyToLibrary={() => void copyToLibrary()}
              onOpenLessonCopy={() => setCopyModalOpen(true)}
              canCopyToLesson={courseTargets.some((target) => target.lessons.length > 0)}
              onClose={() => setSelectedQuestionId('')}
            />
          )}
        </main>}
      </div>

      {copyModalOpen && detail !== null && (
        <Modal
          title="加入课程"
          description="题目会生成独立 Markdown 副本，并关联到具体课次。"
          onClose={() => setCopyModalOpen(false)}
        >
          <div className="modal-form">
            <label className="modal-field">
              课程
              <select value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)} disabled={busy}>
                {courseTargets.map((target) => (
                  <option key={target.course.id} value={target.course.id}>{target.label}</option>
                ))}
              </select>
            </label>
            <label className="modal-field">
              课次
              <select value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)} disabled={busy}>
                {(selectedCourse?.lessons ?? []).map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>{lesson.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={() => setCopyModalOpen(false)} disabled={busy}>取消</button>
            <button className="primary-button" type="button" onClick={() => void copyToLesson()} disabled={busy || selectedLessonId === ''}>
              {busy ? '正在加入…' : '加入课次'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function FacetSelect({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string
  readonly value: string
  readonly options: QuestionBankSummary['grades']
  readonly onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">全部</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}（{option.count}）</option>
        ))}
      </select>
    </label>
  )
}

function QuestionResultCard({
  item,
  selected,
  onSelect,
}: {
  readonly item: QuestionBankSearchItem
  readonly selected: boolean
  readonly onSelect: () => void
}): React.JSX.Element {
  return (
    <button className={`question-result-card${selected ? ' is-selected' : ''}`} type="button" onClick={onSelect}>
      <span className="question-result-meta">
        <b>{item.typeLabel}</b>
        {item.grade !== null && <em>{item.grade}</em>}
        {item.difficulty !== null && <em>难度 {item.difficulty}</em>}
        {item.hasAssets && <em>含图</em>}
      </span>
      <span className="question-result-content">{item.contentPreview || '（题干为空）'}</span>
      <span className="question-result-source">
        {item.paperTitle ?? '来源未注明'}{item.questionNo === null ? '' : ` · 第 ${item.questionNo} 题`}
      </span>
      {item.tags.length > 0 && <span className="question-result-tags">{item.tags.slice(0, 4).map((tag) => <i key={tag}>{tag}</i>)}</span>}
    </button>
  )
}

function QuestionDetailView({
  detail,
  busy,
  onCopyToLibrary,
  onOpenLessonCopy,
  canCopyToLesson,
  onClose,
}: {
  readonly detail: QuestionBankDetail
  readonly busy: boolean
  readonly onCopyToLibrary: () => void
  readonly onOpenLessonCopy: () => void
  readonly canCopyToLesson: boolean
  readonly onClose: () => void
}): React.JSX.Element {
  const solutionAssets = detail.assets.filter((asset) => isSolutionAsset(asset.role))
  const stemAssets = detail.assets.filter((asset) => !isSolutionAsset(asset.role))
  const separateOptions = hasInlineOptionMarkers(detail.content, detail.options)
    ? []
    : detail.options
  return (
    <article className="question-detail-card">
      <header className="question-detail-header">
        <div>
          <span className="question-detail-badges">
            <b>{detail.typeLabel}</b>
            {detail.grade !== null && <em>{detail.grade}</em>}
            {detail.score !== null && <em>{detail.score} 分</em>}
            {detail.difficulty !== null && <em>难度 {detail.difficulty}</em>}
          </span>
          <h2>{detail.questionNo === null ? '题目' : `第 ${detail.questionNo} 题`}</h2>
        </div>
        <div className="question-detail-actions">
          <button className="secondary-button" type="button" onClick={onCopyToLibrary} disabled={busy}>导入素材库</button>
          <button className="primary-button" type="button" onClick={onOpenLessonCopy} disabled={busy || !canCopyToLesson}>加入课程</button>
          <button className="question-detail-close" type="button" onClick={onClose} aria-label="收起题目详情">×</button>
        </div>
      </header>

      <section className="question-detail-stem">
        <QuestionText text={detail.content} />
        {separateOptions.length > 0 && (
          <ol className="question-detail-options">
            {separateOptions.map((option) => <li key={option.key}><b>{option.key}.</b><QuestionText text={option.text} /></li>)}
          </ol>
        )}
        {stemAssets.map((asset, index) => (
          <figure key={`${asset.id}-${asset.role}-${index}`}>
            <img src={asset.dataUrl} alt={`题目图片 ${index + 1}`} />
          </figure>
        ))}
      </section>

      <details className="question-detail-solution">
        <summary>查看答案</summary>
        <QuestionText text={detail.answer || '原题库未提供答案。'} />
      </details>
      <details className="question-detail-solution">
        <summary>查看解析</summary>
        <QuestionText text={detail.analysis || '原题库未提供解析。'} />
        {solutionAssets.map((asset, index) => (
          <figure key={`${asset.id}-${asset.role}-${index}`}>
            <img src={asset.dataUrl} alt={`解析图片 ${index + 1}`} />
          </figure>
        ))}
      </details>

      <footer className="question-detail-source">
        <strong>{detail.paperTitle ?? '来源未注明'}</strong>
        <span>{[
          detail.year === null ? null : `${detail.year} 年`,
          detail.month === null ? null : `${detail.month} 月`,
          detail.region,
          detail.examType,
          detail.semester,
        ].filter(Boolean).join(' · ') || '无更多来源信息'}</span>
        {detail.tags.length > 0 && <div>{detail.tags.map((tag) => <i key={tag}>{tag}</i>)}</div>}
      </footer>
    </article>
  )
}

function QuestionText({ text }: { readonly text: string }): React.JSX.Element {
  const parts = splitMathText(text || '（内容为空）')
  return (
    <div className="question-rich-text">
      {parts.map((part, index) => part.formula === null ? (
        <span key={index}>{part.text}</span>
      ) : (
        <span
          className={part.displayMode ? 'question-math-display' : 'question-math-inline'}
          // KaTeX escapes source text and trust stays disabled, so imported questions cannot inject HTML.
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(part.formula, {
              displayMode: part.displayMode,
              throwOnError: false,
              strict: false,
              trust: false,
              output: 'htmlAndMathml',
            }),
          }}
          key={index}
        />
      ))}
    </div>
  )
}

interface MathTextPart {
  readonly text: string
  readonly formula: string | null
  readonly displayMode: boolean
}

function splitMathText(text: string): MathTextPart[] {
  const pattern = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$(?:\\.|[^$\\])+\$|\\\((?:\\.|[^\\])*?\\\))/gu
  const parts: MathTextPart[] = []
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index
    if (index > cursor) parts.push({ text: text.slice(cursor, index), formula: null, displayMode: false })
    const token = match[0]
    const displayMode = token.startsWith('$$') || token.startsWith('\\[')
    const formula = token.startsWith('$$') || token.startsWith('\\[') || token.startsWith('\\(')
      ? token.slice(2, -2)
      : token.slice(1, -1)
    parts.push({ text: '', formula, displayMode })
    cursor = index + token.length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), formula: null, displayMode: false })
  return parts.length === 0 ? [{ text, formula: null, displayMode: false }] : parts
}

interface CourseTarget {
  readonly course: NodeRecord
  readonly label: string
  readonly lessons: readonly { readonly id: string; readonly label: string }[]
}

function buildCourseTargets(overview: CoreOverview | null): CourseTarget[] {
  if (overview === null) return []
  const activeNodes = overview.nodes.filter((node) => node.deletedAt === null)
  const endedCourseIds = new Set(
    overview.courseProgress.filter((progress) => progress.endedAt !== null).map((progress) => progress.courseId),
  )
  const studentById = new Map(overview.students.map((student) => [student.id, student.name]))
  return activeNodes.filter((node) => node.kind === 'course' && !endedCourseIds.has(node.id)).map((course) => {
    const periods = activeNodes.filter((node) => node.kind === 'period' && node.parentId === course.id)
      .sort(sortNodes)
    const lessons = periods.flatMap((period) => activeNodes
      .filter((node) => node.kind === 'lesson' && node.parentId === period.id)
      .sort(sortNodes)
      .map((lesson, index) => ({
        id: lesson.id,
        label: `${period.title} · 第 ${index + 1} 课 ${lesson.title}`,
      })))
    const students = overview.courseStudentLinks
      .filter((link) => link.courseId === course.id && link.endedAt === null)
      .flatMap((link) => studentById.get(link.studentId) ?? [])
    return {
      course,
      label: students.length === 0 ? course.title : `${course.title}（${students.join('、')}）`,
      lessons,
    }
  }).filter((target) => target.lessons.length > 0)
    .sort((left, right) => sortNodes(left.course, right.course))
}

function isSolutionAsset(role: string): boolean {
  return /solution|answer|analysis|解析|答案/iu.test(role)
}

function hasInlineOptionMarkers(
  content: string,
  options: QuestionBankDetail['options'],
): boolean {
  return options.slice(0, 2).every((option) => {
    const key = option.key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    return new RegExp(`(?:^|\\s)${key}[.．、)]\\s*`, 'iu').test(content)
  })
}

function sortNodes(left: NodeRecord, right: NodeRecord): number {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
}

function toSearchRequest(filters: FilterState, offset: number): QuestionBankSearchRequest {
  return {
    ...(filters.text.trim() === '' ? {} : { text: filters.text.trim() }),
    ...(filters.grade === '' ? {} : { grade: filters.grade }),
    ...(filters.year === '' ? {} : { year: Number(filters.year) }),
    ...(filters.month === '' ? {} : { month: Number(filters.month) }),
    ...(filters.type === '' ? {} : { type: filters.type }),
    ...(filters.tag === '' ? {} : { tag: filters.tag }),
    ...(filters.difficultyMin === '' ? {} : { difficultyMin: clampDifficulty(filters.difficultyMin) }),
    ...(filters.difficultyMax === '' ? {} : { difficultyMax: clampDifficulty(filters.difficultyMax) }),
    limit: 50,
    offset,
  }
}

function clampDifficulty(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : 0
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN').format(date)
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : fallback
}
