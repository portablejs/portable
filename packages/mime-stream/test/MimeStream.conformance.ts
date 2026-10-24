import * as Errors from '@portable/errors'
import { describe, expect, test } from 'vite-plus/test'
import * as MimeStream from '@portable/mime-stream'
import { fromIterable, toArray, toBytes } from '@portable/streams'
import {
  binary,
  bodies,
  chunked,
  contentTypes,
  decode,
  fixture,
  fixtureNames,
  latin1,
  randomChunks,
  roundTrip,
  summary,
} from './utils.js'

/** Builds a random message from a seed: nested multiparts, embedded messages, mixed line breaks. */
function randomMessage(seed: number): string {
  let state = seed
  const random = (n: number) => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return Math.floor((state / 2 ** 31) * n)
  }
  const pick = <value>(items: readonly value[]): value => items[random(items.length)]!
  const words = ['hello', '--', '-', '\r', 'x'.repeat(80), '=?utf-8?Q?=C3=B5?=', 'õ', '--b1', '']
  let boundaries = 0
  const text = (eol: string) => {
    let result = ''
    for (let i = random(5); i > 0; i--) {
      for (let j = random(6); j > 0; j--) result += pick(words) + pick([' ', '', '\t'])
      result += eol
    }
    return result
  }
  const part = (depth: number): string => {
    const eol = pick(['\r\n', '\n'])
    const kind = depth > 2 ? 0 : random(4)
    if (kind === 1) {
      const boundary = `b${++boundaries}${pick(['', '-x', '=_part'])}`
      let result = `Content-Type: multipart/${pick(['mixed', 'alternative', 'digest'])}; boundary="${boundary}"${eol}${eol}`
      result += text(eol)
      for (let i = random(4); i > 0; i--)
        result += `--${boundary}${pick(['', ' ', '\t  '])}${eol}${part(depth + 1)}${eol}`
      if (random(4) > 0) result += `--${boundary}--${pick(['', ' '])}${eol}${text(eol)}`
      return result
    }
    if (kind === 2) return `Content-Type: message/rfc822${eol}${eol}${part(depth + 1)}`
    return `Subject: ${text('').trim()}${eol}X-Seed: ${seed}${eol}${pick([eol, ''])}${text(eol)}`
  }
  return part(0)
}

describe('round trip', () => {
  for (const name of fixtureNames) {
    test(`writes ${name} back byte for byte at any chunking`, async () => {
      const bytes = await fixture(name)
      for (const embedded of [false, true]) {
        const whole = summary(await decode(bytes, { embedded }))
        for (const seed of [1, 2, 3]) {
          const chunks = randomChunks(bytes, seed)
          expect(await roundTrip(chunks, { embedded })).toEqual(bytes)
          expect(summary(await decode(chunks, { embedded }))).toEqual(whole)
        }
      }
    })
  }

  test('writes random messages back byte for byte at any chunking', async () => {
    for (let seed = 1; seed <= 150; seed++) {
      const message = binary(randomMessage(seed))
      for (const embedded of [false, true]) {
        const whole = summary(await decode(message, { embedded }))
        expect(whole.map(([, text]) => text).join('')).toBe(latin1(message))
        const chunks = randomChunks(message, seed, 1 + (seed % 20))
        expect(summary(await decode(chunks, { embedded }))).toEqual(whole)
        expect(await roundTrip(chunks, { embedded })).toEqual(message)
      }
    }
  })
})

