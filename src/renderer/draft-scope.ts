import type { NoteRecord } from '../shared/core-contracts'
import {
  DRAFT_MODIFICATION_PLAN_MAX_CHARS,
  DRAFT_MODIFICATION_SCOPE_VERSION,
  DRAFT_REQUIREMENT_MAX_CHARS,
  type DraftKind,
  type DraftModificationScope,
} from '../shared/draft-contracts'
import type { ManagedFileRecord } from '../shared/file-contracts'
import type { PrepLaunchMode } from './teaching-content-context'

export type ModificationMode = Exclude<PrepLaunchMode, 'new'>

export interface ParsedModificationScope {
  readonly mode: ModificationMode
  readonly baselineCount: number
  readonly targetName?: string
  readonly teacherRequirement: string
}

export const kindLabels: Record<DraftKind, string> = {
  lecture: '讲义',
  example: '例题',
  homework: '作业',
}

export const SINGLE_MODE_MARKER = '【AI修改方式：单文件】'
export const LESSON_MODE_MARKER = '【AI修改方式：整课重做】'
export const TEACHER_REQUIREMENT_MARKER = '【老师修改要求】'
export const CONFIRMED_PLAN_MARKER = '【老师已确认的修改方案（请严格按方案修改）】'
export const GENERATION_CONSTRAINT_MARKER = '【生成约束】'

export function buildModeRequirement(
  mode: ModificationMode,
  targetFile: ManagedFileRecord,
  baselineCount: number,
  teacherRequirement: string,
  confirmedPlan: string,
): string {
  const modeLines = mode === 'single'
    ? [SINGLE_MODE_MARKER, `【修改对象：${targetFile.originalName}】`]
    : [LESSON_MODE_MARKER, `【自动基线数量：${baselineCount}】`]
  const generationConstraint = mode === 'single'
    ? `只修改《${targetFile.originalName}》，补充参考不得成为额外修改对象。输出修改后的完整文件 Markdown，不要只输出差异或说明；未被要求修改的内容保持不变。`
    : '输出一份可直接发布的完整课件 Markdown，不要拆成多个文件。必须包含讲义、例题、课堂练习、课后作业四个清晰板块，并按确认方案统一重组整节课。'
  const prefix = [
    ...modeLines,
    GENERATION_CONSTRAINT_MARKER,
    generationConstraint,
    TEACHER_REQUIREMENT_MARKER,
  ].join(String.fromCharCode(10)) + String.fromCharCode(10)
  const separator = `${String.fromCharCode(10)}${CONFIRMED_PLAN_MARKER}${String.fromCharCode(10)}`
  const available = Math.max(0, DRAFT_REQUIREMENT_MAX_CHARS - prefix.length - separator.length)
  const planReserve = Math.min(confirmedPlan.length, DRAFT_MODIFICATION_PLAN_MAX_CHARS)
  const requirementBudget = Math.max(0, available - planReserve)
  const boundedRequirement = teacherRequirement.slice(0, requirementBudget)
  const boundedPlan = confirmedPlan.slice(0, Math.max(0, available - boundedRequirement.length))
  return `${prefix}${boundedRequirement}${separator}${boundedPlan}`
}

export function buildModificationScope(
  mode: ModificationMode,
  targetFile: ManagedFileRecord | null,
  baselineCount: number,
  teacherRequirement: string,
  confirmedPlan: string,
): DraftModificationScope {
  const boundedPlan = confirmedPlan.trim().slice(0, DRAFT_MODIFICATION_PLAN_MAX_CHARS)
  return {
    scopeVersion: DRAFT_MODIFICATION_SCOPE_VERSION,
    mode,
    baselineCount: Math.max(1, baselineCount),
    ...(mode === 'single' && targetFile !== null
      ? { targetFileId: targetFile.id, targetName: targetFile.originalName }
      : {}),
    teacherRequirement: teacherRequirement.trim().slice(0, DRAFT_REQUIREMENT_MAX_CHARS),
    ...(boundedPlan === '' ? {} : { confirmedPlan: boundedPlan }),
  }
}

export function parseModificationScope(note: NoteRecord): ParsedModificationScope | null {
  const metadata = note.aiMetadata
  if (metadata?.modification !== undefined) {
    const scope = metadata.modification
    return {
      mode: scope.mode,
      baselineCount: scope.mode === 'single' ? 1 : Math.max(1, scope.baselineCount),
      ...(scope.targetName === undefined ? {} : { targetName: scope.targetName }),
      teacherRequirement: scope.teacherRequirement,
    }
  }
  const storedRequirement = metadata?.requirement
  if (storedRequirement === undefined) return null
  const mode: ModificationMode | null = storedRequirement.includes(SINGLE_MODE_MARKER)
    ? 'single'
    : storedRequirement.includes(LESSON_MODE_MARKER)
      ? 'lesson'
      : null
  if (mode === null) return null
  const targetName = storedRequirement.match(/【修改对象：([^\r\n】]+)】/u)?.[1]
  const parsedBaselineCount = Number(storedRequirement.match(/【自动基线数量：(\d+)】/u)?.[1] ?? '1')
  const teacherRequirement = extractMarkedSection(
    storedRequirement,
    TEACHER_REQUIREMENT_MARKER,
    CONFIRMED_PLAN_MARKER,
  )
  return {
    mode,
    baselineCount: mode === 'single' ? 1 : Math.max(1, parsedBaselineCount),
    ...(targetName === undefined ? {} : { targetName }),
    teacherRequirement,
  }
}

export function extractMarkedSection(value: string, startMarker: string, endMarker: string): string {
  const start = value.indexOf(startMarker)
  if (start < 0) return ''
  const contentStart = start + startMarker.length
  const end = value.indexOf(endMarker, contentStart)
  return value.slice(contentStart, end < 0 ? undefined : end).trim()
}

export function modificationNodeLabel(note: NoteRecord): string {
  const scope = parseModificationScope(note)
  if (scope?.mode === 'single') return '单文件修订'
  if (scope?.mode === 'lesson') return '整课重做'
  const kind = note.noteKind as DraftKind
  return `${kindLabels[kind]}${note.draftStatus === 'draft' ? '修改节点' : '已确认成果'}`
}

export function buildPublishConfirmation(note: NoteRecord): string {
  const scope = parseModificationScope(note)
  if (scope?.mode === 'single') {
    return `将把对《${scope.targetName ?? '目标文件'}》的单文件修订发布为本课课件新版本，旧版本保留。继续？`
  }
  if (scope?.mode === 'lesson') {
    return '将把整课重做内容发布为本课课件新版本，旧版本保留。继续？'
  }
  return '将把当前内容发布为本课课件新版本，旧版本保留。继续？'
}
