import { describe, expect, it } from 'vitest'

import {
  decodeHtmlEntities,
  formatPlainMarkdownText,
  normalizeRichText,
  splitMathText,
} from '../src/renderer/rich-text'

describe('rich text normalization', () => {
  it('decodes HTML entities without relying on innerHTML', () => {
    expect(decodeHtmlEntities('b &gt; -1, b &lt; -1, &amp; &#x2260;')).toBe('b > -1, b < -1, & ≠')
    expect(formatPlainMarkdownText('\\_\\_\\_\\_ &gt; 0')).toBe('____ > 0')
  })

  it('wraps bare LaTeX commands as math while preserving surrounding text', () => {
    const parts = splitMathText('k&gt;\\frac{5}{4}; (2) 另一个根为 0')
    expect(parts.filter((part) => part.formula !== null).map((part) => part.formula)).toEqual(['k>\\frac{5}{4}'])
    expect(parts.find((part) => part.text.includes('另一个根'))?.text).toContain('另一个根为 0')
  })

  it('supports bare vector and script formulas and keeps explicit delimiters intact', () => {
    const normalized = normalizeRichText('3\\vec a-\\frac12\\vec b，$x_1=1$')
    expect(normalized).toContain('$3\\vec a-\\frac12\\vec b$')
    expect(normalized).toContain('$x_1=1$')
    expect(splitMathText(normalized).filter((part) => part.formula !== null)).toHaveLength(2)
  })
})
