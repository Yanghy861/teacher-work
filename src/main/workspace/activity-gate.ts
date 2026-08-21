export class WorkspaceActivityError extends Error {
  readonly code = 'WORKSPACE_PAUSED' as const

  constructor() {
    super('工作区正在备份或恢复，请稍后重试。')
    this.name = 'WorkspaceActivityError'
  }
}

/**
 * Coordinates short Main-side operations with the idle-only backup flow.
 * Existing operations finish before pause resolves; new operations are rejected.
 */
export class WorkspaceActivityGate {
  private active = 0
  private paused = false
  private idleWaiters: Array<() => void> = []

  get isPaused(): boolean {
    return this.paused
  }

  async run<T>(task: () => T | Promise<T>): Promise<T> {
    if (this.paused) {
      throw new WorkspaceActivityError()
    }
    this.active += 1
    try {
      return await task()
    } finally {
      this.active -= 1
      if (this.active === 0) {
        const waiters = this.idleWaiters.splice(0)
        waiters.forEach((resolve) => resolve())
      }
    }
  }

  async pause<T>(task: () => T | Promise<T>): Promise<T> {
    if (this.paused) {
      throw new WorkspaceActivityError()
    }
    this.paused = true
    await this.waitForIdle()
    try {
      return await task()
    } finally {
      this.paused = false
    }
  }

  private waitForIdle(): Promise<void> {
    if (this.active === 0) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.idleWaiters.push(resolve)
    })
  }
}
