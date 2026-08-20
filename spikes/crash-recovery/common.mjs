import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const crashRoot = resolve(repoRoot, 'tmp', 't07-crash-recovery')
export const crashResultsRoot = resolve(repoRoot, 'spikes', 'crash-recovery', 'results')
export const crashWorkerPath = resolve(dirname(fileURLToPath(import.meta.url)), 'worker.mjs')

export function assertCrashRoot(rootPath) {
  const resolved = resolve(rootPath)
  if (resolved !== crashRoot) {
    throw new Error('crash_root_must_be_workspace_tmp_t07_crash_recovery')
  }
  return resolved
}

export function assertWithin(rootPath, targetPath, label = 'target') {
  const root = resolve(rootPath)
  const target = resolve(targetPath)
  const relativePath = relative(root, target)
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`${label}_outside_strict_crash_root`)
  }
  return target
}

export function assertReportPath(outputPath) {
  const resolved = resolve(outputPath)
  const relativePath = relative(crashResultsRoot, resolved)
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('report_must_be_inside_crash_recovery_results')
  }
  if (!resolved.toLowerCase().endsWith('.json')) {
    throw new Error('report_must_be_json')
  }
  return resolved
}

export async function ensureDirectory(directoryPath) {
  await mkdir(directoryPath, { recursive: true })
  return directoryPath
}

export async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function removeIfExists(filePath) {
  try {
    await unlink(filePath)
  } catch (error) {
    if (!(error instanceof Error) || error.code !== 'ENOENT') {
      throw error
    }
  }
}

export function syntheticPayload(size = 256 * 1024) {
  const payload = Buffer.alloc(size)
  const prefix = Buffer.from('teacher-workbench-t07-synthetic-payload\n', 'utf8')
  for (let offset = 0; offset < payload.length; offset += prefix.length) {
    prefix.copy(payload, offset, 0, Math.min(prefix.length, payload.length - offset))
  }
  return payload
}

export async function writeSyntheticPayload(filePath, size = 256 * 1024) {
  await ensureDirectory(dirname(filePath))
  await writeFile(filePath, syntheticPayload(size))
}

export function hashFile(filePath) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolvePromise(hash.digest('hex')))
  })
}

export async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  await ensureDirectory(dirname(filePath))
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, filePath)
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

export async function fileSummary(filePath) {
  const fileStats = await stat(filePath)
  return {
    sizeBytes: fileStats.size,
    hash: await hashFile(filePath),
  }
}

export function hashPrefix(hash) {
  return typeof hash === 'string' ? hash.slice(0, 16) : undefined
}

export const repoDirectory = repoRoot
export const joinPath = join
