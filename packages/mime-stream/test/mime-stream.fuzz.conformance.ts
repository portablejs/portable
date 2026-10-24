import { cuts, fc, fuzz, mutated, outcomeAsync, split } from '@portable/fuzz'
import * as MimeStream from '@portable/mime-stream'
import { fromIterable, toBytes } from '@portable/streams'
import { expect, test } from 'vite-plus/test'
import { binary, decode, fixture, latin1 } from './utils.js'

const errors = [
  MimeStream.MaxBoundaryLineBytesError,
  MimeStream.MaxHeaderBytesError,
  MimeStream.MaxPartsError,
]

const message = binary(
  [
    'Content-Type: multipart/mixed; boundary="outer"',
    '',
    'preamble',
    '--outer',
    'Content-Type: multipart/alternative; boundary=inner',
    '',
    '--inner',
    'Content-Type: text/plain',
    '',
    'tere',
    '--inner',
    'Content-Type: text/html',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    '<p>tere=',
    '</p>',
    '--inner--',
    '--outer',
    'Content-Type: message/rfc822',
    '',
    'Subject: inside',
    'Content-Type: multipart/mixed; boundary=x',
    '',
    '--x',
    '',
    'part',
    '--x--',
    '--outer--',
    'epilogue',
    '',
  ].join('\r\n'),
)

const mimeLike = fc
  .array(
    fc.oneof(
      { weight: 4, arbitrary: fc.constantFrom('a', ':', ' ', '=', ';', 'x', '"') },
      { weight: 3, arbitrary: fc.constantFrom('\r\n', '\n', '\r', '--', '--x', '--x--') },
      {
        weight: 2,
        arbitrary: fc.constantFrom(
          'Content-Type: multipart/mixed; boundary=x\r\n',
          'Content-Type: message/rfc822\r\n',
          'Content-Type: multipart/digest; boundary=x\r\n',
        ),
      },
    ),
    { maxLength: 30 },
  )
  .map((pieces) => binary(pieces.join('')))

/**
 * Joins adjacent chunks of the same type and part. Where the input is split changes where chunks
 * start and end, but not the joined result.
 */
function structure(chunks: readonly MimeStream.Chunk[]) {
  const joined = new Array<{ type: string; contentType: string; boundary?: string; text: string }>()
  const parts = new Array<MimeStream.Part>()
  for (const chunk of chunks) {
    const last = joined.at(-1)
    if (last && parts.at(-1) === chunk.part && last.type === chunk.type)
      last.text += latin1(chunk.bytes)
    else {
      parts.push(chunk.part)
      joined.push({
        type: chunk.type,
        contentType: chunk.part.contentType,
        ...(chunk.part.boundary === undefined ? {} : { boundary: chunk.part.boundary }),
        text: latin1(chunk.bytes),
      })
    }
  }
  return joined
}

const options = fc.record(
  {
    embedded: fc.boolean(),
    maxBoundaryLineBytes: fc.integer({ min: 1, max: 80 }),
    maxHeaderBytes: fc.integer({ min: 1, max: 200 }),
    maxParts: fc.integer({ min: 1, max: 10 }),
  },
  { requiredKeys: [] },
)

async function check(
  bytes: Uint8Array,
  at: readonly number[],
  options: MimeStream.DecoderStream.Options,
) {
  const read = async (input: Uint8Array | Uint8Array[]) => {
    const result = await outcomeAsync(errors, () => decode(input, options))
    if (!('value' in result)) return result
    const joined = latin1(new Uint8Array(result.value.flatMap((chunk) => [...chunk.bytes])))
    return { joined, structure: structure(result.value) }
  }
  const whole = await read(bytes)
  expect(await read(split(bytes, at))).toEqual(whole)
  expect('joined' in whole ? whole.joined : latin1(bytes)).toBe(latin1(bytes))
}

test('gives the same chunks however the input is split, and the chunks join back to it', async () => {
  await fuzz(fc.asyncProperty(fc.oneof(mimeLike, mutated(message)), cuts, options, check))
})

test('a mutated real message decodes only to chunks or documented errors', async () => {
  const torture = await fixture('mimetorture.eml')
  await fuzz(
    fc.asyncProperty(mutated(torture, { within: 4000 }), cuts, (bytes, at) =>
      check(bytes, at, { embedded: true }),
    ),
    { scale: 0.2 },
  )
})

test('EncoderStream writes the bytes DecoderStream read', async () => {
  await fuzz(
    fc.asyncProperty(fc.oneof(mimeLike, mutated(message)), cuts, async (bytes, at) => {
      const output = await toBytes(
        fromIterable(split(bytes, at))
          .pipeThrough(new MimeStream.DecoderStream({ embedded: true }))
          .pipeThrough(new MimeStream.EncoderStream()),
      )
      expect(latin1(output)).toBe(latin1(bytes))
    }),
  )
})

test('splitHeaders gives back every byte', async () => {
  await fuzz(
    fc.asyncProperty(fc.oneof(mimeLike, mutated(message)), cuts, async (bytes, at) => {
      const { headers, body } = await MimeStream.splitHeaders(fromIterable(split(bytes, at)))
      const rest = await toBytes(body)
      expect(latin1(headers) + latin1(rest)).toBe(latin1(bytes))
    }),
  )
})
