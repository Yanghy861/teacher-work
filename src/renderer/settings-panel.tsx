import { useEffect, useState } from 'react'

import type { AiKeyStorageMode, AiSettings } from '../shared/preload-api'

const initialSettings: AiSettings = {
  provider: 'openai-compatible',
  model: 'gpt-4o-mini',
  endpoint: 'https://api.openai.com/v1',
  keyConfigured: false,
  keyStorage: 'unavailable',
}

export default function SettingsPanel(): React.JSX.Element {
  const [settings, setSettings] = useState(initialSettings)
  const [model, setModel] = useState(initialSettings.model)
  const [endpoint, setEndpoint] = useState(initialSettings.endpoint)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)

  useEffect(() => {
    void window.teacherWorkbench.ai.getSettings().then((value) => {
      setSettings(value)
      setModel(value.model)
      setEndpoint(value.endpoint)
    }).catch((loadError: unknown) => setError(toErrorMessage(loadError)))
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const next = await window.teacherWorkbench.ai.updateSettings({
        provider: 'openai-compatible',
        model,
        endpoint,
        ...(apiKey.trim() === '' ? {} : { apiKey }),
      })
      setSettings(next)
      setApiKey('')
      setMessage(next.keyStorage === 'session' ? '已保存设置；Key 仅在本次会话可用。' : '已保存设置。')
    } catch (saveError) {
      setError(toErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  async function clearKey(): Promise<void> {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const next = await window.teacherWorkbench.ai.updateSettings({
        provider: 'openai-compatible',
        model,
        endpoint,
        clearApiKey: true,
      })
      setSettings(next)
      setMessage('已删除已保存的 Key。')
    } catch (clearError) {
      setError(toErrorMessage(clearError))
    } finally {
      setBusy(false)
    }
  }

  async function testConnection(): Promise<void> {
    setBusy(true)
    setMessage('正在测试连接…')
    setError('')
    const requestId = globalThis.crypto.randomUUID()
    try {
      const result = await window.teacherWorkbench.ai.testConnection({ requestId })
      setMessage(`连接成功 · ${result.model} · ${result.latencyMs} ms`)
    } catch (testError) {
      setError(toErrorMessage(testError))
      setMessage('')
    } finally {
      setBusy(false)
    }
  }

  async function createBackup(): Promise<void> {
    setBackupBusy(true)
    setMessage('正在创建备份…')
    setError('')
    try {
      const result = await window.teacherWorkbench.backup.create()
      if (result !== null) setMessage(`备份完成 · ${result.fileCount} 个文件`)
      else setMessage('已取消备份。')
    } catch (backupError) {
      setError(toErrorMessage(backupError))
      setMessage('')
    } finally {
      setBackupBusy(false)
    }
  }

  async function restoreBackup(): Promise<void> {
    setBackupBusy(true)
    setMessage('正在恢复到新工作区…')
    setError('')
    try {
      const result = await window.teacherWorkbench.backup.restore()
      if (result !== null) setMessage(`恢复完成 · ${result.indexedFiles} 个文件已重新索引；请重新配置 Key。`)
      else setMessage('已取消恢复。')
    } catch (restoreError) {
      setError(toErrorMessage(restoreError))
      setMessage('')
    } finally {
      setBackupBusy(false)
    }
  }

  return (
    <section className="settings-panel" aria-label="AI 设置">
      <div className="workspace-card">
        <div className="card-heading">
          <div>
            <p className="section-kicker">安全配置</p>
            <h2>AI Gateway</h2>
          </div>
          <span className={`key-status key-status-${settings.keyConfigured ? 'ready' : 'empty'}`}>
            {settings.keyConfigured ? `Key 已配置 · ${storageLabel(settings.keyStorage)}` : 'Key 未配置'}
          </span>
        </div>
        <div className="stacked-form">
          <label>
            Provider
            <select value="openai-compatible" disabled>
              <option value="openai-compatible">OpenAI-compatible</option>
            </select>
          </label>
          <label>
            Model
            <input value={model} onChange={(event) => setModel(event.target.value)} disabled={busy} />
          </label>
          <label>
            Endpoint
            <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} disabled={busy} />
          </label>
          <label>
            新 API Key
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={settings.keyConfigured ? '留空表示保持当前 Key' : '仅在保存时提交'}
              autoComplete="new-password"
              disabled={busy}
            />
          </label>
        </div>
        <div className="file-toolbar">
          <button className="primary-button" type="button" onClick={() => void save()} disabled={busy || model.trim() === '' || endpoint.trim() === ''}>保存设置</button>
          <button className="secondary-button" type="button" onClick={() => void testConnection()} disabled={busy || !settings.keyConfigured}>测试连接</button>
          <button className="danger-button" type="button" onClick={() => void clearKey()} disabled={busy || !settings.keyConfigured}>删除 Key</button>
        </div>
        {message && <p className="inline-notice" role="status">{message}</p>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        <p className="settings-note">Key 不会回显，也不会写入普通设置、日志或备份；安全存储不可用时只保留在本次会话。</p>
      </div>
      <div className="workspace-card">
        <div className="card-heading">
          <div>
            <p className="section-kicker">工作区</p>
            <h2>备份与恢复</h2>
          </div>
        </div>
        <div className="file-toolbar">
          <button className="primary-button" type="button" onClick={() => void createBackup()} disabled={backupBusy || busy}>创建备份</button>
          <button className="secondary-button" type="button" onClick={() => void restoreBackup()} disabled={backupBusy || busy}>恢复到新工作区</button>
        </div>
      </div>
    </section>
  )
}

function storageLabel(mode: AiKeyStorageMode): string {
  return mode === 'secure' ? '安全存储' : mode === 'session' ? '本次会话' : mode === 'none' ? '未配置' : '不可用'
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : '操作失败，请稍后重试。'
}
