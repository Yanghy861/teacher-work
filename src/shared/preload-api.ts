export const IPC_CHANNELS = {
  getAppVersion: 'app:get-version',
} as const

export interface TeacherWorkbenchApi {
  app: {
    getVersion: () => Promise<string>
  }
}
