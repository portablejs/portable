import { Readable } from 'node:stream'
import { Joiner, Splitter } from '@zone-eu/mailsplit'
import { expect, test } from 'vite-plus/test'
import * as MimeStream from '@portable/mime-stream'
import { binary, chunked, fixture, latin1 } from './utils.js'

const image = Uint8Array.from({ length: 1024 * 1024 }, (_, i) => (i * 31 + (i >> 8)) % 256)
const text = (await Promise.all(['message.eml', 'mimetorture.eml', 'source1.eml'].map(fixture)))
  .map(latin1)
  .join('\r\n')
const message = binary(
  'From: a@example.com\r\nContent-Type: multipart/mixed; boundary="=_outer"\r\n\r\n' +
    '--=_outer\r\nContent-Type: message/rfc822\r\n\r\n' +
    text +
    '\r\n--=_outer\r\nContent-Type: image/jpeg\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
    btoa(latin1(image)).replace(/.{76}/g, '$&\r\n') +
    '\r\n--=_outer--\r\n',
)
const chunks = chunked(message, 16384)

function drain<chunk>(stream: ReadableStream<chunk>): Promise<void> {
  const reader = stream.getReader()
  const next = (): Promise<void> => reader.read().then((r) => (r.done ? undefined : next()))
  return next()
}

function source(): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]!)
      } else {
        controller.close()
      }
    },
  })
}

test('splits and joins 1.5 MB of mail within 25% of mailsplit', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/mime-stream', async () => {
      await drain(
        source()
          .pipeThrough(new MimeStream.DecoderStream())
          .pipeThrough(new MimeStream.EncoderStream()),
      )
    }),
    bench('mailsplit', async () => {
      for await (const _ of Readable.from(chunks).pipe(new Splitter()).pipe(new Joiner())) {
      }
    }),
    bench('TransformStream (copy, for reference)', async () => {
      await drain(source().pipeThrough(new TransformStream()))
    }),
  )
  expect(result.get('mailsplit')).not.toBeFasterThan(result.get('@portable/mime-stream'), {
    delta: 0.25,
  })
})

test('reads the header block and body of 1.5 MB of mail within 25% of mailsplit', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/mime-stream splitHeaders', async () => {
      const { body } = await MimeStream.splitHeaders(source())
      await drain(body)
    }),
    bench('mailsplit with ignoreEmbedded', async () => {
      for await (const _ of Readable.from(chunks).pipe(new Splitter({ ignoreEmbedded: true }))) {
      }
    }),
  )
  expect(result.get('mailsplit with ignoreEmbedded')).not.toBeFasterThan(
    result.get('@portable/mime-stream splitHeaders'),
    { delta: 0.25 },
  )
})
