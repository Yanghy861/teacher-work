import type { IpcLogger } from '../ipc/app-ipc'

export function installMainErrorHandlers(logger: IpcLogger): () => void {
  const onUncaughtException = (error: Error): void => {
    logger.error('main.uncaught_exception', error)
  }
  const onUnhandledRejection = (reason: unknown): void => {
    logger.error('main.unhandled_rejection', new Error('Unhandled promise rejection'), { reason })
  }

  process.on('uncaughtException', onUncaughtException)
  process.on('unhandledRejection', onUnhandledRejection)

  return () => {
    process.off('uncaughtException', onUncaughtException)
    process.off('unhandledRejection', onUnhandledRejection)
  }
}
