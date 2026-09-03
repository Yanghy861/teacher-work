import type { CourseMode, NodeRecord, StudentRecord } from '../shared/core-contracts'
import type { ManagedFileOverview, ManagedFileRecord } from '../shared/file-contracts'
import { normalizeMarkdownImageReferences } from './rich-text'

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

export interface LessonCoursewareFiles {
  readonly currentVersion: ManagedFileRecord | null
  readonly history: readonly ManagedFileRecord[]
  readonly currentMaterials: readonly ManagedFileRecord[]
}

const lessonVersionPattern = / · 第 (\d+) 版\.md$/u

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

/** D27（V17-B）：任意 text/markdown managed 文件均可作 AI 修改对象（含外部导入 md）；office/pdf/图片/纯文本不在其列。 */
export function isAiEditableFile(file: ManagedFileRecord): boolean {
  return file.mimeType === 'text/markdown'
}

/**
 * D23 历史判断保留（V17-B 起仅用于版本链命名与排序，不再作修改准入）：
 * 工作台发布的“标题 · 第 N 版.md”。
 */
export function isAppGeneratedCoursewareFile(file: ManagedFileRecord): boolean {
  return file.mimeType === 'text/markdown' && lessonVersionPattern.test(file.originalName)
}

/** 修改候选排序（V17-B）：版本链最新版在前，其余 md 依原序跟后。 */
export function orderAiEditableFiles(files: readonly ManagedFileRecord[]): ManagedFileRecord[] {
  const versioned = files
    .map((file) => {
      const match = lessonVersionPattern.exec(file.originalName)
      return match === null ? null : { file, version: Number(match[1]) }
    })
    .filter((item): item is { file: ManagedFileRecord; version: number } => item !== null)
    .sort((left, right) => right.version - left.version)
  const versionedIds = new Set(versioned.map((item) => item.file.id))
  return [...versioned.map((item) => item.file), ...files.filter((file) => !versionedIds.has(file.id))]
}

export function classifyLessonCoursewareFiles(
  files: readonly ManagedFileRecord[],
): LessonCoursewareFiles {
  const versioned = files
    .map((file) => {
      const match = lessonVersionPattern.exec(file.originalName)
      return match === null ? null : { file, version: Number(match[1]) }
    })
    .filter((item): item is { file: ManagedFileRecord; version: number } => item !== null)
    .sort((left, right) => right.version - left.version)
  const currentVersion = versioned[0]?.file ?? null
  const history = versioned.slice(1).map((item) => item.file)
  const historyIds = new Set(history.map((file) => file.id))
  const currentMaterials = currentVersion === null
    ? files.filter((file) => !historyIds.has(file.id))
    : [
        currentVersion,
        ...files.filter((file) => file.id !== currentVersion.id && !historyIds.has(file.id)),
      ]
  return { currentVersion, history, currentMaterials }
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
  // 只有裸编号（如“第12讲”“第3课”）才是目录索引；带主题后缀（如“第1讲 实数综合”）是真实内容。
  if (/^第.+?(?:课|讲)\s*$/u.test(baseName)) return true
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
  const normalizedBody = normalizeMarkdownImageReferences(body)
  let match: RegExpExecArray | null
  while ((match = pattern.exec(normalizedBody)) !== null) {
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
