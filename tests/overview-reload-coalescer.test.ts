import { describe, expect, it } from 'vitest'

import { createOverviewReloadCoalescer } from '../src/renderer/overview-reload-coalescer'

function deferredLoad(): {
  load: () => Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
} {
  let resolveFn: () => void = () => undefined
  let rejectFn: (error: unknown) => void = () => undefined
  const load = () => new Promise<void>((resolve, reject) => {
    resolveFn = resolve
    rejectFn = reject
  })
  return { load, resolve: () => resolveFn(), reject: (error) => rejectFn(error) }
}

function immediateLoad(counter: { count: number }): () => Promise<void> {
  return async () => {
    counter.count += 1
  }
}

describe('overview reload coalescer', () => {
  it('pulls once for a single request', async () => {
    const counter = { count: 0 }
    const errors: unknown[] = []
    const coalescer = createOverviewReloadCoalescer(immediateLoad(counter), (error) => errors.push(error))
    await coalescer.request()
    expect(counter.count).toBe(1)
    expect(errors).toEqual([])
    expect(coalescer.isBusy()).toBe(false)
  })

  it('coalesces concurrent requests into one pull while in flight', async () => {
    const counter = { count: 0 }
    const gate = deferredLoad()
    let released = false
    const errors: unknown[] = []
    const coalescer = createOverviewReloadCoalescer(
      async () => {
        counter.count += 1
        if (!released) {
          released = true
          await gate.load()
        }
      },
      (error) => errors.push(error),
    )

    const first = coalescer.request()
    const second = coalescer.request()
    expect(coalescer.isBusy()).toBe(true)
    gate.resolve()
    await Promise.all([first, second])
    expect(counter.count).toBe(2)
    expect(errors).toEqual([])
    expect(coalescer.isBusy()).toBe(false)
  })

  it('runs exactly one follow-up after in-flight finishes, no matter how many callers wait', async () => {
    const counter = { count: 0 }
    const gate = deferredLoad()
    const errors: unknown[] = []
    const coalescer = createOverviewReloadCoalescer(
      async () => {
        counter.count += 1
        if (counter.count === 1) await gate.load()
      },
      (error) => errors.push(error),
    )

    const first = coalescer.request()
    const second = coalescer.request()
    const third = coalescer.request()
    gate.resolve()
    await Promise.all([first, second, third])
    // 首次拉取 + 一次跟单 = 2；三个并发调用不放大拉取次数
    expect(counter.count).toBe(2)
    expect(errors).toEqual([])
  })

  it('reports load failures through the error callback and keeps working afterwards', async () => {
    const counter = { count: 0 }
    const errors: unknown[] = []
    let shouldFail = true
    const coalescer = createOverviewReloadCoalescer(
      async () => {
        counter.count += 1
        if (shouldFail) {
          shouldFail = false
          throw new Error('读取失败')
        }
      },
      (error) => errors.push(error),
    )

    await coalescer.request()
    expect(errors).toHaveLength(1)
    expect((errors[0] as Error).message).toBe('读取失败')

    await coalescer.request()
    expect(counter.count).toBe(2)
    expect(errors).toHaveLength(1)
  })

  it('never lets a rejected follow-up chain break later requests', async () => {
    const counter = { count: 0 }
    const gate = deferredLoad()
    const errors: unknown[] = []
    let firstPull = true
    const coalescer = createOverviewReloadCoalescer(
      async () => {
        counter.count += 1
        if (firstPull) {
          firstPull = false
          await gate.load()
          throw new Error('首次失败')
        }
      },
      (error) => errors.push(error),
    )

    const queued = coalescer.request() // 触发首次
    const followUp = coalescer.request() // in-flight 期间跟单
    gate.resolve()
    await Promise.all([queued, followUp])
    expect(counter.count).toBe(2)
    expect(errors).toHaveLength(1)

    await coalescer.request()
    expect(counter.count).toBe(3)
  })
})
