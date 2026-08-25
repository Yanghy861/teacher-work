import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MarkdownDocument } from '../src/renderer/lesson-material-reader'

describe('lesson material Markdown reader', () => {
  it('renders SiYuan-tolerated inline math and preserves Markdown hard breaks', () => {
    const body = [
      '例：已知 \\($\\angle A:\\angle B:\\angle C=1:2:3$\\)，求各角度数。  ',
      '**方法**：设 k法  ',
      '设 \\($\\angle A=k,\\angle B=2k,\\angle C=3k$\u200b$)$  ',
      '$k+2k+3k=180^\\circ$',
    ].join('\n')

    const markup = renderToStaticMarkup(createElement(MarkdownDocument, { body, files: [] }))

    expect(markup.match(/class="katex"/gu)).toHaveLength(3)
    expect(markup.match(/<br\/>/gu)).toHaveLength(3)
    expect(markup).not.toContain('katex-error')
    expect(markup).not.toContain('\\($')
  })

  it('decodes escaped comparisons and renders bare LaTeX fragments', () => {
    const markup = renderToStaticMarkup(createElement(MarkdownDocument, {
      body: '(1) k&gt;\\frac{5}{4}; (2) 另一个根为 0',
      files: [],
    }))

    expect(markup).toContain('class="katex"')
    expect(markup).not.toContain('&amp;gt;')
  })
})
