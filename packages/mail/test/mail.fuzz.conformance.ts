import { cuts, fc, fuzz, split } from '@portable/fuzz'
import * as Mail from '@portable/mail'
import * as MimeHeaders from '@portable/mime-headers'
import { fromIterable } from '@portable/streams'
import { expect, test } from 'vite-plus/test'
import { compose, fixed, head } from './utils.js'

const text = fc.string({
  unit: fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom('a', ' ', 'tere', '.', '=', '?', '"', ',') },
    { weight: 2, arbitrary: fc.constantFrom('\n', '\r\n', '\r', '\t', 'õ', 'ß', '日本', '😀') },
    { weight: 1, arbitrary: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }) },
  ),
  maxLength: 120,
})

const name = fc.string({
  unit: fc.constantFrom('a', ' ', 'Õ', ',', '"', '<', '(', '@'),
  maxLength: 10,
})

const message = fc.record({
  from: name.map((name) => ({ name, address: 'mari@example.com' })),
  to: fc.array(
    name.map((name) => ({ name, address: 'jaan@example.org' })),
    { minLength: 1, maxLength: 3 },
  ),
  subject: text,
  text,
  html: fc.option(text, { nil: undefined }),
  attachments: fc.array(
    fc.record({
      content: fc.uint8Array({ maxLength: 300 }),
      filename: fc.option(
        text.filter((value) => value.trim() !== ''),
        { nil: undefined },
      ),
    }),
    { maxLength: 2 },
  ),
}) satisfies fc.Arbitrary<Mail.Message>

const unfolded = (raw: string, field: string) => {
  const header = MimeHeaders.parseHeaders(head(raw)).find((each) => each.name === field)
  return header?.value
}

test('writes CRLF lines of at most 998 bytes, and headers that decode back to the input', async () => {
  await fuzz(
    fc.asyncProperty(message, async (message) => {
      const raw = await compose(message)
      expect(raw.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
      for (const line of raw.split('\r\n'))
        expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(998)
      expect(MimeHeaders.decodeWords(unfolded(raw, 'Subject') ?? '').trim()).toBe(
        message.subject.replace(/\r\n|\r|\n/g, ' ').trim(),
      )
      expect(
        MimeHeaders.parseMailboxes(unfolded(raw, 'To') ?? '').map((mailbox) => mailbox.address),
      ).toEqual((message.to as { address: string }[]).map((to) => to.address))
    }),
  )
})

test('an attachment gives the same message as bytes, a Blob or a stream in any chunks', async () => {
  await fuzz(
    fc.asyncProperty(fc.uint8Array({ maxLength: 500 }), cuts, async (bytes, at) => {
      const as = (content: Mail.Content) =>
        compose({
          from: 'mari@example.com',
          attachments: [{ content, filename: 'a.bin' }],
          ...fixed,
        })
      const expected = await as(bytes)
      expect(await as(new Blob([bytes]))).toBe(expected)
      expect(await as(fromIterable(split(bytes, at)))).toBe(expected)
    }),
  )
})
