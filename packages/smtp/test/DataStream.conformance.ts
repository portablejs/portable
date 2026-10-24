import { fromIterable, toBytes } from '@portable/streams'
import { describe, expect, test } from 'vite-plus/test'
import { DataStream, encodeData } from '../src/DataStream.js'
import { encode } from './utils.js'

const decoder = new TextDecoder()

async function stream(chunks: readonly (string | Uint8Array)[]): Promise<string> {
  const bytes = chunks.map((chunk) => (typeof chunk === 'string' ? encode(chunk) : chunk))
  return decoder.decode(await toBytes(fromIterable(bytes).pipeThrough(new DataStream())))
}

describe('termination', () => {
  test('ends a message that already ends with CRLF with a single dot line', async () => {
    expect(await stream(['Subject: test\r\n\r\nhello\r\n'])).toBe(
      'Subject: test\r\n\r\nhello\r\n.\r\n',
    )
  })

  test('adds the missing line break before the terminating dot', async () => {
    expect(await stream(['hello'])).toBe('hello\r\n.\r\n')
  })

  test('completes a trailing bare CR before terminating', async () => {
    expect(await stream(['hello\r'])).toBe('hello\r\n.\r\n')
  })

  test('terminates an empty message with only the dot line', async () => {
    expect(await stream([])).toBe('.\r\n')
  })
})

describe('line breaks', () => {
  test('converts bare LF line breaks to CRLF', async () => {
    expect(await stream(['line 1\nline 2\n\nline 4'])).toBe(
      'line 1\r\nline 2\r\n\r\nline 4\r\n.\r\n',
    )
  })

  test('keeps existing CRLF pairs as they are', async () => {
    expect(await stream(['line 1\r\nline 2\r\n'])).toBe('line 1\r\nline 2\r\n.\r\n')
  })

  test('does not double a CRLF pair that is split across chunks', async () => {
    expect(await stream(['line 1\r', '\nline 2'])).toBe('line 1\r\nline 2\r\n.\r\n')
  })

  test('converts an LF at the start of a chunk when the previous chunk did not end with CR', async () => {
    expect(await stream(['line 1', '\nline 2'])).toBe('line 1\r\nline 2\r\n.\r\n')
  })

  test('converts a bare CR inside a line to CRLF', async () => {
    expect(await stream(['a\rb\r\n'])).toBe('a\r\nb\r\n.\r\n')
  })

  test('converts consecutive bare CRs to CRLF pairs', async () => {
    expect(await stream(['a\r\r\nb'])).toBe('a\r\n\r\nb\r\n.\r\n')
  })

  test('completes a bare CR at the end of a chunk when the next chunk does not start with LF', async () => {
    expect(await stream(['a\r', 'b\r', '\nc'])).toBe('a\r\nb\r\nc\r\n.\r\n')
  })
})

describe('dot-stuffing', () => {
  test('doubles a dot at the start of a line', async () => {
    expect(await stream(['first\r\n.second\r\n..third\r\n'])).toBe(
      'first\r\n..second\r\n...third\r\n.\r\n',
    )
  })

  test('doubles a dot at the very start of the message', async () => {
    expect(await stream(['.hidden'])).toBe('..hidden\r\n.\r\n')
  })

  test('escapes a line that consists of a single dot', async () => {
    expect(await stream(['before\n.\nafter'])).toBe('before\r\n..\r\nafter\r\n.\r\n')
  })

  test('doubles a dot at the start of a chunk that follows a line break', async () => {
    expect(await stream(['first\n', '.second'])).toBe('first\r\n..second\r\n.\r\n')
  })

  test('does not touch a dot at the start of a chunk in the middle of a line', async () => {
    expect(await stream(['first', '.second'])).toBe('first.second\r\n.\r\n')
  })

  test('does not touch dots inside a line', async () => {
    expect(await stream(['a.b.c\r\n'])).toBe('a.b.c\r\n.\r\n')
  })

  test('stuffs a dot that follows a bare CR, which is turned into a line break', async () => {
    expect(await stream(['first\r.second'])).toBe('first\r\n..second\r\n.\r\n')
  })

  test('does not let a bare CR sequence smuggle an end of data marker', async () => {
    const output = await stream(['a\r.\rMAIL FROM:<x>\r\n'])
    expect(output).toBe('a\r\n..\r\nMAIL FROM:<x>\r\n.\r\n')
    expect(output).not.toMatch(/\r(?!\n)/)
  })

  test('stuffs a dot after a bare CR that ends the previous chunk', async () => {
    expect(await stream(['a\r', '.\r', 'MAIL FROM:<x>\r\n'])).toBe(
      'a\r\n..\r\nMAIL FROM:<x>\r\n.\r\n',
    )
  })

  test('does not let a bare LF smuggle an end of data marker', async () => {
    const output = await stream(['a\n.\nMAIL FROM:<x>\n'])
    expect(output).toBe('a\r\n..\r\nMAIL FROM:<x>\r\n.\r\n')
    expect(output.indexOf('\r\n.\r\n')).toBe(output.length - 5)
  })
})

describe('input handling', () => {
  test('ignores empty chunks', async () => {
    expect(await stream([new Uint8Array(0), 'hello', new Uint8Array(0)])).toBe('hello\r\n.\r\n')
  })

  test('passes 8-bit content through unchanged', async () => {
    const bytes = await toBytes(
      fromIterable([new Uint8Array([0xc3, 0xb6, 0x0a, 0x2e, 0xff])]).pipeThrough(new DataStream()),
    )
    expect([...bytes]).toEqual([
      0xc3, 0xb6, 0x0d, 0x0a, 0x2e, 0x2e, 0xff, 0x0d, 0x0a, 0x2e, 0x0d, 0x0a,
    ])
  })

  test('gives the same bytes however the input is chunked', async () => {
    const text = '.a\r\n.\r\nb\rc\n\n..d\r\r\n.e\r'
    const whole = decoder.decode(encodeData(encode(text)))
    for (let size = 1; size <= text.length; size++) {
      const chunks: string[] = []
      for (let i = 0; i < text.length; i += size) {
        chunks.push(text.slice(i, i + size))
      }
      expect(await stream(chunks)).toBe(whole)
    }
  })

  test('encodeData gives the same bytes as the stream', async () => {
    for (const text of ['', 'a', '.', 'a\r', 'a\n', 'x\r\n.\r\n', '\r\r\n\n.']) {
      expect(decoder.decode(encodeData(encode(text)))).toBe(await stream([text]))
    }
  })
})
