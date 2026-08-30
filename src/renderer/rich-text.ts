export interface MathTextPart {
  readonly text: string
  readonly formula: string | null
  readonly displayMode: boolean
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  bsol: '\\',
  colon: ':',
  dollar: '$',
  gt: '>',
  laquo: '«',
  ldquo: '“',
  lbrace: '{',
  ldblquote: '“',
  le: '≤',
  lt: '<',
  nbsp: ' ',
  ndash: '–',
  ne: '≠',
  ge: '≥',
  quot: '"',
  raquo: '»',
  rdquo: '”',
  rbrace: '}',
  times: '×',
}

const EXPLICIT_MATH_PATTERN = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$(?:\\.|[^$\\])+\$|\\\((?:\\.|[^\\])*?\\\)/gu
const BARE_LATEX_COMMAND_PATTERN = /\\(?:angle|approx|because|cdot|circ|cos|cot|dfrac|dot|geq?|infty|leq?|lim|ln|mp|neq|overline|overrightarrow|parallel|perp|pm|quad|ref|rho|sin|sqrt|tan|therefore|times|triangle|tfrac|underline|vec|mathrm|mathbf|frac)/gu
const BARE_SCRIPT_PATTERN = /[A-Za-z](?:[_^](?:\d+|[A-Za-z]|\{[^{}\n]+\}))/gu

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z][\da-z]+));/giu, (match, decimal, hexadecimal, named) => {
    if (named !== undefined) return NAMED_ENTITIES[named.toLowerCase()] ?? match
    const codePoint = Number.parseInt(decimal ?? hexadecimal, decimal === undefined ? 16 : 10)
    if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match
    try {
      return String.fromCodePoint(codePoint)
    } catch {
      return match
    }
  })
}

export function normalizeRichText(text: string): string {
  const decoded = decodeHtmlEntities(text)
    .replace(/\u200B|\u200C|\u200D|\uFEFF/gu, '')
    .replace(/\\\(\$([^$\n]+)\$\\\)/gu, (_match, formula: string) => `$${formula}$`)
    .replace(/\\\(\$([^$\n]+)\$\$\)\$/gu, (_match, formula: string) => `$${formula}$`)
  let result = ''
  let cursor = 0
  for (const match of decoded.matchAll(EXPLICIT_MATH_PATTERN)) {
    const index = match.index ?? 0
    result += wrapBareMath(decoded.slice(cursor, index))
    result += match[0]
    cursor = index + match[0].length
  }
  return result + wrapBareMath(decoded.slice(cursor))
}

/** Repairs line-wrapped SiYuan image syntax before block and inline parsing. */
export function normalizeMarkdownImageReferences(text: string): string {
  let normalized = text.replace(/\r\n?/gu, '\n')
    .replace(/!\s*(?=\[[^\]]*\]\()/gu, '!')
  let previous = ''
  while (normalized !== previous) {
    previous = normalized
    normalized = normalized.replace(/(!\[[^\]]*\]\([^)]*)\n\s*(?=[^)]*\))/gu, (match, prefix: string, offset: number, source: string) => {
      const nextCharacter = source[offset + match.length]
      return `${prefix}${nextCharacter !== undefined && /[.,;:!?)}\]]/u.test(nextCharacter) ? '' : ' '}`
    })
  }
  return normalized
}

export function splitMathText(text: string): MathTextPart[] {
  const normalized = normalizeRichText(text)
  const parts: MathTextPart[] = []
  let cursor = 0
  for (const match of normalized.matchAll(EXPLICIT_MATH_PATTERN)) {
    const index = match.index ?? 0
    if (index > cursor) parts.push(...splitPlainMath(normalized.slice(cursor, index)))
    const token = match[0]
    const displayMode = token.startsWith('$$') || token.startsWith('\\[')
    const formula = displayMode || token.startsWith('\\(')
      ? token.slice(2, -2)
      : token.slice(1, -1)
    parts.push({ text: '', formula, displayMode })
    cursor = index + token.length
  }
  if (cursor < normalized.length) parts.push(...splitPlainMath(normalized.slice(cursor)))
  return parts.length === 0 ? [{ text: normalized, formula: null, displayMode: false }] : parts
}

export function formatPlainMarkdownText(text: string): string {
  return decodeHtmlEntities(text).replace(/\\([\\`*_[\]{}()#+.!-])/gu, '$1')
}

function wrapBareMath(text: string): string {
  return splitPlainMath(text)
    .map((part) => part.formula === null ? part.text : `$${part.formula}$`)
    .join('')
}

function splitPlainMath(text: string): MathTextPart[] {
  const parts: MathTextPart[] = []
  let cursor = 0
  const candidates = [...text.matchAll(BARE_LATEX_COMMAND_PATTERN), ...text.matchAll(BARE_SCRIPT_PATTERN)]
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
  for (const match of candidates) {
    const index = match.index ?? 0
    if (index < cursor) continue
    const start = findMathRunStart(text, index)
    if (start < cursor) continue
    const end = findMathRunEnd(text, index + match[0].length)
    if (end <= index) continue
    if (start > cursor) parts.push({ text: text.slice(cursor, start), formula: null, displayMode: false })
    parts.push({ text: '', formula: text.slice(start, end).trim(), displayMode: false })
    cursor = end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), formula: null, displayMode: false })
  return parts.length === 0 ? [{ text, formula: null, displayMode: false }] : parts
}

function findMathRunStart(text: string, trigger: number): number {
  let start = trigger
  while (start > 0 && isMathRunCharacter(text[start - 1])) start -= 1
  return start
}

function findMathRunEnd(text: string, cursor: number): number {
  let end = cursor
  while (end < text.length) {
    const character = text[end]
    if (isMathRunCharacter(character)) {
      end += 1
      continue
    }
    if (/\s/u.test(character)) {
      let lookahead = end + 1
      while (lookahead < text.length && /\s/u.test(text[lookahead])) lookahead += 1
      if (lookahead < text.length && isMathRunCharacter(text[lookahead])) {
        end = lookahead
        continue
      }
    }
    break
  }
  return end
}

function isMathRunCharacter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_{}^[\]\\+\-*/=().|,:·±≤≥<>]/u.test(character) && !/[;，。；：！？、]/u.test(character)
}
