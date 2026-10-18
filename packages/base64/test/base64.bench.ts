import { Buffer } from 'node:buffer'
import { Readable, type Transform } from 'node:stream'
import base64js from 'base64-js'
import { Base64 as jsBase64 } from 'js-base64'
import * as libbase64 from 'libbase64'
import { expect, test } from 'vite-plus/test'
import { decode, DecoderStream, encode, EncoderStream } from '@portable/base64'
import { chunked, collect, fromChunks, randomBytes } from './utils.js'

const data = randomBytes(1024 * 1024, 1)
const buffer = Buffer.from(data)
const encoded = encode(data)
const mime = encode(data, { lineLength: 76 })
const small = randomBytes(32, 2)
const smallEncoded = encode(small)
const chunks = chunked(data, 16384)
const mimeChunks = chunked(Buffer.from(mime), 16384)

async function drain(transform: Transform, input: readonly Uint8Array[]): Promise<void> {
  for await (const _ of Readable.from(input).pipe(transform));
}

// libbase64 and Buffer encode and decode in C++, which JavaScript can't match on Node. They are
// measured for reference, and the 25% limit applies to the JavaScript libraries and to libbase64's
// line wrapping, which is JavaScript.
test('encodes 1 MB within 25% of base64-js, js-base64 and libbase64 wrapping', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/base64', () => {
      encode(data)
    }),
    bench('base64-js', () => {
      base64js.fromByteArray(data)
    }),
    bench('js-base64', () => {
      jsBase64.fromUint8Array(data)
    }),
    bench('libbase64', () => {
      libbase64.encode(buffer)
    }),
    bench('Buffer', () => {
      buffer.toString('base64')
    }),
    bench('@portable/base64, 76 columns', () => {
      encode(data, { lineLength: 76 })
    }),
    bench('libbase64, 76 columns', () => {
      libbase64.wrap(libbase64.encode(buffer), 76)
    }),
  )
  const ours = result.get('@portable/base64')
  expect(result.get('base64-js')).not.toBeFasterThan(ours, { delta: 0.25 })
  expect(result.get('js-base64')).not.toBeFasterThan(ours, { delta: 0.25 })
  expect(result.get('libbase64, 76 columns')).not.toBeFasterThan(
    result.get('@portable/base64, 76 columns'),
    { delta: 0.25 },
  )
})

test('encodes 32 bytes within 25% of base64-js and js-base64', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/base64', () => {
      encode(small)
    }),
    bench('base64-js', () => {
      base64js.fromByteArray(small)
    }),
    bench('js-base64', () => {
      jsBase64.fromUint8Array(small)
    }),
    bench('Buffer', () => {
      Buffer.from(small.buffer, small.byteOffset, small.length).toString('base64')
    }),
  )
  const ours = result.get('@portable/base64')
  expect(result.get('base64-js')).not.toBeFasterThan(ours, { delta: 0.25 })
  expect(result.get('js-base64')).not.toBeFasterThan(ours, { delta: 0.25 })
})

test('decodes 1 MB within 25% of base64-js and js-base64', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/base64', () => {
      decode(encoded)
    }),
    bench('base64-js', () => {
      base64js.toByteArray(encoded)
    }),
    bench('js-base64', () => {
      jsBase64.toUint8Array(encoded)
    }),
    bench('libbase64', () => {
      libbase64.decode(encoded)
    }),
    bench('Buffer', () => {
      Buffer.from(encoded, 'base64')
    }),
    bench('@portable/base64, 76 columns', () => {
      decode(mime)
    }),
    bench("@portable/base64, 76 columns, 'mime' mode", () => {
      decode(mime, { mode: 'mime' })
    }),
    bench('libbase64, 76 columns', () => {
      libbase64.decode(mime)
    }),
  )
  const ours = result.get('@portable/base64')
  expect(result.get('base64-js')).not.toBeFasterThan(ours, { delta: 0.25 })
  expect(result.get('js-base64')).not.toBeFasterThan(ours, { delta: 0.25 })
})

test('decodes 32 bytes within 25% of base64-js and js-base64', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/base64', () => {
      decode(smallEncoded)
    }),
    bench('base64-js', () => {
      base64js.toByteArray(smallEncoded)
    }),
    bench('js-base64', () => {
      jsBase64.toUint8Array(smallEncoded)
    }),
    bench('Buffer', () => {
      Buffer.from(smallEncoded, 'base64')
    }),
  )
  const ours = result.get('@portable/base64')
  expect(result.get('base64-js')).not.toBeFasterThan(ours, { delta: 0.25 })
  expect(result.get('js-base64')).not.toBeFasterThan(ours, { delta: 0.25 })
})

test('stream encodes 1 MB at 76 columns within 25% of libbase64', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/base64', async () => {
      await collect(fromChunks(chunks).pipeThrough(new EncoderStream({ lineLength: 76 })))
    }),
    bench('libbase64', async () => {
      await drain(new libbase64.Encoder({ lineLength: 76 }), chunks)
    }),
  )
  expect(result.get('libbase64')).not.toBeFasterThan(result.get('@portable/base64'), {
    delta: 0.25,
  })
})

test('stream decodes 1 MB at 76 columns within 25% of libbase64', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/base64', async () => {
      await collect(fromChunks(mimeChunks).pipeThrough(new DecoderStream({ mode: 'mime' })))
    }),
    bench('libbase64', async () => {
      await drain(new libbase64.Decoder(), mimeChunks)
    }),
  )
  expect(result.get('libbase64')).not.toBeFasterThan(result.get('@portable/base64'), {
    delta: 0.25,
  })
})
