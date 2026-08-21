/** Search normalization is deliberately small and versioned with the index. */
export const SEARCH_NORMALIZER_VERSION = 1

const MATH_REPLACEMENTS: Readonly<Record<string, string>> = {
  '−': '-',
  '–': '-',
  '—': '-',
  '×': '*',
  '÷': '/',
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
  '≈': '~=',
  '∕': '/',
  '·': '*',
  '²': '2',
  '³': '3',
  '⁰': '0',
  '¹': '1',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
}

export function normalizeSearchText(value: string): string {
  if (typeof value !== 'string') {
    return ''
  }

  let normalized = value.normalize('NFKC').toLocaleLowerCase('zh-CN')
  for (const [from, to] of Object.entries(MATH_REPLACEMENTS)) {
    normalized = normalized.replaceAll(from, to)
  }
  return normalized.replace(/\s+/gu, ' ').trim()
}

export const SearchNormalizer = Object.freeze({
  version: SEARCH_NORMALIZER_VERSION,
  normalize: normalizeSearchText,
})

export function isShortSearchText(normalizedText: string): boolean {
  return Array.from(normalizedText).length > 0 && Array.from(normalizedText).length <= 2
}

export function quoteFtsPhrase(normalizedText: string): string {
  return `"${normalizedText.replaceAll('"', '""')}"`
}
