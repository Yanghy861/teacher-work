import { useEffect, useMemo, useState } from 'react'

import type { ManagedFileOverview, ManagedFileRecord } from '../shared/file-contracts'
import type { LessonPrepContext } from './lesson-prep-context'

export default function MaterialPickerPanel({
  context,
  onAdded,
  onCancel,
}: {
  readonly context: LessonPrepContext
  readonly onAdded: (file: ManagedFileRecord) => void
  readonly onCancel: () => void
}): React.JSX.Element {
  const [overview, setOverview] = useState<ManagedFileOverview | null>(null)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void window.teacherWorkbench.files.getOverview()
      .then(setOverview)
      .catch((loadError: unknown) => setError(toErrorMessage(loadError)))
  }, [])

  const materialFiles = useMemo(() => {
    if (overview === null) return []
    const linkedIds = new Set(overview.links.map((link) => link.fileId))
    return overview.files.filter((file) => file.deletedAt === null && !linkedIds.has(file.id))
  }, [overview])

  async function addFile(file: ManagedFileRecord): Promise<void> {
    setBusyId(file.id)
    setError('')
    try {
      const copied = await window.teacherWorkbench.files.copyToLesson({
        fileId: file.id,
        lessonId: context.lessonId,
      })
      onAdded(copied)
    } catch (copyError) {
      setError(toErrorMessage(copyError))
    } finally {
      setBusyId('')
    }
  }

  return (
    <section className="material-picker-panel" aria-label="从素材库添加">
      {error !== '' && <div className="inline-error" role="alert">{error}</div>}
      <section className="workspace-card">
        <div className="card-heading">
          <div>
            <p className="section-kicker">本次备课</p>
            <h2>从素材库添加</h2>
          </div>
          <button className="secondary-button" type="button" onClick={onCancel} disabled={busyId !== ''}>
            返回备课
          </button>
        </div>
        <p className="file-context">{context.courseTitle} / {context.lessonTitle}</p>
        <ul className="file-list">
          {materialFiles.map((file) => (
            <li className="file-row" key={file.id}>
              <div className="file-summary">
                <strong>{file.originalName}</strong>
                <small>{formatBytes(file.sizeBytes)} · 素材库原件保持不变</small>
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={() => void addFile(file)}
                disabled={busyId !== ''}
              >
                {busyId === file.id ? '复制中…' : '用于本次备课'}
              </button>
            </li>
          ))}
          {overview === null && <li className="empty-state">正在读取素材库…</li>}
          {overview !== null && materialFiles.length === 0 && (
            <li className="empty-state">素材库中暂无可添加的原始资料。</li>
          )}
        </ul>
      </section>
    </section>
  )
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ''
    ? error.message
    : '素材复制失败，请稍后重试。'
}
