import type { LessonPrepContext } from './lesson-prep-context'

export type TeachingContentSection = 'courseware' | 'prep' | 'drafts'

export type PrepLaunchMode = 'new' | 'single' | 'lesson'

export interface PrepLaunchIntent {
  readonly mode: PrepLaunchMode
  readonly targetFileId?: string
}

export interface TeachingContentTarget {
  readonly courseId: string | null
  readonly lessonId: string | null
  readonly section: TeachingContentSection
  readonly originStudentId?: string
  readonly prepMode?: PrepLaunchMode
  readonly prepTargetFileId?: string
}

export function createTeachingContentTarget(
  context: LessonPrepContext,
  section: Exclude<TeachingContentSection, 'drafts'>,
  originStudentId?: string,
): TeachingContentTarget {
  return {
    courseId: context.courseId,
    lessonId: context.lessonId,
    section,
    ...(originStudentId === undefined || originStudentId === '' ? {} : { originStudentId }),
  }
}

export function createDraftInboxTarget(): TeachingContentTarget {
  return { courseId: null, lessonId: null, section: 'drafts' }
}

export function withTeachingContentSection(
  target: TeachingContentTarget,
  section: TeachingContentSection,
): TeachingContentTarget {
  return { ...target, section }
}
