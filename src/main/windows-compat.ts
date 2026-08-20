const WINDOWS_25H2_BUILD = '26200'

export const GPU_SHADER_CACHE_SWITCH = 'disable-gpu-shader-disk-cache'

interface CommandLineSwitches {
  appendSwitch(name: string): void
}

export function needsGpuShaderCacheWorkaround(
  platform: NodeJS.Platform,
  osRelease: string,
): boolean {
  const [, , build] = osRelease.split('.')
  return platform === 'win32' && build === WINDOWS_25H2_BUILD
}

export function applyWindowsCompatibility(
  commandLine: CommandLineSwitches,
  platform: NodeJS.Platform,
  osRelease: string,
): void {
  if (needsGpuShaderCacheWorkaround(platform, osRelease)) {
    commandLine.appendSwitch(GPU_SHADER_CACHE_SWITCH)
  }
}
