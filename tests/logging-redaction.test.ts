import { describe, expect, it } from 'vitest'

import {
  redactSensitiveText,
  redactLogValue,
  serializeError,
  StructuredLogger,
} from '../src/main/logging/structured-logger'
import { TeacherWorkbenchError, IPC_ERROR_CODES } from '../src/shared/ipc-contracts'

describe('structured log redaction', () => {
  it('redacts credentials and omits file content from logs and error serialization', () => {
    const lines: string[] = []
    const logger = new StructuredLogger((line) => lines.push(line))
    logger.error(
      'test.secret',
      new Error(
        '{"authorization":"Bearer SOL_AUDIT_SECRET","body_md":"SOL_AUDIT_BODY"} apiKey=top-secret password=pw-secret',
      ),
      {
        apiKey: 'top-secret',
        token: 'token-secret',
        authorization: 'Bearer auth-secret',
        password: 'pw-secret',
        body_md: 'SOL_AUDIT_BODY',
        fileContent: '学生作答正文不应进入日志',
        nested: {
          documentText: '整份文档正文也不应进入日志',
          body_md: 'SOL_AUDIT_NESTED_BODY',
          headers: { authorization: 'Bearer SOL_AUDIT_HEADER' },
        },
      },
    )

    const serialized = lines.join('\n')
    expect(serialized).not.toContain('top-secret')
    expect(serialized).not.toContain('pw-secret')
    expect(serialized).not.toContain('token-secret')
    expect(serialized).not.toContain('auth-secret')
    expect(serialized).not.toContain('SOL_AUDIT_SECRET')
    expect(serialized).not.toContain('SOL_AUDIT_BODY')
    expect(serialized).not.toContain('SOL_AUDIT_NESTED_BODY')
    expect(serialized).not.toContain('SOL_AUDIT_HEADER')
    expect(serialized).not.toContain('学生作答正文')
    expect(serialized).not.toContain('整份文档正文')
    expect(serialized).toContain('[REDACTED]')
    expect(serialized).toContain('[OMITTED]')
    expect(serialized).toContain('test.secret')
    expect(serialized).toContain('error')
  })

  it('keeps the stable client error serializable without a Main stack', () => {
    const error = new TeacherWorkbenchError({
      code: IPC_ERROR_CODES.INTERNAL_ERROR,
      message: '无法完成请求，请稍后重试。',
    })
    expect(error.toJSON()).toEqual({
      name: 'TeacherWorkbenchError',
      code: IPC_ERROR_CODES.INTERNAL_ERROR,
      message: '无法完成请求，请稍后重试。',
    })
    expect(JSON.stringify(error)).not.toContain('stack')
    expect(redactLogValue({ password: 'secret' })).toEqual({ password: '[REDACTED]' })
    expect(redactLogValue({ body_md: 'SOL_AUDIT_BODY' })).toEqual({ body_md: '[OMITTED]' })
    expect(redactSensitiveText('authorization Bearer SOL_AUDIT_SECRET')).toBe(
      'authorization Bearer [REDACTED]',
    )
    expect(
      serializeError(new Error('Authorization: Bearer SOL_AUDIT_SECRET')).message,
    ).toBe('Authorization: [REDACTED]')
  })
})
