import type { TeacherWorkbenchApi } from '../shared/preload-api'

declare global {
  interface Window {
    teacherWorkbench: TeacherWorkbenchApi
  }
}

export {}
