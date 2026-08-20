import { describe, expect, it } from 'vitest'

import {
  applyWindowsCompatibility,
  GPU_SHADER_CACHE_SWITCH,
  needsGpuShaderCacheWorkaround,
} from '../src/main/windows-compat'

describe('Windows Electron compatibility', () => {
  it('disables only the shader disk cache on Windows 25H2 build 26200', () => {
    const switches: string[] = []

    applyWindowsCompatibility(
      { appendSwitch: (name) => switches.push(name) },
      'win32',
      '10.0.26200',
    )

    expect(switches).toEqual([GPU_SHADER_CACHE_SWITCH])
    expect(GPU_SHADER_CACHE_SWITCH).toBe('disable-gpu-shader-disk-cache')
    expect(GPU_SHADER_CACHE_SWITCH).not.toMatch(/no-sandbox|disable-gpu-sandbox/)
  })

  it('does not change Chromium switches on unaffected systems', () => {
    expect(needsGpuShaderCacheWorkaround('win32', '10.0.26100')).toBe(false)
    expect(needsGpuShaderCacheWorkaround('darwin', '24.6.0')).toBe(false)
  })
})
