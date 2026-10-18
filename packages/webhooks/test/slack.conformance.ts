import { describe, expect, test } from 'vite-plus/test'
import * as Webhooks from '@portable/webhooks'
import { reasonOf, request } from './utils.js'

const scheme = 'slack'
const secret = 'secret'
const payload = '{"foo":"bar"}'

// The example request in https://docs.slack.dev/authentication/verifying-requests-from-slack
const example = {
  secret: '8f742231b10e8888abcd99yyyzzz85a5',
  body: 'token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c',
  headers: {
    'x-slack-request-timestamp': '1531420618',
    'x-slack-signature': 'v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503',
  },
  now: new Date(1531420618 * 1000),
}

const verify = (headers: Record<string, string>, options: Partial<Webhooks.verify.Options> = {}) =>
  Webhooks.verify({ headers, body: payload }, { scheme, secret, ...options })

describe('slack', () => {
  test('signs the documented example', async () => {
    expect(
      await Webhooks.sign(example.body, { scheme, secret: example.secret, timestamp: example.now }),
    ).toEqual(example.headers)
  })

  test('verifies the documented example', async () => {
    const result = await Webhooks.verify(request(example.body, example.headers), {
      scheme,
      secret: example.secret,
      now: example.now,
    })
    expect(new URLSearchParams(result.body).get('command')).toBe('/webhook-collect')
    expect(result.timestamp).toEqual(example.now)
  })

  test('verifies a valid request', async () => {
    const headers = await Webhooks.sign(payload, { scheme, secret })
    expect((await verify(headers)).body).toBe(payload)
  })

  test('rejects a stale timestamp', async () => {
    const headers = await Webhooks.sign(payload, {
      scheme,
      secret,
      timestamp: new Date(Date.now() - 600_000),
    })
    expect(await reasonOf(verify(headers))).toBe('timestamp')
  })

  test('rejects a timestamp in the future beyond the tolerance', async () => {
    const headers = await Webhooks.sign(payload, {
      scheme,
      secret,
      timestamp: new Date(Date.now() + 600_000),
    })
    expect(await reasonOf(verify(headers))).toBe('timestamp')
  })

  test('rejects an invalid signature', async () => {
    const headers = await Webhooks.sign(payload, { scheme, secret })
    expect(
      await reasonOf(verify({ ...headers, 'x-slack-signature': 'v0=invalid-signature' })),
    ).toBe('malformed-header')
    expect(
      await reasonOf(verify({ ...headers, 'x-slack-signature': `v0=${'0'.repeat(64)}` })),
    ).toBe('signature')
  })

  test('rejects an unknown signature version', async () => {
    const headers = await Webhooks.sign(payload, { scheme, secret })
    const signature = headers['x-slack-signature']!.replace('v0=', 'v1=')
    expect(await reasonOf(verify({ ...headers, 'x-slack-signature': signature }))).toBe(
      'malformed-header',
    )
  })

  test('rejects missing headers', async () => {
    const headers = await Webhooks.sign(payload, { scheme, secret })
    expect(await reasonOf(verify({ 'x-slack-signature': headers['x-slack-signature']! }))).toBe(
      'missing-header',
    )
    expect(
      await reasonOf(
        verify({ 'x-slack-request-timestamp': headers['x-slack-request-timestamp']! }),
      ),
    ).toBe('missing-header')
  })

  test('rejects a timestamp that is not an integer', async () => {
    const headers = await Webhooks.sign(payload, { scheme, secret })
    expect(await reasonOf(verify({ ...headers, 'x-slack-request-timestamp': 'NaN' }))).toBe(
      'malformed-header',
    )
  })

  test('rejects an empty signing secret', async () => {
    const headers = await Webhooks.sign(payload, { scheme, secret })
    await expect(verify(headers, { secret: '' })).rejects.toThrow(TypeError)
  })
})
