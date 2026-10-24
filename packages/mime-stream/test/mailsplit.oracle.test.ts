import { Readable } from 'node:stream'
import { Joiner, Splitter } from '@zone-eu/mailsplit'
import { describe, expect, test } from 'vite-plus/test'
import {
  binary,
  bodies,
  contentTypes,
  decode,
  fixture,
  fixtureNames,
  latin1,
  randomChunks,
  roundTrip,
} from './utils.js'

type Result = { types: string[]; bodies: string[] }

async function viaMailsplit(chunks: readonly Uint8Array[], embedded: boolean): Promise<Result> {
  const splitter = new Splitter(
    embedded ? { defaultInlineEmbedded: true } : { ignoreEmbedded: true },
  )
  const types = new Array<string>()
  const nodes = new Array<unknown>()
  const text = new Map<unknown, string>()
  for await (const data of Readable.from(chunks.map((chunk) => Buffer.from(chunk))).pipe(
    splitter,
  )) {
    if (data.type === 'node') {
      types.push(data.contentType || '')
      if (!data.multipart) nodes.push(data)
    } else if (data.type === 'body')
      text.set(data.node, (text.get(data.node) ?? '') + data.value.toString('latin1'))
  }
  return { types, bodies: nodes.map((node) => text.get(node) ?? '') }
}

async function joinedByMailsplit(chunks: readonly Uint8Array[]): Promise<string> {
  const parts = new Array<Buffer>()
  for await (const part of Readable.from(chunks.map((chunk) => Buffer.from(chunk)))
    .pipe(new Splitter())
    .pipe(new Joiner()))
    parts.push(part)
  return Buffer.concat(parts).toString('latin1')
}

async function viaMimeStream(chunks: readonly Uint8Array[], embedded: boolean): Promise<Result> {
  const parts = await decode(chunks, { embedded })
  return { types: contentTypes(parts), bodies: bodies(parts) }
}

/**
 * Random messages inside the RFC 2046 grammar where mailsplit and this package agree: every body
 * has text, delimiters have no trailing whitespace, and embedded messages are inline.
 */
function generate(seed: number): string {
  let state = seed
  const random = (n: number) => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return Math.floor((state / 2 ** 31) * n)
  }
  const pick = <value>(items: readonly value[]): value => items[random(items.length)]!
  let count = 0
  const line = () =>
    pick(['hello world', '--', '-x', 'AAECAwQFBg==', 'x'.repeat(100), '--b1xy', 'õäöü', ''])
  const body = (eol: string) => {
    let text = 'start'
    for (let i = random(6); i > 0; i--) text += eol + line()
    return text + pick(['', eol])
  }
  const part = (depth: number): string => {
    const eol = pick(['\r\n', '\n'])
    const kind = depth > 2 ? 0 : random(3)
    if (kind === 1) {
      const boundary = `b${++count}${pick(['', 'x', '=_p'])}`
      let text = `Content-Type: multipart/${pick(['mixed', 'related'])};${eol} boundary="${boundary}"${eol}${eol}`
      text += pick(['', `preamble${eol}`])
      for (let i = 1 + random(3); i > 0; i--) text += `--${boundary}${eol}${part(depth + 1)}${eol}`
      return text + `--${boundary}--${eol}` + pick(['', `epilogue${eol}`])
    }
    if (kind === 2)
      return `Content-Type: message/rfc822${eol}Content-Disposition: inline${eol}${eol}${part(depth + 1)}`
    return `Content-Type: text/plain${eol}Subject: ${seed}${eol}${eol}${body(eol)}`
  }
  return part(0)
}

const inputs = async () => {
  const result = new Array<[string, Uint8Array]>()
  for (const name of fixtureNames) result.push([name, await fixture(name)])
  for (let seed = 1; seed <= 60; seed++) result.push([`generated ${seed}`, binary(generate(seed))])
  return result
}

describe('matches mailsplit', async () => {
  for (const [name, bytes] of await inputs()) {
    test(`${name}: same parts and bodies at random chunking`, async () => {
      for (const embedded of [false, true]) {
        const expected = await viaMailsplit([bytes], embedded)
        for (const seed of [1, 2]) {
          const chunks = randomChunks(bytes, seed)
          expect(await viaMimeStream(chunks, embedded)).toEqual(expected)
          expect(await viaMailsplit(chunks, embedded)).toEqual(expected)
        }
      }
    })

    test(`${name}: same bytes after a round trip`, async () => {
      const chunks = randomChunks(bytes, 5)
      expect(latin1(await roundTrip(chunks))).toBe(await joinedByMailsplit(chunks))
    })
  }
})

describe('differs from mailsplit on purpose', () => {
  test('keeps a part that has only headers when the next delimiter follows', async () => {
    const message =
      'Content-Type: multipart/mixed; boundary=B\r\n\r\n--B\r\nX-Only: headers\r\n--B\r\n\r\nbody\r\n--B--\r\n'
    expect(await joinedByMailsplit([binary(message)])).not.toContain('X-Only')
    expect(latin1(await roundTrip(message))).toBe(message)
    expect(contentTypes(await decode(message))).toEqual([
      'multipart/mixed',
      'text/plain',
      'text/plain',
    ])
  })

  test('reads a delimiter followed by whitespace', async () => {
    const message = 'Content-Type: multipart/mixed; boundary=B\r\n\r\n--B \r\n\r\none\r\n--B--\r\n'
    expect((await viaMailsplit([binary(message)], false)).types).toEqual(['multipart/mixed'])
    expect(await viaMimeStream([binary(message)], false)).toEqual({
      types: ['multipart/mixed', 'text/plain'],
      bodies: ['one'],
    })
  })

  test('does not guess a content type from the file name', async () => {
    const message = 'Content-Disposition: attachment; filename=photo.jpg\r\n\r\n'
    expect((await viaMailsplit([binary(message)], false)).types).toEqual(['image/jpeg'])
    expect((await viaMimeStream([binary(message)], false)).types).toEqual(['text/plain'])
  })

  test('reads an embedded message whatever its Content-Disposition', async () => {
    const message =
      'Content-Type: message/rfc822\r\nContent-Disposition: attachment\r\n\r\nSubject: inner\r\n\r\nbody'
    expect((await viaMailsplit([binary(message)], true)).types).toEqual(['message/rfc822'])
    expect((await viaMimeStream([binary(message)], true)).types).toEqual([
      'message/rfc822',
      'text/plain',
    ])
  })
})
