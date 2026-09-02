import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { ManagedFileRecord } from '../src/shared/file-contracts'
import { MarkdownDocument } from '../src/renderer/lesson-material-reader'

function file(id: string, originalName: string, mimeType: string): ManagedFileRecord {
  return {
    id,
    originalName,
    sizeBytes: 10,
    mimeType,
    originFileId: null,
    mtimeMs: 1,
    contentHash: null,
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:00.000Z',
    deletedAt: null,
  }
}

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

  it('renders single-line \\[...\\] display math with absolute values (V1.6 修复回归)', () => {
    // 修复前：renderInline 缺 \[ 分支，token 掉进斜体分支被剥首尾字符、以纯文本漏出。
    const markup = renderToStaticMarkup(createElement(MarkdownDocument, {
      body: '\\[ |a-b|+|b-c|-|a+c|=(b-a)+(c-b)-(-a-c)=2c \\]',
      files: [],
    }))

    expect(markup).toContain('material-math-display')
    expect(markup).toContain('class="katex"')
    expect(markup).not.toContain('katex-error')
    // 绝对值竖线必须进入 KaTeX，而不是以裸文本漏出
    expect(markup).not.toContain('<p>[ |a-b|')
  })

  it('merges multi-line \\[ ... \\] display math into a rendered formula (V1.6 修复回归)', () => {
    // 修复前：段落逐行渲染，\[ 与 \] 各占一行时定界符拆散、无法配对。
    const markup = renderToStaticMarkup(createElement(MarkdownDocument, {
      body: '解：原式化简如下\n\\[\n |a-b|+|b-c|-|a+c|=(b-a)+(c-b)-(-a-c)=2c \n\\]\n所以结果为 \\(2c\\)。',
      files: [],
    }))

    expect(markup).toContain('material-math-display')
    expect(markup).toContain('class="katex"')
    expect(markup).not.toContain('katex-error')
    expect(markup).not.toContain('[ |a-b|')
  })

  it('decodes escaped comparisons and renders bare LaTeX fragments', () => {
    const markup = renderToStaticMarkup(createElement(MarkdownDocument, {
      body: '(1) k&gt;\\frac{5}{4}; (2) 另一个根为 0',
      files: [],
    }))

    expect(markup).toContain('class="katex"')
    expect(markup).not.toContain('&amp;gt;')
  })

  it('repairs line-wrapped SiYuan image references without leaking the raw asset path', () => {
    const image = file('figure', '65907257da1299e1a28868273761bb2dformat, fauto 20260320150348 - 2ejaeag.webp', 'image/webp')
    const markup = renderToStaticMarkup(createElement(MarkdownDocument, {
      body: '!\n[65907257da1299e1a28868273761bb2dformat, fauto](assets/65907257da1299e1a28868273761bb2dformat, fauto\n20260320150348 - 2ejaeag.webp)',
      files: [image],
    }))

    expect(markup).toContain('material-image-missing')
    expect(markup).toContain('65907257da1299e1a28868273761bb2dformat, fauto')
    expect(markup).not.toContain('assets/')
    expect(markup).not.toContain('20260320150348 - 2ejaeag.webp)')
  })

  it('does not treat underscores in image filenames as math scripts', () => {
    const image = file('figure', 'figure_name.webp', 'image/webp')
    const markup = renderToStaticMarkup(createElement(MarkdownDocument, {
      body: '![图](assets/figure_name.webp)',
      files: [image],
    }))

    expect(markup).toContain('material-image-missing')
  })
})
