import { Readable } from 'node:stream'
import * as Mail from '@portable/mail'
import * as QuotedPrintable from '@portable/quoted-printable'
import * as Streams from '@portable/streams'
import MailComposer from 'nodemailer/lib/mail-composer'
import { describe, expect, test } from 'vite-plus/test'
import { boundary, fixed } from './utils.js'

// Compares Mail.encodeStream with nodemailer 10.1.2's MailComposer on generated messages. nodemailer's
// boundary is `--_NmP-<baseBoundary>-Part_<n>`, so baseBoundary 'test' gives the boundary these
// tests pass to Mail.encodeStream. The generator avoids the differences listed in PARITY.md.
// libqp may break a quoted-printable line that already fits, so quoted-printable bodies are
// compared by the bytes they decode to. nodemailer never writes a Buffer text body as 7bit, so a
// Uint8Array text body here is passed to nodemailer as the string it holds.

type Tree = { head: string; body: string; parts: Tree[] }

function parse(raw: string): Tree {
  const end = raw.indexOf('\r\n\r\n')
  const head = end < 0 ? raw : raw.slice(0, end)
  const body = end < 0 ? '' : raw.slice(end + 4)
  const id = /boundary="([^"]+)"/.exec(head)?.[1]
  if (id === undefined) {
    return { head, body, parts: [] }
  }
  const close = body.lastIndexOf('\r\n--' + id + '--')
  const parts = body
    .slice(0, close)
    .split('--' + id + '\r\n')
    .slice(1)
    .map((part) => parse(part.replace(/\r\n$/, '')))
  return { head, body: '', parts }
}

function normalize(tree: Tree): Tree {
  const body = /^Content-Transfer-Encoding: quoted-printable$/m.test(tree.head)
    ? [...QuotedPrintable.decode(tree.body.replace(/\r\n$/, ''))].join(',')
    : tree.body.replace(/\r\n$/, '')
  return { head: tree.head, body, parts: tree.parts.map(normalize) }
}

const random = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}
type Next = () => number
const pick = <value>(next: Next, items: readonly value[]): value =>
  items[Math.floor(next() * items.length)]!

const words: Record<string, readonly string[]> = {
  ascii: ['tere', 'hello', 'world', 'mail', 'test', 'a.b', 'x-y', 'Mari', 'Ants'],
  latin: ['Jõgeva', 'Ärni', 'öö', 'naïve', 'Straße', 'café'],
  cjk: ['こんにちは', '世界', '漢字', '테스트'],
  emoji: ['👮', '🎉', '✉️'],
}

function phrase(next: Next, count: number, kinds: readonly string[]): string {
  return Array.from({ length: count }, () => pick(next, words[pick(next, kinds)]!)).join(' ')
}

function text(next: Next): string {
  const lines = Array.from({ length: 1 + Math.floor(next() * 6) }, () => {
    const kinds = pick(next, [['ascii'], ['ascii', 'latin'], ['cjk'], ['ascii', 'emoji']])
    return phrase(next, 1 + Math.floor(next() * (next() < 0.2 ? 30 : 8)), kinds)
  })
  return lines.join('\r\n') + (next() < 0.5 ? '\r\n' : '')
}

function chunks(next: Next, bytes: Uint8Array): Uint8Array[] {
  const result: Uint8Array[] = []
  for (let i = 0; i < bytes.length;) {
    const size = 1 + Math.floor(next() * 200)
    result.push(bytes.slice(i, i + size))
    i += size
  }
  return result
}

type Body = { ours: Mail.Content; theirs: string | Readable }

function content(next: Next, value: string, streams: boolean): Body {
  const bytes = new TextEncoder().encode(value)
  const shape = streams
    ? pick(next, ['string', 'bytes', 'stream'])
    : pick(next, ['string', 'bytes'])
  if (shape === 'string') {
    return { ours: value, theirs: value }
  }
  if (shape === 'bytes') {
    return { ours: bytes, theirs: value }
  }
  const parts = chunks(next, bytes)
  return {
    ours: Streams.fromIterable(parts),
    theirs: Readable.from(parts.map((part) => Buffer.from(part))),
  }
}

