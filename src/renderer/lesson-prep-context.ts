import type { CourseMode, NodeRecord, StudentRecord } from '../shared/core-contracts'
import type { ManagedFileOverview, ManagedFileRecord } from '../shared/file-contracts'

export interface LessonMaterialTreeNode {
  readonly file: ManagedFileRecord
  readonly children: readonly ManagedFileRecord[]
}

export interface LessonPrepContext {
  readonly courseId: string
  readonly courseTitle: string
  readonly courseMode: CourseMode
  readonly lessonId: string
  readonly lessonTitle: string
  readonly lessonLabel?: string
  readonly periodTitle?: string
  readonly studentId?: string
  readonly studentNames: readonly string[]
}

export interface LessonMaterialFilterOptions {
  readonly lessonLabel?: string
  readonly periodTitle?: string
}

export function createLessonPrepContext(
  course: NodeRecord,
  lesson: NodeRecord,
  students: readonly StudentRecord[],
  periodTitle?: string,
): LessonPrepContext {
  const courseMode = course.courseMode ?? 'class'
  const normalizedPeriodTitle = periodTitle?.trim()
  return {
    courseId: course.id,
    courseTitle: course.title,
    courseMode,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    ...(lesson.lessonLabel === undefined ? {} : { lessonLabel: lesson.lessonLabel }),
    ...(normalizedPeriodTitle === undefined || normalizedPeriodTitle === '' ? {} : { periodTitle: normalizedPeriodTitle }),
    ...(courseMode === 'one_to_one' && students[0] !== undefined
      ? { studentId: students[0].id }
      : {}),
    studentNames: students.map((student) => student.name),
  }
}

export function listLessonPrepFiles(
  overview: ManagedFileOverview,
  lessonId: string,
): ManagedFileRecord[] {
  const linkedIds = new Set(overview.links
    .filter((link) => link.targetType === 'lesson' && link.targetId === lessonId)
    .map((link) => link.fileId))
  return overview.files.filter((file) => file.deletedAt === null && linkedIds.has(file.id))
}

export function reconcileSelectedLessonFileIds(
  currentSelectedIds: readonly string[],
  previousKnownIds: ReadonlySet<string>,
  currentFiles: readonly ManagedFileRecord[],
): string[] {
  const currentIds = currentFiles.filter(isSelectableLessonPrepFile).map((file) => file.id)
  const currentSet = new Set(currentIds)
  const stillPresent = currentSelectedIds.filter((id) => currentSet.has(id))
  const newlyAdded = currentIds.filter((id) => !previousKnownIds.has(id))
  return [...new Set([...stillPresent, ...newlyAdded])]
}

export function isSelectableLessonPrepFile(file: ManagedFileRecord): boolean {
  return !file.mimeType.startsWith('image/')
}

export function filterLessonMaterialFiles(
  files: readonly ManagedFileRecord[],
  options: LessonMaterialFilterOptions = {},
): ManagedFileRecord[] {
  return files.filter((file) => !isStructuralLessonIndexFile(file, options))
}

function isStructuralLessonIndexFile(
  file: ManagedFileRecord,
  options: LessonMaterialFilterOptions,
): boolean {
  if (file.mimeType !== 'text/markdown') return false
  const baseName = file.originalName.replace(/\.(?:md|markdown)$/iu, '').trim()
  if (baseName === '' || /反馈/u.test(baseName)) return false

  const lessonLabel = options.lessonLabel?.trim()
  if (lessonLabel !== undefined && lessonLabel !== '' && baseName === lessonLabel) return true

  const periodTitle = options.periodTitle?.trim()
  if (periodTitle !== undefined && periodTitle !== '' && baseName === periodTitle) return true

  // 导出的思源目录索引会以“第X课/讲”或“年级/升学阶段+季节”命名。
  // 这些文件代表文件夹入口，不应在某一节课的正文资料中重复出现。
  if (/^第.+(?:课|讲)(?:\s|$)/u.test(baseName)) return true
  if (/(?:年级|升).*(?:春|秋|寒|暑)|(?:春|秋|寒|暑)假/u.test(baseName)) return true
  return baseName === '总课程大纲'
}

export function buildLessonMaterialTree(
  files: readonly ManagedFileRecord[],
  markdownBodies: ReadonlyMap<string, string>,
): LessonMaterialTreeNode[] {
  const childrenByParent = new Map<string, ManagedFileRecord[]>()
  const referencedChildIds = new Set<string>()
  const resourceFiles = files.filter((file) => file.mimeType !== 'text/markdown')

  for (const parent of files.filter((file) => file.mimeType === 'text/markdown')) {
    const body = markdownBodies.get(parent.id)
    if (body === undefined) continue
    for (const reference of extractResourceReferences(body)) {
      const matches = findReferencedFiles(resourceFiles, reference)
      if (matches.length === 0) continue
      const children = childrenByParent.get(parent.id) ?? []
      for (const child of matches) {
        if (children.some((existing) => existing.id === child.id)) continue
        children.push(child)
        referencedChildIds.add(child.id)
      }
      childrenByParent.set(parent.id, children)
    }
  }

  return files
    .filter((file) => !referencedChildIds.has(file.id))
    .map((file) => ({
      file,
      children: childrenByParent.get(file.id) ?? [],
    }))
}

function extractResourceReferences(body: string): string[] {
  const references: string[] = []
  const pattern = /(?:!\[[^\]]*\]|\[[^\]]+\])\((?:<([^>]+)>|([^)]*))\)/gu
  let match: RegExpExecArray | null
  while ((match = pattern.exec(body)) !== null) {
    const rawReference = (match[1] ?? match[2] ?? '').trim()
    if (rawReference === '' || /^(?:https?:|data:|#)/iu.test(rawReference)) continue
    references.push(rawReference.split(/\s+['"]/u)[0])
  }
  return references
}

function findReferencedFiles(
  files: readonly ManagedFileRecord[],
  reference: string,
): ManagedFileRecord[] {
  const normalized = normalizeReferenceName(reference)
  if (normalized === '') return []
  return files.filter((file) => file.originalName.toLocaleLowerCase('zh-CN') === normalized)
}

function normalizeReferenceName(reference: string): string {
  const withoutQuery = reference.trim().split(/[?#]/u)[0]
  const name = withoutQuery.split(/[\\/]/u).at(-1) ?? ''
  try {
    return decodeURIComponent(name).toLocaleLowerCase('zh-CN')
  } catch {
    return name.toLocaleLowerCase('zh-CN')
  }
}
