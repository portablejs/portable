import * as Base64 from '@portable/base64'
import * as Mail from '@portable/mail'
import * as QuotedPrintable from '@portable/quoted-printable'
import * as Streams from '@portable/streams'
import { describe, expect, test } from 'vite-plus/test'
import {
  bodyOf,
  boundary,
  chunked,
  compose,
  fixed,
  partsOf,
  randomBytes,
  slowStream,
} from './utils.js'

function tracked(chunks: readonly Uint8Array[]) {
  const state = { cancelled: undefined as unknown, pulls: 0 }
  let i = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      state.pulls++
      if (i < chunks.length) controller.enqueue(chunks[i++]!)
      else controller.close()
    },
    cancel(reason) {
      state.cancelled = reason ?? 'cancelled'
    },
  })
  return { stream, state }
}

describe('streaming', () => {
  test('a 1 MB attachment read slowly in odd chunks encodes to the same base64', async () => {
    const bytes = randomBytes(1 << 20, 7)
    const raw = await compose({ attachments: [{ content: slowStream(chunked(bytes, 4093)) }] })
    expect(bodyOf(raw).replace(/\r\n/g, '')).toBe(Base64.encode(bytes))
    expect(
      bodyOf(raw)
        .split('\r\n')
        .slice(0, -2)
        .every((line) => line.length === 76),
    ).toBe(true)
  })

  test('a 1 MB attachment as quoted-printable decodes to the same bytes', async () => {
    const bytes = randomBytes(1 << 20, 11)
    const raw = await compose({
      attachments: [
        { content: slowStream(chunked(bytes, 4091)), transferEncoding: 'quoted-printable' },
      ],
    })
    const body = bodyOf(raw).replace(/\r\n$/, '')
    expect(body.split('\r\n').every((line) => line.length <= 76)).toBe(true)
    expect(Base64.encode(QuotedPrintable.decode(body))).toBe(Base64.encode(bytes))
  })

  test('the message is written while an attachment is still being read', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const content = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await gate
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.close()
      },
    })
    const reader = Mail.encodeStream(
      { ...fixed, text: 'first', attachments: [{ content }] },
      { boundary },
    ).getReader()
    const decoder = new TextDecoder()
    let head = ''
    while (!head.includes('first')) head += decoder.decode((await reader.read()).value)
    release()
    let rest = ''
    for (let result = await reader.read(); !result.done; result = await reader.read())
      rest += decoder.decode(result.value)
    expect(rest).toContain('AQID')
  })

  test('a zero-length stream gives an empty body', async () => {
    const raw = await compose({
      text: 'a',
      attachments: [{ content: Streams.fromIterable([]) }, { content: new Uint8Array(0) }],
    })
    expect(partsOf(raw, 1).slice(1).map(bodyOf)).toEqual(['', ''])
  })

  test('an error in a content stream errors the output and cancels the other streams', async () => {
    const failure = new Error('read failed')
    const failing = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(failure)
      },
    })
    const other = tracked([new Uint8Array([1])])
    const output = Mail.encodeStream({
      attachments: [{ content: failing }, { content: other.stream }],
    })
    await expect(Streams.toBytes(output)).rejects.toBe(failure)
    expect(other.state.cancelled).toBe(failure)
  })

  test('cancelling the output cancels every content stream', async () => {
    const reading = tracked(chunked(randomBytes(100_000, 3), 1000))
    const unread = tracked([new Uint8Array([1])])
    const reader = Mail.encodeStream({
      attachments: [{ content: reading.stream }, { content: unread.stream }],
    }).getReader()
    const decoder = new TextDecoder()
    let text = ''
    while (!text.includes('base64')) text += decoder.decode((await reader.read()).value)
    await reader.read()
    await reader.cancel('stop')
    expect(reading.state.cancelled).toBe('stop')
    expect(unread.state.cancelled).toBe('stop')
    expect(unread.state.pulls).toBeLessThanOrEqual(1)
  })

  test('cancelling before the first read cancels every content stream', async () => {
    const content = tracked([new Uint8Array([1])])
    await Mail.encodeStream({ text: content.stream }).cancel('stop')
    expect(content.state.cancelled).toBe('stop')
  })

  test('aborting the signal errors the output and cancels every content stream', async () => {
    const reading = tracked(chunked(randomBytes(100_000, 3), 1000))
    const unread = tracked([new Uint8Array([1])])
    const controller = new AbortController()
    const reader = Mail.encodeStream(
      { attachments: [{ content: reading.stream }, { content: unread.stream }] },
      { signal: controller.signal },
    ).getReader()
    const decoder = new TextDecoder()
    let text = ''
    while (!text.includes('base64')) text += decoder.decode((await reader.read()).value)
    await reader.read()
    const reason = new Error('stop')
    controller.abort(reason)
    await expect(reader.read()).rejects.toBe(reason)
    await expect.poll(() => reading.state.cancelled).toBe(reason)
    expect(unread.state.cancelled).toBe(reason)
  })

  test('an aborted signal errors the output before the first read', async () => {
    const content = tracked([new Uint8Array([1])])
    const reason = new Error('stop')
    const output = Mail.encodeStream(
      { text: content.stream },
      { signal: AbortSignal.abort(reason) },
    )
    await expect(Streams.toBytes(output)).rejects.toBe(reason)
    expect(content.state.cancelled).toBe(reason)
  })

  test('a signal that is never aborted changes nothing', async () => {
    const message = {
      from: 'a@example.com',
      text: 'tere',
      messageId: 'id@example.com',
      date: new Date(0),
    }
    const options = { boundary: '=_b_' }
    const signal = new AbortController().signal
    expect(await new Response(Mail.encodeStream(message, { ...options, signal })).text()).toBe(
      await new Response(Mail.encodeStream(message, options)).text(),
    )
  })

  test('a locked stream or one given twice throws', () => {
    const locked = new ReadableStream<Uint8Array>()
    locked.getReader()
    expect(() => Mail.encodeStream({ text: locked })).toThrow(TypeError)
    const twice = new ReadableStream<Uint8Array>()
    expect(() => Mail.encodeStream({ text: twice, attachments: [{ content: twice }] })).toThrow(
      TypeError,
    )
  })

  test('the output can be encoded again from the same Blob', async () => {
    const blob = new Blob(['tere'])
    expect(await compose({ attachments: [{ content: blob }] })).toBe(
      await compose({ attachments: [{ content: blob }] }),
    )
  })
})
