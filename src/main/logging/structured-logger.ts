export type LogLevel = 'info' | 'warn' | 'error'
export type LogSink = (line: string) => void

const REDACTED = '[REDACTED]'
const OMITTED = '[OMITTED]'
const sensitiveAssignmentPattern =
  /\b(api[_-]?key|token|authorization|password|secret)\b\s*[:=]\s*(?:Bearer\s+)?("[^"]*"|'[^']*'|[^\s,;]+)/gi

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
  return value.replace(sensitiveAssignmentPattern, '$1=[REDACTED]')
}

function isSensitiveKey(key: string): boolean {
  return /(?:api[_-]?key|token|authorization|password|secret)/i.test(key)
}

function isFileContentKey(key: string): boolean {
  return /^(?:file[_-]?)?(?:content|body|text|document(?:content|text)?)$/i.test(key)
}

function defaultLogSink(line: string): void {
  const parsed = JSON.parse(line) as { level?: LogLevel }
  if (parsed.level === 'error') {
    console.error(line)
  } else {
    console.log(line)
  }
}
