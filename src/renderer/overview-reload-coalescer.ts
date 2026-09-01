/**
 * CoreOverview 共享缓存的请求合并器（V156-C）。
 *
 * 页面时代的语义：每个页面对自己的 getOverview 负责，变更动作完成后整页 reload；
 * 收敛后：Provider 持有单一共享器，页面经 useCoreOverview() 消费同一快照。
 * 合并规则保持旧页面"变更动作完成后立即重拉一次、拿到调用之后的新数据"的语义：
 * - 无 in-flight 请求时，reload()/invalidate() 直接发起一次共享拉取；
 * - 已有 in-flight 请求时，后续调用不再复用旧请求（旧请求的数据早于本次变更），
 *   而是合并为"当前请求结束后立刻再拉一次"，且多次跟单只保留一次（防抖合并）。
 */
export type LoadOverview = () => Promise<unknown>

export interface OverviewReloadCoalescer {
  /** 触发（或排队）一次共享拉取；与并发调用共享同一 in-flight 或跟单 Promise。 */
  readonly request: () => Promise<void>
  /** 当前是否存在未完成的拉取（含跟单）。 */
  readonly isBusy: () => boolean
}

export function createOverviewReloadCoalescer(
  load: LoadOverview,
  onLoadError: (error: unknown) => void,
): OverviewReloadCoalescer {
  let inflight: Promise<void> | null = null
  let followUp: Promise<void> | null = null

  async function runOnce(): Promise<void> {
    try {
      await load()
    } catch (error) {
      onLoadError(error)
    }
  }

  function request(): Promise<void> {
    if (inflight === null) {
      inflight = runOnce().finally(() => {
        inflight = null
      })
      return inflight
    }
    if (followUp === null) {
      followUp = inflight
        .then(() => {
          followUp = null
          return request()
        })
        .catch(() => undefined)
    }
    return followUp
  }

  function isBusy(): boolean {
    return inflight !== null || followUp !== null
  }

  return { request, isBusy }
}
