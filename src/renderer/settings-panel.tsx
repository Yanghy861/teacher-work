import { useEffect, useState } from 'react'

import type { AiKeyStorageMode, AiSettings, ExternalRootSummary, MineruSettings } from '../shared/preload-api'
import SkillSettingsPanel from './skill-settings-panel'
import { toErrorMessage } from './ui-utils'

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
  const [externalRoot, setExternalRoot] = useState<ExternalRootSummary | null>(null)
  const [externalBusy, setExternalBusy] = useState(false)
  const [mineruSettings, setMineruSettings] = useState<MineruSettings>({ tokenConfigured: false, tokenStorage: 'unavailable' })
  const [mineruToken, setMineruToken] = useState('')
  const [mineruBusy, setMineruBusy] = useState(false)

  useEffect(() => {
    void window.teacherWorkbench.ai.getSettings().then((value) => {
      setSettings(value)
      setModel(value.model)
      setEndpoint(value.endpoint)
    }).catch((loadError: unknown) => setError(toErrorMessage(loadError, '操作失败，请稍后重试。')))
  }, [])

  useEffect(() => {
    void window.teacherWorkbench.externalLibrary.getRoot()
      .then(setExternalRoot)
      .catch((loadError: unknown) => setError(toErrorMessage(loadError, '操作失败，请稍后重试。')))
  }, [])

  useEffect(() => {
    void window.teacherWorkbench.mineru.getSettings()
      .then(setMineruSettings)
      .catch((loadError: unknown) => setError(toErrorMessage(loadError, '操作失败，请稍后重试。')))
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
      setError(toErrorMessage(saveError, '操作失败，请稍后重试。'))
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
      setError(toErrorMessage(clearError, '操作失败，请稍后重试。'))
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
      setError(toErrorMessage(testError, '操作失败，请稍后重试。'))
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
      setError(toErrorMessage(backupError, '操作失败，请稍后重试。'))
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
      setError(toErrorMessage(restoreError, '操作失败，请稍后重试。'))
      setMessage('')
    } finally {
      setBackupBusy(false)
    }
  }

  async function saveMineruToken(): Promise<void> {
    setMineruBusy(true)
    setMessage('')
    setError('')
    try {
      const next = await window.teacherWorkbench.mineru.updateSettings({
        ...(mineruToken.trim() === '' ? {} : { token: mineruToken.trim() }),
      })
      setMineruSettings(next)
      setMineruToken('')
      setMessage('MinerU token 已保存。')
    } catch (saveError) {
      setError(toErrorMessage(saveError, '操作失败，请稍后重试。'))
    } finally {
      setMineruBusy(false)
    }
  }

  async function clearMineruToken(): Promise<void> {
    setMineruBusy(true)
    setMessage('')
    setError('')
    try {
      setMineruSettings(await window.teacherWorkbench.mineru.clearToken())
      setMessage('已删除已保存的 MinerU token。')
    } catch (clearError) {
      setError(toErrorMessage(clearError, '操作失败，请稍后重试。'))
    } finally {
      setMineruBusy(false)
    }
  }

  async function testMineruConnection(): Promise<void> {
    setMineruBusy(true)
    setMessage('正在测试 MinerU 连接…')
    setError('')
    try {
      const token = mineruToken.trim()
      if (token === '') {
        setError('请先保存 token，再使用已保存的 token 测试连接。')
        setMessage('')
        return
      }
      const result = await window.teacherWorkbench.mineru.testConnection({ token })
      setMessage(`MinerU 连接成功 · ${result.latencyMs} ms`)
    } catch (testError) {
      setError(toErrorMessage(testError, '操作失败，请稍后重试。'))
      setMessage('')
    } finally {
      setMineruBusy(false)
    }
  }

  async function chooseExternalRoot(): Promise<void> {
    setExternalBusy(true)
    setMessage('')
    setError('')
    try {
      const selectedRoot = await window.teacherWorkbench.externalLibrary.chooseRoot()
      if (selectedRoot === null) {
        setMessage('已取消选择。')
      } else {
        setExternalRoot(selectedRoot)
        setMessage(`外部资料目录已连接：${selectedRoot.name}`)
      }
    } catch (rootError) {
      setError(toErrorMessage(rootError, '操作失败，请稍后重试。'))
    } finally {
      setExternalBusy(false)
    }
  }

  return (
    <section className="settings-panel" aria-label="设置">
      <div className="workspace-card">
        <div className="card-heading">
          <div>
            <p className="section-kicker">只读本地资料</p>
            <h2>外部资料位置</h2>
          </div>
          <span className={`key-status key-status-${externalRoot?.available ? 'ready' : 'empty'}`}>
            {externalRoot === null
              ? '未设置'
              : externalRoot.available
                ? '已连接'
                : '目录不可用'}
          </span>
        </div>
        <p className="settings-note external-root-summary">
          {externalRoot === null
            ? '选择一个已有教学资料文件夹。工作台只按需浏览，不会修改原文件。'
            : `当前目录：${externalRoot.name}。绝对路径只保留在 Main，不会暴露给页面。`}
        </p>
        <button
          className="primary-button"
          type="button"
          onClick={() => void chooseExternalRoot()}
          disabled={externalBusy || backupBusy || busy}
        >
          {externalRoot === null ? '选择资料目录' : '更改资料目录'}
        </button>
      </div>
      <SkillSettingsPanel />
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
            <p className="section-kicker">文档增强解析</p>
            <h2>MinerU</h2>
          </div>
          <span className={`key-status key-status-${mineruSettings.tokenConfigured ? 'ready' : 'empty'}`}>
            {mineruSettings.tokenConfigured ? `Token 已配置 · ${mineruStorageLabel(mineruSettings.tokenStorage)}` : 'Token 未配置'}
          </span>
        </div>
        <p className="settings-note">用 MinerU 云端解析数学公式（转 LaTeX）、表格与扫描件，增强 AI 备课的资料理解。仅在您对文件主动执行“增强解析”时才会上传该文件副本；外部资料目录永不上传。</p>
        <div className="stacked-form">
          <label>
            新 MinerU Token
            <input
              type="password"
              value={mineruToken}
              onChange={(event) => setMineruToken(event.target.value)}
              placeholder={mineruSettings.tokenConfigured ? '留空表示保持当前 token' : '仅在保存时提交'}
              autoComplete="new-password"
              disabled={mineruBusy}
            />
          </label>
        </div>
        <div className="file-toolbar">
          <button className="primary-button" type="button" onClick={() => void saveMineruToken()} disabled={mineruBusy || mineruToken.trim() === ''}>保存 Token</button>
          <button className="secondary-button" type="button" onClick={() => void testMineruConnection()} disabled={mineruBusy || (mineruToken.trim() === '' && !mineruSettings.tokenConfigured)}>测试连接</button>
          <button className="danger-button" type="button" onClick={() => void clearMineruToken()} disabled={mineruBusy || !mineruSettings.tokenConfigured}>删除 Token</button>
        </div>
        <p className="settings-note">Token 加密存储于本机，不进入日志与备份，也不会回显。</p>
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

function mineruStorageLabel(mode: MineruSettings['tokenStorage']): string {
  return mode === 'secure' ? '安全存储' : mode === 'session' ? '本次会话' : mode === 'none' ? '未配置' : '不可用'
}

function storageLabel(mode: AiKeyStorageMode): string {
  return mode === 'secure' ? '安全存储' : mode === 'session' ? '本次会话' : mode === 'none' ? '未配置' : '不可用'
}
