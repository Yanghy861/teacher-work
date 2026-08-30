import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from 'react'

import Modal from './modal'

export interface AppConfirmOptions {
  readonly title: string
  readonly description?: ReactNode
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly destructive?: boolean
}

export interface AppTextRequestOptions {
  readonly title: string
  readonly description?: ReactNode
  readonly label: string
  readonly initialValue?: string
  readonly placeholder?: string
  readonly submitLabel?: string
}

interface AppDialogContextValue {
  readonly confirm: (options: AppConfirmOptions) => Promise<boolean>
  readonly requestText: (options: AppTextRequestOptions) => Promise<string | null>
}

interface ConfirmRequest {
  readonly kind: 'confirm'
  readonly options: AppConfirmOptions
  readonly resolve: (value: boolean) => void
}

interface TextRequest {
  readonly kind: 'text'
  readonly options: AppTextRequestOptions
  readonly resolve: (value: string | null) => void
}

type AppDialogRequest = ConfirmRequest | TextRequest

const unavailableContext: AppDialogContextValue = {
  confirm: async () => false,
  requestText: async () => null,
}

const AppDialogContext = createContext<AppDialogContextValue>(unavailableContext)

export function useAppDialog(): AppDialogContextValue {
  return useContext(AppDialogContext)
}

export function AppDialogProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [activeRequest, setActiveRequest] = useState<AppDialogRequest | null>(null)
  const activeRequestRef = useRef<AppDialogRequest | null>(null)
  const queuedRequests = useRef<AppDialogRequest[]>([])
  const [textValue, setTextValue] = useState('')

  function show(request: AppDialogRequest): void {
    if (activeRequestRef.current === null) {
      activeRequestRef.current = request
      setActiveRequest(request)
    }
    else queuedRequests.current.push(request)
  }

  function finish(value: boolean | string | null): void {
    const current = activeRequestRef.current
    if (current === null) return
    if (current.kind === 'confirm') current.resolve(value === true)
    else current.resolve(typeof value === 'string' ? value : null)
    const nextRequest = queuedRequests.current.shift() ?? null
    activeRequestRef.current = nextRequest
    setActiveRequest(nextRequest)
  }

  useEffect(() => {
    setTextValue(activeRequest?.kind === 'text' ? activeRequest.options.initialValue ?? '' : '')
  }, [activeRequest])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') finish(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeRequest])

  const value = useMemo<AppDialogContextValue>(() => ({
    confirm: (options) => new Promise<boolean>((resolve) => show({ kind: 'confirm', options, resolve })),
    requestText: (options) => new Promise<string | null>((resolve) => show({ kind: 'text', options, resolve })),
  }), [activeRequest])

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      {activeRequest?.kind === 'confirm' && (
        <Modal title={activeRequest.options.title} description={activeRequest.options.description} onClose={() => finish(false)}>
          <footer className="modal-actions">
            <button className="secondary-button" type="button" onClick={() => finish(false)}>
              {activeRequest.options.cancelLabel ?? '取消'}
            </button>
            <button className={activeRequest.options.destructive ? 'danger-button' : 'primary-button'} type="button" autoFocus onClick={() => finish(true)}>
              {activeRequest.options.confirmLabel ?? '确定'}
            </button>
          </footer>
        </Modal>
      )}
      {activeRequest?.kind === 'text' && (
        <Modal title={activeRequest.options.title} description={activeRequest.options.description} onClose={() => finish(null)}>
          <form className="modal-form" onSubmit={(event) => {
            event.preventDefault()
            const nextValue = textValue.trim()
            if (nextValue !== '') finish(nextValue)
          }}>
            <label className="modal-field">
              {activeRequest.options.label}
              <input autoFocus value={textValue} placeholder={activeRequest.options.placeholder} onChange={(event) => setTextValue(event.target.value)} />
            </label>
            <footer className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => finish(null)}>取消</button>
              <button className="primary-button" type="submit" disabled={textValue.trim() === ''}>
                {activeRequest.options.submitLabel ?? '确定'}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </AppDialogContext.Provider>
  )
}
