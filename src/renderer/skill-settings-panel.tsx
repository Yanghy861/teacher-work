import { useEffect, useState } from 'react'

import {
  SKILL_NAME_MAX_CHARS,
  SKILL_PROMPT_MAX_CHARS,
  type SkillRecord,
} from '../shared/skill-contracts'

export default function SkillSettingsPanel(): React.JSX.Element {
  const [skills, setSkills] = useState<readonly SkillRecord[]>([])
  const [editingId, setEditingId] = useState('')
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void reload()
  }, [])

  async function reload(): Promise<void> {
    try {
      setSkills(await window.teacherWorkbench.skills.list())
      setError('')
    } catch (loadError) {
      setError(toErrorMessage(loadError))
    }
  }

  function edit(skill: SkillRecord): void {
    setEditingId(skill.id)
    setName(skill.name)
    setPrompt(skill.prompt)
    setMessage('')
    setError('')
  }

  function resetForm(): void {
    setEditingId('')
    setName('')
    setPrompt('')
  }

  async function save(): Promise<void> {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      if (editingId === '') {
        await window.teacherWorkbench.skills.create({ name, prompt })
        setMessage('Skill 已创建。')
      } else {
        await window.teacherWorkbench.skills.update({ skillId: editingId, name, prompt })
        setMessage('Skill 已保存。')
      }
      resetForm()
      await reload()
    } catch (saveError) {
      setError(toErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  async function remove(skill: SkillRecord): Promise<void> {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await window.teacherWorkbench.skills.softDelete({ skillId: skill.id })
      if (editingId === skill.id) resetForm()
      setMessage(`已删除「${skill.name}」。`)
      await reload()
    } catch (deleteError) {
      setError(toErrorMessage(deleteError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="workspace-card skill-settings-card">
      <div className="card-heading">
        <div>
          <p className="section-kicker">可复用 Prompt</p>
          <h2>我的 Skill</h2>
        </div>
        <span className="count-label">{skills.length} 个</span>
      </div>
      <p className="settings-note">
        Skill 只是可重复使用的备课偏好，不包含节点、参数或工作流。预置模板也可以直接编辑或删除。
      </p>
      <div className="skill-settings-layout">
        <ul className="skill-settings-list">
          {skills.map((skill) => (
            <li key={skill.id} className={editingId === skill.id ? 'is-selected' : ''}>
              <button type="button" className="skill-select-button" onClick={() => edit(skill)} disabled={busy}>
                <strong>{skill.name}</strong>
                <small>修改于 {formatDate(skill.updatedAt)}</small>
              </button>
              <button className="danger-button" type="button" onClick={() => void remove(skill)} disabled={busy}>
                删除
              </button>
            </li>
          ))}
          {skills.length === 0 && <li className="empty-state">还没有 Skill，可以在右侧新建。</li>}
        </ul>
        <div className="stacked-form skill-editor-form">
          <label>
            Skill 名称
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={SKILL_NAME_MAX_CHARS}
              placeholder="例如：考前复习"
              disabled={busy}
            />
          </label>
          <label>
            Prompt 内容
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              maxLength={SKILL_PROMPT_MAX_CHARS}
              rows={9}
              placeholder="写下长期使用的备课习惯和输出偏好"
              disabled={busy}
            />
          </label>
          <small className="field-counter">{prompt.length} / {SKILL_PROMPT_MAX_CHARS}</small>
          <div className="file-toolbar">
            <button
              className="primary-button"
              type="button"
              onClick={() => void save()}
              disabled={busy || name.trim() === '' || prompt.trim() === ''}
            >
              {editingId === '' ? '新建 Skill' : '保存 Skill'}
            </button>
            {editingId !== '' && (
              <button className="secondary-button" type="button" onClick={resetForm} disabled={busy}>
                取消编辑
              </button>
            )}
          </div>
        </div>
      </div>
      {message !== '' && <p className="inline-notice" role="status">{message}</p>}
      {error !== '' && <p className="inline-error" role="alert">{error}</p>}
    </div>
  )
}

function formatDate(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('zh-CN')
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ''
    ? error.message
    : 'Skill 操作失败，请稍后重试。'
}
