import { OfficeParser } from 'officeparser'

const parseFailureCodes = new Set([
  'FILE_CORRUPTED',
  'ZIP_ENTRY_COUNT_LIMIT_EXCEEDED',
  'ZIP_ENTRY_INVALID_SIZE',
  'ZIP_SIZE_LIMIT_EXCEEDED',
  'ZIP_NO_ENTRIES_FOUND',
  'ZIP_TRUNCATED',
  'REQUIRED_PART_MISSING',
  'MAX_NESTING_DEPTH_EXCEEDED',
])

const diagnosticQueries = [
  ['有理数', 'rationalNumber'],
  ['一元二次', 'quadraticEquation'],
  ['函数', 'function'],
  ['几何', 'geometry'],
  ['圆', 'circle'],
  ['AMC8', 'amc8'],
  ['P16', 'p16'],
  ['|x|', 'absoluteValue'],
  ['∠ABC', 'angleAbc'],
  ['△ABC', 'triangleAbc'],
  ['x²', 'xSquared'],
]

function countOccurrences(text, query) {
  let count = 0
  let offset = 0
  while (true) {
    const index = text.indexOf(query, offset)
    if (index === -1) {
      return count
    }
    count += 1
    offset = index + query.length
  }
}

function collectNodeDiagnostics(nodes, counts = {}) {
  if (!Array.isArray(nodes)) {
    return counts
  }

  for (const node of nodes) {
    const type = typeof node?.type === 'string' ? node.type : 'unknown'
    counts[type] = (counts[type] ?? 0) + 1
    collectNodeDiagnostics(node?.children, counts)
    collectNodeDiagnostics(node?.notes, counts)
    collectNodeDiagnostics(node?.comments, counts)
  }
  return counts
}

function countSignalCharacters(text, pattern) {
  return [...text.matchAll(pattern)].length
}

function toPosition(chunkMetadata, sourceType) {
  if (typeof chunkMetadata?.pageNumber === 'number') {
    return { positionType: 'page', positionValue: chunkMetadata.pageNumber }
  }
  if (typeof chunkMetadata?.slideNumber === 'number') {
    return { positionType: 'slide', positionValue: chunkMetadata.slideNumber }
  }
  if (typeof chunkMetadata?.sheetName === 'string') {
    return { positionType: 'sheet', positionValue: chunkMetadata.sheetName }
  }
  if (typeof chunkMetadata?.closestHeading === 'string') {
    return { positionType: 'heading', positionValue: chunkMetadata.closestHeading }
  }
  return { positionType: sourceType, positionValue: undefined }
}

function toChunks(sourceType, value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((chunk) => typeof chunk?.text === 'string')
    .map((chunk) => {
      const position = toPosition(chunk.metadata, sourceType)
      return {
        text: chunk.text,
        positionType: position.positionType,
        positionValue: position.positionValue,
        heading: typeof chunk.metadata?.closestHeading === 'string' ? chunk.metadata.closestHeading : undefined,
      }
    })
}

function parserErrorDetails(error) {
  const issue = error?.officeIssue
  const code = typeof issue?.code === 'string'
    ? issue.code
    : error instanceof Error && typeof error.name === 'string'
      ? error.name
      : 'UNKNOWN_PARSE_ERROR'
  return {
    parserErrorCode: code,
    parserErrorKind: parseFailureCodes.has(code) ? 'invalid_input' : 'parser_error',
  }
}

export async function parse(filePath) {
  try {
    const ast = await OfficeParser.parseOffice(filePath, {
      ocr: false,
      extractAttachments: false,
      includeRawContent: false,
      ignoreSlideMasters: true,
    })
    const textResult = await ast.to('text', {
      includeImages: false,
      renderMetadata: false,
      textConfig: { preserveLayout: true },
    })
    const chunkResult = await ast.to('chunks', {
      strategy: 'document-structure',
      maxChunkSize: 1000,
      chunkOverlap: 0,
      includeMetadata: true,
    })
    const text = typeof textResult.value === 'string' ? textResult.value : ''
    const chunks = toChunks(ast.type, chunkResult.value)
    const nodeTypeCounts = collectNodeDiagnostics(ast.content)
    const warningCodes = [...new Set(
      (Array.isArray(ast.warnings) ? ast.warnings : [])
        .map((warning) => warning?.code)
        .filter((code) => typeof code === 'string'),
    )]

    return {
      text,
      chunks,
      parseStatus: text.trim().length > 0 || chunks.some((chunk) => chunk.text.trim().length > 0)
        ? 'indexed'
        : 'no_text',
      diagnostics: {
        parserType: ast.type,
        warningCount: Array.isArray(ast.warnings) ? ast.warnings.length : 0,
        warningCodes,
        nodeTypeCounts,
        textSignals: {
          cjkCharCount: countSignalCharacters(text, /[\u3400-\u9fff]/g),
          mathSymbolCount: countSignalCharacters(text, /[∠△²√∑≤≥≠∞]/g),
          queryMatches: Object.fromEntries(
            diagnosticQueries.map(([query, key]) => [key, countOccurrences(text, query)]),
          ),
        },
      },
    }
  } catch (error) {
    return {
      text: '',
      chunks: [],
      parseStatus: 'parse_failed',
      diagnostics: parserErrorDetails(error),
    }
  }
}
