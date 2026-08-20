export type LogLevel = 'info' | 'warn' | 'error'
export type LogSink = (line: string) => void

const REDACTED = '[REDACTED]'
const OMITTED = '[OMITTED]'
const sensitiveAssignmentPattern =
  /(["']?(?:api[_-]?key|x-api-key|token|authorization|password|secret)["']?\s*[:=]\s*)(?:(?:Bearer|Basic)\s+)?("[^"]*"|'[^']*'|[^\s,;}"']+)/gi
const sensitiveWhitespacePattern =
  /(\b(?:api[_-]?key|x-api-key|token|authorization|password|secret)\b\s+(?:(?:Bearer|Basic)\s+)?)(?:"[^"]*"|'[^']*'|[^\s,;}"']+)/gi
const bearerTokenPattern = /\b(?:Bearer|Basic)\s+([A-Za-z0-9._~+/=-]+)/gi
const fileContentAssignmentPattern =
  /(["']?(?:body(?:[_-]?(?:md|markdown))?|file[_-]?(?:content|body|text)|document[_-]?(?:content|body|text)|(?:raw|source)[_-]?(?:content|text|body)|content(?:[_-]?md)?|text|markdown(?:[_-]?content)?)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}"']+)/gi
const fileContentWhitespacePattern =
  /(\b(?:body(?:[_-]?(?:md|markdown))?|file[_-]?(?:content|body|text)|document[_-]?(?:content|body|text)|(?:raw|source)[_-]?(?:content|text|body)|content(?:[_-]?md)?|text|markdown(?:[_-]?content)?)\b\s+)(?:"[^"]*"|'[^']*'|[^\s,;}"']+)/gi

export class StructuredLogger {
  private readonly sink: LogSink

  constructor(sink: LogSink = defaultLogSink) {
    this.sink = sink
  }

  log(level: LogLevel, event: string, details: Record<string, unknown> = {}): void {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      event,
      details: redactLogValue(details),
    }
    this.sink(JSON.stringify(record))
  }

  error(event: string, error: unknown, details: Record<string, unknown> = {}): void {
    this.log('error', event, {
      ...details,
      error: serializeError(error),
    })
  }
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSensitiveText(error.message),
      stack: error.stack ? redactSensitiveText(error.stack) : undefined,
    }
  }

  return {
    name: 'UnknownError',
    message: redactSensitiveText(String(error)),
  }
}

export function redactLogValue(value: unknown, key = '', seen = new WeakSet<object>()): unknown {
  if (isSensitiveKey(key)) {
    return REDACTED
  }
  if (isFileContentKey(key)) {
    return OMITTED
  }
  if (typeof value === 'string') {
    return redactSensitiveText(value)
  }
  if (value === null || typeof value !== 'object') {
    return typeof value === 'bigint' ? value.toString() : value
  }
  if (value instanceof Error) {
    return serializeError(value)
  }
  if (seen.has(value)) {
    return '[CIRCULAR]'
  }
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item, '', seen))
  }

  const result: Record<string, unknown> = {}
  for (const [entryKey, entryValue] of Object.entries(value)) {
    result[entryKey] = redactLogValue(entryValue, entryKey, seen)
  }
  return result
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(sensitiveAssignmentPattern, '$1[REDACTED]')
    .replace(sensitiveWhitespacePattern, '$1[REDACTED]')
    .replace(fileContentAssignmentPattern, '$1[OMITTED]')
    .replace(fileContentWhitespacePattern, '$1[OMITTED]')
    .replace(bearerTokenPattern, (scheme) => scheme.split(/\s+/)[0] + ' [REDACTED]')
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key)
  return ['apikey', 'token', 'authorization', 'password', 'secret'].some((part) =>
    normalized.includes(part),
  )
}

function isFileContentKey(key: string): boolean {
  const normalized = normalizeKey(key)
  return (
    ['body', 'bodymd', 'bodymarkdown', 'content', 'contentmd', 'documentbody', 'documentcontent',
      'documenttext', 'filebody', 'filecontent', 'filetext', 'markdown', 'markdowncontent',
      'rawcontent', 'rawtext', 'sourcebody', 'sourcecontent', 'text'].includes(normalized) ||
    normalized.endsWith('bodymd') ||
    normalized.endsWith('bodymarkdown')
  )
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function defaultLogSink(line: string): void {
  const parsed = JSON.parse(line) as { level?: LogLevel }
  if (parsed.level === 'error') {
    console.error(line)
  } else {
    console.log(line)
  }
}
