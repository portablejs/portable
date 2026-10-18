import { describe, expect, test } from 'vite-plus/test'
import * as Webhooks from '../index.js'
import { reasonOf, request } from './utils.js'

const scheme = 'github'
const secret = 'mysecret'
const payload = '{"foo":"bar"}'
const signature = 'sha256=4864d2759938a15468b5df9ade20bf161da9b4f737ea61794142f3484236bda3'

const verify = (
  header: string,
  options: Partial<Webhooks.verify.Options> = {},
  body: string | Uint8Array = payload,
) =>
  Webhooks.verify(
    { headers: { 'x-hub-signature-256': header }, body },
    { scheme, secret, ...options },
  )

describe('github', () => {
  test('signs the known vector', async () => {
    expect(await Webhooks.sign(payload, { scheme, secret })).toEqual({
      'x-hub-signature-256': signature,
    })
  })

  test('adds the delivery id when given one', async () => {
    expect(await Webhooks.sign(payload, { scheme, secret, id: 'abc' })).toEqual({
      'x-hub-signature-256': signature,
      'x-github-delivery': 'abc',
    })
  })

  test('verifies a correct signature', async () => {
    const result = await verify(signature)
    expect(result).toEqual({ body: payload, id: undefined, timestamp: undefined })
  })

  test('returns the delivery id', async () => {
    const headers = { 'x-hub-signature-256': signature, 'x-github-delivery': 'd-1' }
    const result = await Webhooks.verify(request(payload, headers), { scheme, secret })
    expect(result.id).toBe('d-1')
  })

  test('rejects a missing signature', async () => {
    expect(
      await reasonOf(Webhooks.verify({ headers: {}, body: payload }, { scheme, secret })),
    ).toBe('missing-header')
  })

  test('rejects a signature that is not sha256=<hex>', async () => {
    expect(await reasonOf(verify('foo'))).toBe('malformed-header')
    expect(await reasonOf(verify('sha256=zz'))).toBe('malformed-header')
    expect(await reasonOf(verify(signature.slice(7)))).toBe('malformed-header')
    expect(await reasonOf(verify(signature.slice(0, -2)))).toBe('malformed-header')
  })

  test('rejects an incorrect secret', async () => {
    expect(await reasonOf(verify(signature, { secret: 'foo' }))).toBe('signature')
  })

  test('verifies a payload with escape sequences and multi-byte characters (octokit/webhooks.js#71)', async () => {
    const options = { secret: 'development' }
    const esc = String.fromCharCode(27)
    const lower = JSON.stringify({
      foo: `Foo\n${esc}[34mbar: ♥♥♥♥♥♥♥♥\nthis-is-lost${esc}[0m${esc}[2K`,
    })
    const upper = lower.replaceAll('\\u001b', '\\u001B')
    const signed = 'sha256=afecc3caa27548bb90d51a50384cb2868b9a3327b4ad6a01c9bd4ed0f8b0b12c'
    expect((await verify(signed, options, upper)).body).toBe(upper)
    expect(await reasonOf(verify(signed, options, lower))).toBe('signature')
    const escaped = 'sha256=6f8326efbacfbd04e870cea25b5652e635be8c9807f2fd5348ef60753c9e96ed'
    const body = JSON.stringify({ foo: '\\u001b' })
    expect((await verify(escaped, options, body)).body).toBe(body)
  })

  test('accepts upper-case hex', async () => {
    expect((await verify(`sha256=${signature.slice(7).toUpperCase()}`)).body).toBe(payload)
  })

  test('accepts the payload if any of several secrets matches', async () => {
    expect((await verify(signature, { secret: [secret, 'foo'] })).body).toBe(payload)
    expect((await verify(signature, { secret: ['foo', secret] })).body).toBe(payload)
    expect(await reasonOf(verify(signature, { secret: ['foo', 'bar'] }))).toBe('signature')
  })

  test('ignores the timestamp options', async () => {
    expect((await verify(signature, { now: new Date(0), tolerance: 0 })).body).toBe(payload)
  })
})