describe('DecoderStream', () => {
  test('gives DKIM the header block and the body bytes of the root', async () => {
    const message = await fixture('mimetorture.eml')
    const chunks = await decode(randomChunks(message, 9))
    const [root, ...rest] = chunks
    expect(root!.type).toBe('headers')
    const body = await toBytes(fromIterable(rest.map((chunk) => chunk.bytes)))
    expect(latin1(root!.bytes) + latin1(body)).toBe(latin1(message))
    expect(latin1(root!.bytes).endsWith('\n\n') || latin1(root!.bytes).endsWith('\r\n\r\n')).toBe(
      true,
    )
  })

  test('reads a delimiter followed by whitespace (RFC 2046 transport padding)', async () => {
    const message =
      'Content-Type: multipart/mixed; boundary=B\r\n\r\n--B \t\r\n\r\none\r\n--B   \r\n\r\ntwo\r\n--B-- \r\n'
    const chunks = await decode(message)
    expect(bodies(chunks)).toEqual(['one', 'two'])
    expect(summary(chunks).filter(([type]) => type === 'delimiter')).toEqual([
      ['delimiter', '--B \t\r\n'],
      ['delimiter', '\r\n--B   \r\n'],
      ['delimiter', '\r\n--B-- \r\n'],
    ])
  })

  test('fails on a boundary line over maxBoundaryLineBytes', async () => {
    const message = `Content-Type: multipart/mixed; boundary=B\r\n\r\n--B${' '.repeat(100)}\r\n\r\nx`
    const error = await decode(message, { maxBoundaryLineBytes: 50 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(MimeStream.MaxBoundaryLineBytesError)
    expect(error).toMatchObject({ maxBoundaryLineBytes: 50 })
    await expect(decode(chunked(binary(message), 3), { maxBoundaryLineBytes: 50 })).rejects.toThrow(
      MimeStream.MaxBoundaryLineBytesError,
    )
    expect(bodies(await decode(message, { maxBoundaryLineBytes: 200 }))).toEqual(['x'])
  })

  test('streams long lines that start like a delimiter', async () => {
    const line = '--B' + 'x'.repeat(100000)
    const message = `Content-Type: multipart/mixed; boundary=B\r\n\r\n--B\r\n\r\n${line}\r\n--B--`
    const chunks = await decode(chunked(binary(message), 1000), { maxBoundaryLineBytes: 100 })
    expect(bodies(chunks)).toEqual([line])
    expect(chunks.filter((chunk) => chunk.type === 'body').length).toBeGreaterThan(10)
  })

  test('has no size limits by default', async () => {
    const header = `X-Long: ${'a'.repeat(2 * 1024 * 1024)}\r\n`
    const parts = Array.from({ length: 1500 }, () => '--B\r\n\r\nx\r\n').join('')
    const message = `Content-Type: multipart/mixed; boundary=B\r\n${header}\r\n${parts}--B${' '.repeat(2000)}--`
    const chunks = await decode(message)
    expect(chunks[0]!.part.headers).toHaveLength(2)
    expect(bodies(chunks)).toHaveLength(1500)
  })

  test('tells a boundary from a longer boundary that starts with it', async () => {
    const message =
      'Content-Type: multipart/mixed; boundary==_a\n\n--=_a\n' +
      'Content-Type: multipart/alternative; boundary="=_a_b"\n\n--=_a_b\n\ninner\n--=_a_b--\n--=_a\n\nouter\n--=_a--\n'
    const chunks = await decode(message)
    expect(contentTypes(chunks)).toEqual([
      'multipart/mixed',
      'multipart/alternative',
      'text/plain',
      'text/plain',
    ])
    expect(bodies(chunks)).toEqual(['inner', 'outer'])
  })

  test('labels the preamble, delimiters and epilogue of a multipart', async () => {
    const chunks = await decode(
      'Content-Type: multipart/mixed; boundary=B\n\nThis is a preamble.\n--B\n\nbody\n--B--\nepilogue\n',
    )
    expect(summary(chunks)).toEqual([
      ['headers', 'Content-Type: multipart/mixed; boundary=B\n\n'],
      ['preamble', 'This is a preamble.'],
      ['delimiter', '\n--B\n'],
      ['headers', '\n'],
      ['body', 'body'],
      ['delimiter', '\n--B--\n'],
      ['epilogue', 'epilogue\n'],
    ])
    expect(chunks[1]!.part).toBe(chunks[0]!.part)
    expect(chunks[6]!.part).toBe(chunks[0]!.part)
  })

  test('defaults the content type as RFC 2045 and RFC 2046 say', async () => {
    const chunks = await decode(
      'Content-Type: multipart/digest; boundary=D\n\n--D\n\nSubject: a\n\n--D\nContent-Type: text\n\n--D--\n',
    )
    expect(contentTypes(chunks)).toEqual(['multipart/digest', 'message/rfc822', 'message/rfc822'])
    const [plain] = await decode('Content-Type: invalid\n\n')
    expect(plain!.part).toMatchObject({ contentType: 'text/plain', encoding: '7bit' })
  })

  test('reads a multipart without a boundary as one body', async () => {
    const chunks = await decode('Content-Type: multipart/mixed\n\n--B\n\nbody\n--B--\n')
    expect(summary(chunks)).toEqual([
      ['headers', 'Content-Type: multipart/mixed\n\n'],
      ['body', '--B\n\nbody\n--B--\n'],
    ])
    expect(chunks[0]!.part.boundary).toBeUndefined()
  })

  test('uses the first Content-Type field', async () => {
    const [chunk] = await decode(
      'content-type: Text/HTML; charset=utf-8\nContent-Type: image/png\n\n',
    )
    expect(chunk!.part.contentType).toBe('text/html')
  })

  test('does not read a base64 message/rfc822 part as parts', async () => {
    const chunks = await decode(
      'Content-Type: message/rfc822\nContent-Transfer-Encoding: base64\n\nU3ViamVjdDogeA==',
      { embedded: true },
    )
    expect(summary(chunks)).toEqual([
      ['headers', 'Content-Type: message/rfc822\nContent-Transfer-Encoding: base64\n\n'],
      ['body', 'U3ViamVjdDogeA=='],
    ])
  })

  test('emits the root headers of an empty message', async () => {
    const chunks = await decode([])
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ type: 'headers', bytes: new Uint8Array() })
  })

  test('rejects chunks that are not bytes', async () => {
    const stream = fromIterable(['Subject: x\n\n'] as unknown as Uint8Array[])
    await expect(toArray(stream.pipeThrough(new MimeStream.DecoderStream()))).rejects.toThrow(
      TypeError,
    )
  })
})