function mailbox(next: Next, i: number) {
  const address = `user${i}@${pick(next, ['example.com', 'EXAMPLE.org', 'mail.example.net'])}`
  if (next() < 0.3) {
    return { ours: address, theirs: address }
  }
  const name = phrase(next, 1 + Math.floor(next() * 2), pick(next, [['ascii'], ['latin'], ['cjk']]))
  return { ours: { name, address }, theirs: { name, address } }
}

function message(next: Next) {
  const ours: Record<string, unknown> = { ...fixed }
  const theirs: Record<string, unknown> = { ...fixed, baseBoundary: 'test' }
  for (const field of ['from', 'sender', 'to', 'cc', 'bcc', 'replyTo']) {
    if (next() < 0.4) {
      continue
    }
    const list = Array.from({ length: field === 'from' ? 1 : 1 + Math.floor(next() * 3) }, (_, i) =>
      mailbox(next, i),
    )
    ours[field] = list.map((entry) => entry.ours)
    theirs[field] = list.map((entry) => entry.theirs)
  }
  if (next() < 0.8) {
    const subject = phrase(
      next,
      1 + Math.floor(next() * 12),
      pick(next, [['ascii'], ['ascii', 'latin'], ['cjk'], ['emoji', 'ascii']]),
    )
    ours.subject = subject
    theirs.subject = subject
  }
  if (next() < 0.3) {
    ours.inReplyTo = theirs.inReplyTo = '<parent@example.com>'
    ours.references = theirs.references = '<root@example.com> <parent@example.com>'
  }
  if (next() < 0.3) {
    const headers = { 'X-Campaign': phrase(next, 3, ['ascii', 'latin']) }
    ours.headers = headers
    theirs.headers = headers
  }
  for (const field of ['text', 'amp', 'html']) {
    if (next() < (field === 'amp' ? 0.8 : 0.3)) {
      continue
    }
    const value = field === 'text' ? text(next) : `<p>${text(next)}</p>`
    const body = content(next, value, true)
    ours[field] = body.ours
    theirs[field] = body.theirs
  }
  const attachments = Array.from({ length: Math.floor(next() * 4) }, (_, i) => {
    const bytes = new Uint8Array(Math.floor(next() * 3000)).map(() => Math.floor(next() * 256))
    const filename =
      next() < 0.8 ? `${pick(next, ['file', 'pilt', 'Jõgeva', 'report 2024'])}-${i}.bin` : undefined
    const contentType = pick(next, ['application/octet-stream', 'image/png', 'application/pdf'])
    const cid = next() < 0.3 ? `img${i}@example.com` : undefined
    const parts = chunks(next, bytes)
    const shape = pick(next, ['bytes', 'stream'])
    return {
      ours: {
        content: shape === 'bytes' ? bytes : Streams.fromIterable(parts),
        ...(filename === undefined ? {} : { filename }),
        contentType,
        ...(cid === undefined ? {} : { cid }),
      },
      theirs: {
        content:
          shape === 'bytes'
            ? Buffer.from(bytes)
            : Readable.from(parts.map((part) => Buffer.from(part))),
        ...(filename === undefined ? { filename: false } : { filename }),
        contentType,
        ...(cid === undefined ? {} : { cid }),
      },
    }
  })
  if (attachments.length > 0) {
    ours.attachments = attachments.map((entry) => entry.ours)
    theirs.attachments = attachments.map((entry) => entry.theirs)
  }
  return { ours: ours as Mail.Message, theirs }
}

async function upstream(data: Record<string, unknown>): Promise<string> {
  const buffer = await new MailComposer(data).compile().build()
  return buffer.toString('utf8')
}

const ours = (message: Mail.Message) => Streams.toText(Mail.encodeStream(message, { boundary }))

describe('Mail.encodeStream matches nodemailer MailComposer', () => {
  test('on 300 generated messages with randomly chunked streams', async () => {
    const next = random(42)
    let identical = 0
    for (let i = 0; i < 300; i++) {
      const generated = message(next)
      const [mine, theirs] = await Promise.all([ours(generated.ours), upstream(generated.theirs)])
      if (mine === theirs) {
        identical++
      }
      expect(normalize(parse(mine))).toEqual(normalize(parse(theirs)))
    }
    expect(identical).toBeGreaterThan(240)
  })
})
