import { cuts, fc, fuzz, outcomeAsync, split } from '@portable/fuzz'
import * as Smtp from '@portable/smtp'
import { fromIterable } from '@portable/streams'
import { expect, test } from 'vite-plus/test'
import { createReader } from '../src/reader.js'
import { encode } from './utils.js'

const replyLike = fc
  .array(
    fc.oneof(
      {
        weight: 4,
        arbitrary: fc.constantFrom('250', '220', '354', '550', '421', '2.0.0', '5.1.1'),
      },
      { weight: 4, arbitrary: fc.constantFrom(' ', '-', 'OK', 'x', 'õ', '\xff') },
      { weight: 3, arbitrary: fc.constantFrom('\r\n', '\n', '\r') },
    ),
    { maxLength: 30 },
  )
  .map((pieces) => pieces.join(''))

/** Reads replies until the input runs out, and returns them with the error that ended the reading. */
async function readAll(chunks: readonly Uint8Array[]) {
  const reader = createReader(fromIterable(chunks))
  const replies: unknown[] = []
  const end = await outcomeAsync([Smtp.CommandError], async () => {
    for (;;) {
      replies.push(await reader.read('NOOP'))
    }
  })
  return { replies, end }
}

test('reads the same replies however the bytes are chunked, and fails only with CommandError', async () => {
  await fuzz(
    fc.asyncProperty(replyLike, cuts, async (text, at) => {
      const bytes = Uint8Array.from(text, (character) => character.charCodeAt(0) & 0xff)
      expect(await readAll(split(bytes, at))).toEqual(await readAll([bytes]))
    }),
  )
})

test('reads a multiline reply as its lines', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.integer({ min: 200, max: 599 }),
      fc.array(fc.stringMatching(/^[ -~]{0,20}$/), { minLength: 1, maxLength: 5 }),
      cuts,
      async (code, lines, at) => {
        const text = lines
          .map((line, i) => `${code}${i === lines.length - 1 ? ' ' : '-'}${line}\r\n`)
          .join('')
        const reader = createReader(fromIterable(split(encode(text), at)))
        const reply = await reader.read('NOOP')
        expect(reply.code).toBe(code)
        expect(reply.lines).toEqual(lines)
      },
    ),
  )
})
