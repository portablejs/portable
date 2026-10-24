import * as Webhooks from '@portable/webhooks'
import { fc, fuzz, outcomeAsync } from '@portable/fuzz'
import { expect, test } from 'vite-plus/test'

const schemes = [
  Webhooks.standard,
  Webhooks.stripe,
  Webhooks.github,
  Webhooks.slack,
] satisfies readonly Webhooks.Scheme[]
const scheme = fc.constantFrom(...schemes)
const secret = fc.uint8Array({ minLength: 1, maxLength: 64 })
const body = fc.oneof(fc.string({ unit: 'grapheme' }), fc.uint8Array())
const now = new Date('2026-10-18T12:00:00Z')
const timestamp = fc
  .integer({ min: -300, max: 300 })
  .map((skew) => new Date(now.getTime() + skew * 1000))
const id = fc.stringMatching(/^[A-Za-z0-9_-]{1,40}$/)

test('verify accepts what sign signed, for every scheme', async () => {
  await fuzz(
    fc.asyncProperty(scheme, secret, body, timestamp, id, async (scheme, secret, body, at, id) => {
      const headers = await Webhooks.sign(body, { scheme, secret, now: at, id })
      const result = await Webhooks.verify({ headers, body }, { scheme, secret, now })
      const text = typeof body === 'string' ? body : new TextDecoder().decode(body)
      expect(result.body).toBe(text)
    }),
  )
})

const headerText = fc.string({
  unit: fc.oneof(
    fc.constantFrom('v1,', 'v1=', 'v0=', 'sha256=', 't=', ',', ' ', '=', '0', 'f', 'A', '/', '+'),
    fc
      .string({ unit: 'binary-ascii', minLength: 1, maxLength: 1 })
      .filter((char) => !/[\0\r\n]/.test(char)),
  ),
  maxLength: 120,
})

test('verify rejects only with VerificationError when the headers are changed', async () => {
  await fuzz(
    fc.asyncProperty(
      scheme,
      secret,
      body,
      fc.array(fc.tuple(fc.nat(), headerText), { minLength: 1, maxLength: 3 }),
      async (scheme, secret, body, edits) => {
        const headers = await Webhooks.sign(body, { scheme, secret, now })
        const names = Object.keys(headers)
        for (const [at, value] of edits) {
          const name = names[at % names.length]!
          headers[name] = at % 3 === 0 ? headers[name]! + value : value
        }
        await outcomeAsync([Webhooks.VerificationError], () =>
          Webhooks.verify({ headers, body }, { scheme, secret, now }),
        )
      },
    ),
  )
})
