import { cuts, fc, fuzz, outcome, outcomeAsync, split } from '@portable/fuzz'
import * as Sse from '@portable/sse'
import { expect, test } from 'vite-plus/test'
import { decodeChunks, encodeMessages, utf8 } from './utils.js'

const text = (exclude?: RegExp) =>
  fc
    .string({
      unit: fc.oneof(
        { weight: 6, arbitrary: fc.constantFrom('a', ' ', ':', 'é', '😀', 'data', 'id') },
        { weight: 2, arbitrary: fc.constantFrom('\n', '\r', '\r\n', '\0') },
      ),
      maxLength: 12,
    })
    .map((value) => (exclude ? value.replace(exclude, '') : value))

const message: fc.Arbitrary<Sse.Message> = fc.record(
  {
    event: text(/[\r\n]/g),
    data: text(),
    id: text(/[\r\n\0]/g),
    retry: fc.nat(100_000),
    comment: text(),
  },
  { requiredKeys: [] },
)

/** The events a client dispatches for these messages, following the HTML event stream rules. */
function expected(messages: readonly Sse.Message[]): Sse.Event[] {
  const events: Sse.Event[] = []
  let id: string | undefined
  let retry: number | undefined
  for (const message of messages) {
    if (message.id !== undefined) id = message.id
    if (message.retry !== undefined) retry = message.retry
    if (message.data === undefined) continue
    events.push({
      event: message.event || 'message',
      data: message.data.replace(/\r\n|\r/g, '\n'),
      ...(id === undefined ? {} : { id }),
      ...(retry === undefined ? {} : { retry }),
    })
    retry = undefined
  }
  return events
}

test('decodes what EncoderStream writes, however the bytes are chunked', async () => {
  await fuzz(
    fc.asyncProperty(fc.array(message, { maxLength: 6 }), cuts, async (messages, at) => {
      const written = await encodeMessages(messages)
      expect(written).toBe(messages.map(Sse.encode).join(''))
      expect(await decodeChunks(split(utf8(written), at))).toEqual(expected(messages))
    }),
  )
})

const streamLike = fc.string({
  unit: fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom('data', 'event', 'id', 'retry', ':', ' ', '1', 'a') },
    {
      weight: 3,
      arbitrary: fc.constantFrom('\n', '\r', '\r\n', String.fromCharCode(0xfeff), '\0'),
    },
    { weight: 1, arbitrary: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }) },
  ),
  maxLength: 80,
})

test('decode and DecoderStream agree however the input is chunked', async () => {
  await fuzz(
    fc.asyncProperty(
      streamLike,
      cuts,
      fc.option(fc.nat(40), { nil: undefined }),
      fc.boolean(),
      async (input, at, maxLength, bytes) => {
        const errors = [Sse.MaxLengthError]
        const data = bytes ? utf8(input) : input
        const whole = outcome(errors, () => Sse.decode(data, { maxLength }))
        const chunked = await outcomeAsync(errors, () =>
          decodeChunks(split(data, at) as (string | Uint8Array)[], { maxLength }),
        )
        expect(chunked).toEqual(whole)
      },
    ),
  )
})
