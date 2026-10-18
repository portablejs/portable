import { Readable } from 'node:stream'
import * as Exports from '@portable/mail'
import * as Streams from '@portable/streams'
import MailComposer from 'nodemailer/lib/mail-composer'
import { describe, expect, test } from 'vite-plus/test'
import { chunked, randomBytes } from './utils.js'

// Vitest's module runner reads each imported binding through a getter on every call, which
// nodemailer, loaded by Node, doesn't pay. Copying the exports once measures the functions.
const { encode } = { ...Exports }
const upstream = 'nodemailer 10.1.2'
const date = new Date(Date.UTC(2024, 0, 2))

const small = {
  from: 'Mari Tamm <mari@example.com>',
  to: ['Jaan <jaan@example.com>', 'Jõgeva Ants <ants@example.com>'],
  subject: 'Tere! Kohtumine homme kell 10 ☕',
  messageId: '<id@example.com>',
  date,
  text: 'Tere,\n\n' + 'kohtume homme kell kümme kontoris. '.repeat(20),
  html: '<p>Tere,</p><p>' + 'kohtume homme kell kümme kontoris. '.repeat(20) + '</p>',
}

const attachmentBytes = randomBytes(1 << 20, 5)
const streamChunks = chunked(randomBytes(4 << 20, 6), 65_536)

const build = (data: object) => new MailComposer(data as never).compile().build()

describe('@portable/mail compared with nodemailer MailComposer', () => {
  test('100 text and HTML messages', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/mail', async () => {
        for (let i = 0; i < 100; i++) await Streams.toBytes(encode(small))
      }),
      bench(upstream, async () => {
        for (let i = 0; i < 100; i++) await build(small)
      }),
    )
    expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/mail'), { delta: 0.25 })
  })

  test('a message with a 1 MB attachment in memory', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/mail', async () => {
        await Streams.toBytes(encode({ ...small, attachments: [{ content: attachmentBytes }] }))
      }),
      bench(upstream, async () => {
        await build({ ...small, attachments: [{ content: Buffer.from(attachmentBytes) }] })
      }),
    )
    expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/mail'), { delta: 0.25 })
  })

  test('a message with a 4 MB attachment read from a stream', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/mail', async () => {
        const content = Streams.fromIterable(streamChunks)
        await Streams.toBytes(encode({ ...small, attachments: [{ content }] }))
      }),
      bench(upstream, async () => {
        const content = Readable.from(streamChunks.map((chunk) => Buffer.from(chunk)))
        await build({ ...small, attachments: [{ content }] })
      }),
    )
    expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/mail'), { delta: 0.25 })
  })
})