describe('EncoderStream', () => {
  test('rejects input that is not bytes, text or a chunk', async () => {
    const stream = fromIterable([42] as unknown as MimeStream.EncoderStream.Input[])
    await expect(toBytes(stream.pipeThrough(new MimeStream.EncoderStream()))).rejects.toThrow(
      TypeError,
    )
  })

  test('replaces an attachment and keeps the rest of the message', async () => {
    const message = await fixture('source1.eml')
    const output = await toBytes(
      fromIterable(randomChunks(message, 4, 500))
        .pipeThrough(new MimeStream.DecoderStream())
        .pipeThrough(
          new TransformStream<MimeStream.Chunk, MimeStream.EncoderStream.Input>({
            transform(chunk, controller) {
              if (chunk.part.contentType !== 'image/png') controller.enqueue(chunk)
              else if (chunk.type === 'headers')
                controller.enqueue('Content-Type: text/plain\r\n\r\nImage removed.')
            },
          }),
        )
        .pipeThrough(new MimeStream.EncoderStream()),
    )
    const before = await decode(message)
    const after = await decode(output)
    expect(contentTypes(after)).toEqual(
      contentTypes(before).map((type) => (type === 'image/png' ? 'text/plain' : type)),
    )
    expect(contentTypes(before)).toContain('image/png')
    expect(bodies(after)).toContain('Image removed.')
  })
})

describe('splitHeaders', () => {
  test('returns the same header block as DecoderStream and the rest as the body', async () => {
    for (const name of fixtureNames) {
      const bytes = await fixture(name)
      const [root] = await decode(bytes)
      for (const seed of [1, 2]) {
        const { headers, body } = await MimeStream.splitHeaders(
          fromIterable(randomChunks(bytes, seed)),
        )
        expect(headers).toEqual(root!.bytes)
        expect(latin1(headers) + latin1(await toBytes(body))).toBe(latin1(bytes))
      }
    }
  })

  test('returns everything as the header block when no empty line follows', async () => {
    const { headers, body } = await MimeStream.splitHeaders(
      fromIterable([binary('Subject: a\r\n'), binary('To: b')]),
    )
    expect(latin1(headers)).toBe('Subject: a\r\nTo: b')
    expect(await toArray(body)).toEqual([])
  })

  test('reads an empty line at the start as an empty header block', async () => {
    const { headers, body } = await MimeStream.splitHeaders(fromIterable([binary('\r\nHello')]))
    expect(latin1(headers)).toBe('\r\n')
    expect(latin1(await toBytes(body))).toBe('Hello')
  })

  test('fails on a header block over maxHeaderBytes and cancels the input', async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(binary('X-Long: ' + 'a'.repeat(100)))
      },
      cancel() {
        cancelled = true
      },
    })
    const error = await MimeStream.splitHeaders(stream, { maxHeaderBytes: 1000 }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(MimeStream.MaxHeaderBytesError)
    expect(Errors.is(error, 'MaxBytes')).toBe(true)
    expect(error).toMatchObject({ maxBytes: 1000, maxHeaderBytes: 1000 })
    expect(cancelled).toBe(true)
    const exact = 'Subject: a\r\n\r\n'
    const { headers } = await MimeStream.splitHeaders(fromIterable([binary(exact)]), {
      maxHeaderBytes: exact.length,
    })
    expect(latin1(headers)).toBe(exact)
  })

  test('cancels the input when the body is cancelled', async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(binary('Subject: a\r\n\r\nbody'))
      },
      cancel() {
        cancelled = true
      },
    })
    const { body } = await MimeStream.splitHeaders(stream)
    await body.cancel()
    expect(cancelled).toBe(true)
  })
})
