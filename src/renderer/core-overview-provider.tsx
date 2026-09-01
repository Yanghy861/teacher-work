import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'

import type { CoreOverview } from '../shared/core-contracts'
import { createOverviewReloadCoalescer } from './overview-reload-coalescer'
import { toErrorMessage } from './ui-utils'

export interface CoreOverviewContextValue {
  /** 当前共享快照；尚未拉取成功时为 null。 */
  readonly overview: CoreOverview | null
  /** 共享重拉进行中（含首次拉取）。 */
  readonly loading: boolean
  /** 最近一次共享重拉的失败文案；成功时清空。 */
  readonly error: string
  /** 共享重拉：与旧页面 reload 相同的不抛错语义（失败返回 null 并记录 error）。 */
  readonly reload: () => Promise<CoreOverview | null>
  /** 失效口：变更动作完成后触发单次共享重拉；与 reload 共用同一合并逻辑。 */
  readonly invalidate: () => void
  /** 清空共享加载错误；页面挂载时复原旧页面"进入即空"的错误语义。 */
  readonly clearError: () => void
}

const unavailableContext: CoreOverviewContextValue = {
  overview: null,
  loading: false,
  error: '',
  reload: async () => null,
  invalidate: () => undefined,
  clearError: () => undefined,
}

const CoreOverviewContext = createContext<CoreOverviewContextValue>(unavailableContext)

export function useCoreOverview(): CoreOverviewContextValue {
  return useContext(CoreOverviewContext)
}

export function CoreOverviewProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [overview, setOverview] = useState<CoreOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const overviewRef = useRef<CoreOverview | null>(null)
  const lastAttemptFailedRef = useRef(false)

  const coalescer = useMemo(() => createOverviewReloadCoalescer(
    async () => {
      const next = await window.teacherWorkbench.core.getOverview()
      overviewRef.current = next
      lastAttemptFailedRef.current = false
      setOverview(next)
      setError('')
    },
    (loadError) => {
      lastAttemptFailedRef.current = true
      setError(toErrorMessage(loadError, '操作失败，请稍后重试。'))
    },
  ), [])

  const reload = useCallback(async (): Promise<CoreOverview | null> => {
    setLoading(true)
    await coalescer.request()
    setLoading(false)
    return lastAttemptFailedRef.current ? null : overviewRef.current
  }, [coalescer])

  const invalidate = useCallback((): void => {
    void reload()
  }, [reload])

  const clearError = useCallback((): void => {
    setError('')
  }, [])

  // 首次挂载触发一次共享拉取；files.onContentChanged 接同一失效口。
  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => window.teacherWorkbench.files.onContentChanged(() => {
    invalidate()
  }), [invalidate])

  const value = useMemo<CoreOverviewContextValue>(() => ({
    overview,
    loading,
    error,
    reload,
    invalidate,
    clearError,
  }), [overview, loading, error, reload, invalidate, clearError])

  return <CoreOverviewContext.Provider value={value}>{children}</CoreOverviewContext.Provider>
}
