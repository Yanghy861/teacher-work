import { existsSync, lstatSync, mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

export type WorkspacePathErrorCode =
  | 'WORKSPACE_PATH_EMPTY'
  | 'WORKSPACE_PATH_NOT_ABSOLUTE'
  | 'WORKSPACE_PATH_INSIDE_APP'
  | 'WORKSPACE_PATH_NOT_DIRECTORY'
  | 'WORKSPACE_PATH_NOT_WRITABLE'
  | 'WORKSPACE_PATH_INIT_FAILED'
  | 'WORKSPACE_INSTALL_PATH_REQUIRED'

export class WorkspacePathError extends Error {
  readonly code: WorkspacePathErrorCode
  readonly targetPath: string

  constructor(code: WorkspacePathErrorCode, message: string, targetPath: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WorkspacePathError'
    this.code = code
    this.targetPath = targetPath
  }
}

export class WorkspacePaths {
  readonly root: string
  readonly dataDirectory: string
  readonly databasePath: string
  readonly filesDirectory: string
  readonly objectsDirectory: string
  readonly searchDirectory: string
  readonly searchDatabasePath: string
  readonly cacheDirectory: string
  readonly backupsDirectory: string

  private constructor(root: string) {
    if (!root.trim()) {
      throw new WorkspacePathError(
        'WORKSPACE_PATH_EMPTY',
        '工作区路径不能为空，请选择一个本地文件夹。',
        root,
      )
    }
    if (!isAbsolute(root)) {
      throw new WorkspacePathError(
        'WORKSPACE_PATH_NOT_ABSOLUTE',
        '工作区路径必须是绝对路径，不能使用相对路径。',
        root,
      )
    }

    this.root = resolve(root)
    this.dataDirectory = join(this.root, 'data')
    this.databasePath = join(this.dataDirectory, 'workspace.db')
    this.filesDirectory = join(this.root, 'files')
    this.objectsDirectory = join(this.filesDirectory, 'objects')
    this.searchDirectory = join(this.root, 'search')
    this.searchDatabasePath = join(this.searchDirectory, 'search.db')
    this.cacheDirectory = join(this.root, 'cache')
    this.backupsDirectory = join(this.root, 'backups')
  }

  static fromRoot(root: string, appInstallPath: string): WorkspacePaths {
    const paths = new WorkspacePaths(root)
    assertPathOutside(paths.root, appInstallPath)
    return paths
  }

  static fromDefaultLocation(appDataPath: string, appInstallPath: string): WorkspacePaths {
    assertAbsolutePath(appDataPath, '应用数据目录')
    const candidate = resolve(appDataPath, 'TeacherWorkspace')
    assertPathOutside(candidate, appInstallPath)
    return new WorkspacePaths(candidate)
  }

  allDirectories(): readonly string[] {
    return [
      this.root,
      this.dataDirectory,
      this.filesDirectory,
      this.objectsDirectory,
      this.searchDirectory,
      this.cacheDirectory,
      this.backupsDirectory,
    ]
  }
}

export interface EnsureWorkspaceDirectoriesOptions {
  readonly writableProbe?: (directory: string) => void
}

export function assertPathOutside(candidatePath: string, appInstallPath: string): void {
  assertAbsolutePath(candidatePath, '工作区路径')
  const candidate = resolve(candidatePath)
  const install = validateInstallPath(appInstallPath)
  const relativePath = relative(install, candidate)
  const isInside = relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))

  if (isInside) {
    throw new WorkspacePathError(
      'WORKSPACE_PATH_INSIDE_APP',
      '工作区不能位于应用安装目录内，请选择独立的数据目录。',
      candidate,
    )
  }
}

function assertAbsolutePath(path: string, label: string): void {
  if (typeof path !== 'string' || !path.trim()) {
    throw new WorkspacePathError(
      'WORKSPACE_PATH_EMPTY',
      label + '不能为空。',
      typeof path === 'string' ? path : '',
    )
  }
  if (!isAbsolute(path)) {
    throw new WorkspacePathError(
      'WORKSPACE_PATH_NOT_ABSOLUTE',
      label + '必须是绝对路径。',
      path,
    )
  }
}

function validateInstallPath(appInstallPath: string): string {
  if (typeof appInstallPath !== 'string' || !appInstallPath.trim()) {
    throw new WorkspacePathError(
      'WORKSPACE_INSTALL_PATH_REQUIRED',
      '必须提供应用安装目录，才能校验工作区是否与程序分离。',
      typeof appInstallPath === 'string' ? appInstallPath : '',
    )
  }
  assertAbsolutePath(appInstallPath, '应用安装目录')
  return resolve(appInstallPath)
}

export function ensureWorkspaceDirectories(
  paths: WorkspacePaths,
  options: EnsureWorkspaceDirectoriesOptions = {},
): void {
  const writableProbe = options.writableProbe ?? probeDirectoryWritable

  for (const directory of paths.allDirectories()) {
    ensureDirectory(directory)
    try {
      writableProbe(directory)
    } catch (error) {
      throw new WorkspacePathError(
        'WORKSPACE_PATH_NOT_WRITABLE',
        `工作区目录不可写：${directory}。请检查权限或选择其他文件夹。`,
        directory,
        { cause: error },
      )
    }
  }
}

function ensureDirectory(directory: string): void {
  try {
    if (existsSync(directory)) {
      if (!lstatSync(directory).isDirectory()) {
        throw new WorkspacePathError(
          'WORKSPACE_PATH_NOT_DIRECTORY',
          `工作区路径不是文件夹：${directory}。请选择一个文件夹。`,
          directory,
        )
      }
      return
    }
    mkdirSync(directory, { recursive: true })
  } catch (error) {
    if (error instanceof WorkspacePathError) {
      throw error
    }
    throw new WorkspacePathError(
      'WORKSPACE_PATH_INIT_FAILED',
      `无法创建工作区目录：${directory}。请检查路径和权限。`,
      directory,
      { cause: error },
    )
  }
}

function probeDirectoryWritable(directory: string): void {
  const probePath = join(directory, `.teacher-workbench-write-test-${randomUUID()}.tmp`)
  try {
    const descriptor = openSync(probePath, 'wx')
    closeSync(descriptor)
    unlinkSync(probePath)
  } catch (error) {
    try {
      if (existsSync(probePath)) {
        unlinkSync(probePath)
      }
    } catch {
      // Keep the original write error as the actionable failure.
    }
    throw error
  }
}
