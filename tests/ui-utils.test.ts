import { describe, expect, it } from 'vitest'

import { formatBytes, toErrorMessage } from '../src/renderer/ui-utils'

describe('ui-utils', () => {
  describe('toErrorMessage', () => {
    it('正常 Error 使用其 message', () => {
      expect(toErrorMessage(new Error('读取失败'), '回退文案')).toBe('读取失败')
    })

    it('空白 message 的 Error 回退到固定文案', () => {
      expect(toErrorMessage(new Error('   '), '回退文案')).toBe('回退文案')
    })

    it('非 Error 值回退到固定文案', () => {
      expect(toErrorMessage('随便一个字符串', '回退文案')).toBe('回退文案')
      expect(toErrorMessage(undefined, '回退文案')).toBe('回退文案')
      expect(toErrorMessage({ message: '不是 Error' }, '回退文案')).toBe('回退文案')
    })
  })

  describe('formatBytes', () => {
    it('小于 1KB 显示 B', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(1023)).toBe('1023 B')
    })

    it('KB 档四舍五入', () => {
      expect(formatBytes(1024)).toBe('1 KB')
      expect(formatBytes(1536)).toBe('2 KB')
      expect(formatBytes(1024 * 1024 - 1)).toBe('1024 KB')
    })

    it('MB 档保留一位小数，无 GB 档', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
      expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB')
      expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3072.0 MB')
    })
  })
})
