import { describe, expect, test } from 'vite-plus/test'
import * as Sse from '@portable/sse'
import * as Streams from '@portable/streams'
import { encodeMessages } from './utils.js'

describe('hono streamSSE', () => {
  test('writes event, data lines and id', async () => {
    const messages = [0, 1, 2, 3, 4].map((i) => ({
      data: `Message\nIt is ${i}`,
      event: 'time-update',
      id: String(i),
    }))
    const chunks = await Streams.toArray(
      Streams.fromIterable(messages).pipeThrough(new Sse.EncoderStream()),
    )
    expect(chunks.map((chunk) => new TextDecoder().decode(chunk))).toEqual(
      [0, 1, 2, 3, 4].map(
        (i) => `event: time-update\ndata: Message\ndata: It is ${i}\nid: ${i}\n\n`,
      ),
    )
  })

  test('writes a data-only message', () => {
    expect(Sse.encode({ data: 'Message 0' })).toBe('data: Message 0\n\n')
  })

  test('writes retry', () => {
    expect(Sse.encode({ data: 'This is a test message', retry: 3000 })).toBe(
      'data: This is a test message\nretry: 3000\n\n',
    )
  })

  test('writes retry: 0', () => {
    expect(Sse.encode({ data: 'This is a test message', retry: 0 })).toContain('retry: 0\n\n')
  })

  test('writes an empty id, which resets the last event ID', () => {
    expect(Sse.encode({ data: 'reset', id: '' })).toBe('data: reset\nid: \n\n')
  })

  test.each([
    ['CR', 'Line1\rLine2', 'data: Line1\ndata: Line2\n'],
    ['CRLF', 'Line1\r\nLine2', 'data: Line1\ndata: Line2\n'],
    ['mixed line breaks', 'A\nB\r\nC\rD', 'data: A\ndata: B\ndata: C\ndata: D\n'],
    ['consecutive CRs', 'Left\r\rRight', 'data: Left\ndata: \ndata: Right\n'],
  ])('splits data on %s', (_name, data, lines) => {
    expect(Sse.encode({ event: 'test', data })).toBe(`event: test\n${lines}\n`)
  })

  test.each([
    ['event', 'test\nevent'],
    ['event', 'test\revent'],
    ['id', 'test\nid'],
    ['id', 'test\rid'],
  ])('throws when %s contains a line break: %j', (field, value) => {
    expect(() => Sse.encode({ data: 'test', [field]: value })).toThrow(Sse.InvalidInputError)
  })

  test('fails the stream for an invalid message', async () => {
    await expect(encodeMessages([{ data: 'a' }, { event: 'a\nb', data: 'b' }])).rejects.toThrow(
      Sse.InvalidInputError,
    )
  })
})

describe('better-sse EventBuffer', () => {
  test('writes an event type', () => {
    expect(Sse.encode({ event: 'test' })).toBe('event: test\n\n')
  })

  test('writes data as given; serializing is up to the caller', () => {
    expect(Sse.encode({ data: JSON.stringify({ hello: 'world' }) })).toBe(
      'data: {"hello":"world"}\n\n',
    )
  })

  test('writes an id', () => {
    expect(Sse.encode({ id: '12345678' })).toBe('id: 12345678\n\n')
  })

  test('writes a retry time', () => {
    expect(Sse.encode({ retry: 8000 })).toBe('retry: 8000\n\n')
  })

  test('writes a comment, with no blank line after it', () => {
    expect(Sse.encode({ comment: 'test' })).toBe(': test\n')
  })

  test('writes an empty comment', () => {
    expect(Sse.encode({ comment: '' })).toBe(':\n')
  })

  test('writes nothing for an empty message', () => {
    expect(Sse.encode({})).toBe('')
  })

  test('writes every field of one message', () => {
    expect(
      Sse.encode({ comment: 'c', event: 'test-type', data: 'test-data', id: 'test-id', retry: 1 }),
    ).toBe(': c\nevent: test-type\ndata: test-data\nid: test-id\nretry: 1\n\n')
  })

  test('keeps a trailing line break in data', () => {
    expect(Sse.decode(Sse.encode({ data: '123456\n' }))[0]?.data).toBe('123456\n')
  })

  test('writes a multi-line comment as several comment lines', () => {
    expect(Sse.encode({ comment: 'a\r\nb\rc' })).toBe(': a\n: b\n: c\n')
  })
})

describe('encode', () => {
  test('throws for an id containing NUL, which clients would ignore', () => {
    expect(() => Sse.encode({ id: 'a\0b' })).toThrow(Sse.InvalidInputError)
  })

  test.each([-1, 1.5, NaN, Infinity])('throws for retry %s', (retry) => {
    expect(() => Sse.encode({ data: 'x', retry })).toThrow(Sse.InvalidInputError)
  })

  test('the error is named after the package', () => {
    expect(() => Sse.encode({ event: '\n' })).toThrow(
      expect.objectContaining({ name: 'Sse.InvalidInputError' }),
    )
  })

  test('a decoded event encodes back to the same event', () => {
    const events = Sse.decode(
      'event: a\ndata: 1\ndata:\ndata: 3\nid: x\nretry: 5\n\ndata: \r\n\r\n: c\nid\ndata: é😀\n\n',
    )
    expect(events).toHaveLength(3)
    expect(Sse.decode(events.map(Sse.encode).join(''))).toEqual(events)
  })

  test.each(['', '\n', '\n\n', 'a\n', '\na', '\r', ' leading space', '\r\n\r\n'])(
    'data %j survives a round trip',
    (data) => {
      expect(Sse.decode(Sse.encode({ data }))).toEqual([
        { event: 'message', data: data.replace(/\r\n|\r/g, '\n'), id: undefined, retry: undefined },
      ])
    },
  )

  test('the signal fails the stream with its reason and cancels the source', async () => {
    const controller = new AbortController()
    let cancelled: unknown
    const source = new ReadableStream<Sse.Message>({
      pull: (c) => c.enqueue({ comment: 'ping' }),
      cancel: (reason) => {
        cancelled = reason
      },
    })
    const reader = source
      .pipeThrough(new Sse.EncoderStream({ signal: controller.signal }))
      .getReader()
    await reader.read()
    const reason = new Error('stop')
    controller.abort(reason)
    await expect(reader.read()).rejects.toBe(reason)
    expect(cancelled).toBe(reason)
  })

  test('EncoderStream output is a valid Response body', async () => {
    const body = Streams.fromIterable<Sse.Message>([
      { comment: 'keep-alive' },
      { data: 'hello', id: '1' },
    ]).pipeThrough(new Sse.EncoderStream())
    const response = new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    expect(await response.text()).toBe(': keep-alive\ndata: hello\nid: 1\n\n')
  })
})

describe('known upstream issues', () => {
  test('better-sse #112: multi-line data becomes several data lines, not one broken line', () => {
    expect(Sse.decode(Sse.encode({ data: 'line 1\nline 2' }))[0]?.data).toBe('line 1\nline 2')
  })

  test('cancelling the output cancels the source, as hono’s onAbort reports', async () => {
    // The pipe cancels the source after `reader.cancel()` resolves, a tick later in some runtimes.
    let onCancel!: () => void
    const cancelled = new Promise<void>((resolve) => (onCancel = resolve))
    const source = new ReadableStream<Sse.Message>({
      pull: (c) => c.enqueue({ data: 'x' }),
      cancel: () => onCancel(),
    })
    const reader = source.pipeThrough(new Sse.EncoderStream()).getReader()
    await reader.read()
    await reader.cancel()
    await expect(cancelled).resolves.toBeUndefined()
  })
})
