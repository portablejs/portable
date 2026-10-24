import { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'
import { sign as octokitSign, verify as octokitVerify } from '@octokit/webhooks-methods'
import { verifySlackRequest } from '@slack/bolt/dist/receivers/verify-request.js'
import { Webhook as StandardWebhook } from 'standardwebhooks'
import Stripe from 'stripe'
import { Webhook as SvixWebhook } from 'svix'
import { describe, expect, test } from 'vite-plus/test'
import * as Webhooks from '@portable/webhooks'
import { octokitWeb } from './octokit-web.js'
import { codeOf } from './utils.js'

const stripe = new Stripe('sk_test_oracle')

type Case = {
  body: string
  secret: string
  timestamp: Date
  id: string
}

type Upstream = {
  sign: (c: Case) => Promise<Record<string, string>> | Record<string, string> | undefined
  verify: (
    body: string,
    headers: Record<string, string>,
    secret: string,
    now: Date,
  ) => Promise<boolean>
}

async function accepts(fn: () => unknown): Promise<boolean> {
  try {
    return (await fn()) !== false
  } catch {
    return false
  }
}

type Name = 'standard' | 'svix' | 'stripe' | 'github' | 'slack'

const presets: Record<Name, Webhooks.Scheme> = {
  standard: Webhooks.standard,
  svix: Webhooks.standard,
  stripe: Webhooks.stripe,
  github: Webhooks.github,
  slack: Webhooks.slack,
}

const upstream: Record<Name, Upstream> = {
  standard: {
    sign: (c) => ({
      'webhook-id': c.id,
      'webhook-timestamp': String(Math.floor(c.timestamp.getTime() / 1000)),
      'webhook-signature': new StandardWebhook(c.secret).sign(c.id, c.timestamp, c.body),
    }),
    verify: (body, headers, secret) =>
      accepts(() => {
        new StandardWebhook(secret).verify(body, headers)
      }),
  },
  svix: {
    sign: (c) => ({
      'svix-id': c.id,
      'svix-timestamp': String(Math.floor(c.timestamp.getTime() / 1000)),
      'svix-signature': new SvixWebhook(c.secret).sign(c.id, c.timestamp, c.body),
    }),
    verify: (body, headers, secret) => accepts(() => new SvixWebhook(secret).verify(body, headers)),
  },
  stripe: {
    sign: (c) => ({
      'stripe-signature': stripe.webhooks.generateTestHeaderString({
        payload: c.body,
        secret: c.secret,
        timestamp: Math.floor(c.timestamp.getTime() / 1000),
      }),
    }),
    verify: (body, headers, secret, now) =>
      accepts(() =>
        stripe.webhooks.signature!.verifyHeader(
          body,
          headers['stripe-signature']!,
          secret,
          300,
          undefined,
          now.getTime(),
        ),
      ),
  },
  github: {
    sign: async (c) => ({ 'x-hub-signature-256': await octokitSign(c.secret, c.body) }),
    verify: (body, headers, secret) =>
      accepts(() => octokitVerify(secret, body, headers['x-hub-signature-256']!)),
  },
  slack: {
    sign: (c) => {
      const timestamp = String(Math.floor(c.timestamp.getTime() / 1000))
      const hex = createHmac('sha256', c.secret).update(`v0:${timestamp}:${c.body}`).digest('hex')
      return { 'x-slack-request-timestamp': timestamp, 'x-slack-signature': `v0=${hex}` }
    },
    verify: (body, headers, secret, now) =>
      accepts(() =>
        verifySlackRequest({
          signingSecret: secret,
          body,
          headers: {
            'x-slack-signature': headers['x-slack-signature']!,
            'x-slack-request-timestamp': Number(headers['x-slack-request-timestamp']),
          },
          nowMilliseconds: now.getTime(),
        }),
      ),
  },
}

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

const chars = [...'abcdefghijklmnopqrstuvwxyz0123456789 "{}:,\n\t\\'.split(''), 'é', '♥', '🚀']

function makeCase(scheme: Name, next: () => number): Case {
  const pick = (n: number) => Math.floor(next() * n)
  let text = ''
  for (let i = 0, n = pick(400); i < n; i++) {
    text += chars[pick(chars.length)]
  }
  const body = JSON.stringify({ id: `evt_${pick(1e9)}`, object: 'event', text })
  const key = new Uint8Array(24).map(() => pick(256))
  const secret =
    scheme === 'standard' || scheme === 'svix'
      ? `whsec_${Buffer.from(key).toString('base64')}`
      : `whsec_${Buffer.from(key).toString('hex')}`
  return { body, secret, timestamp: new Date(), id: `msg_${pick(1e9)}` }
}

function chunkedRequest(
  body: string,
  headers: Record<string, string>,
  next: () => number,
): Request {
  const bytes = new TextEncoder().encode(body)
  let at = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.length) {
        return controller.close()
      }
      const size = 1 + Math.floor(next() * 64)
      controller.enqueue(bytes.slice(at, at + size))
      at += size
    },
  })
  const init = { method: 'POST', body: stream, headers, duplex: 'half' }
  return new Request('https://example.com/webhooks', init)
}

const schemes = ['standard', 'svix', 'stripe', 'github', 'slack'] as const
const timed = (scheme: Name) => scheme !== 'github'

describe('matches upstream signatures', () => {
  for (const scheme of schemes.filter((name) => name !== 'svix')) {
    test(`${scheme}: produces the same headers as upstream`, async () => {
      const next = random(1)
      for (let i = 0; i < 50; i++) {
        const c = makeCase(scheme, next)
        const ours = await Webhooks.sign(c.body, {
          ...c,
          now: c.timestamp,
          scheme: presets[scheme],
        })
        const theirs = await upstream[scheme].sign(c)
        expect(
          Object.fromEntries(Object.entries(ours).filter(([name]) => name in theirs!)),
        ).toEqual(theirs)
      }
    })
  }
})

describe('accepts and rejects the same requests as upstream', () => {
  const tampers = ['none', 'body', 'signature', 'secret', 'old', 'recent'] as const

  for (const scheme of schemes) {
    for (const tamper of tampers) {
      test(`${scheme}: ${tamper}, random chunking`, async () => {
        const next = random(tampers.indexOf(tamper) + 7)
        for (let i = 0; i < 20; i++) {
          const c = makeCase(scheme, next)
          if (tamper === 'old') {
            c.timestamp = new Date(Date.now() - 400_000)
          }
          if (tamper === 'recent') {
            c.timestamp = new Date(Date.now() - 200_000)
          }
          const headers = { ...(await upstream[scheme].sign(c)) }
          let { body, secret } = c
          if (tamper === 'body') {
            body = body.replace('evt_', 'evt_x')
          }
          if (tamper === 'secret') {
            secret = secret.replace('whsec_', 'whsec_AAAA')
          }
          if (tamper === 'signature') {
            const [name, value] = Object.entries(headers).find(([n]) => n.includes('signature'))!
            const at = value.length - 6
            headers[name] =
              value.slice(0, at) + (value[at] === 'a' ? 'b' : 'a') + value.slice(at + 1)
          }
          const now = new Date()
          const theirs = await upstream[scheme].verify(body, headers, secret, now)
          const ours = await accepts(() =>
            Webhooks.verify(chunkedRequest(body, headers, next), {
              scheme: presets[scheme],
              secret,
              now,
            }),
          )
          expect(ours).toBe(theirs)
          expect(ours).toBe(
            tamper === 'none' || tamper === 'recent' || (tamper === 'old' && !timed(scheme)),
          )
        }
      })
    }
  }
})

describe('deliberate differences', () => {
  for (const scheme of ['stripe', 'slack'] as const) {
    test(`${scheme}: rejects a timestamp ten minutes in the future, which upstream accepts`, async () => {
      const c = makeCase(scheme, random(3))
      c.timestamp = new Date(Date.now() + 600_000)
      const headers = await upstream[scheme].sign(c)
      const now = new Date()
      expect(await upstream[scheme].verify(c.body, headers!, c.secret, now)).toBe(true)
      expect(
        await accepts(() =>
          Webhooks.verify(
            { headers: headers!, body: c.body },
            { scheme: presets[scheme], secret: c.secret, now },
          ),
        ),
      ).toBe(false)
    })
  }

  test('stripe: verifies a body with a byte order mark, which upstream drops before hashing', async () => {
    const secret = 'whsec_bom'
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{"id":"evt_1"}')])
    const t = Math.floor(Date.now() / 1000)
    const hex = createHmac('sha256', secret).update(`${t}.`).update(bytes).digest('hex')
    const header = `t=${t},v1=${hex}`
    expect(
      await accepts(() => stripe.webhooks.signature!.verifyHeader(bytes, header, secret)),
    ).toBe(false)
    const result = await Webhooks.verify(
      { headers: { 'stripe-signature': header }, body: bytes },
      { scheme: Webhooks.stripe, secret },
    )
    expect(JSON.parse(result.body)).toEqual({ id: 'evt_1' })
  })

  test('standard: rejects a timestamp with trailing characters, which upstream parses with parseInt', async () => {
    const c = makeCase('standard', random(5))
    const headers = await upstream.standard.sign(c)
    headers!['webhook-timestamp'] += 'abc'
    const signature = new StandardWebhook(c.secret)
    expect(await accepts(() => signature.verify(c.body, headers!))).toBe(true)
    expect(
      await accepts(() =>
        Webhooks.verify(
          { headers: headers!, body: c.body },
          { scheme: Webhooks.standard, secret: c.secret },
        ),
      ),
    ).toBe(false)
  })

  test('github: requires the sha256= prefix, which the web build of upstream drops', async () => {
    const c = makeCase('github', random(6))
    const hex = (await octokitSign(c.secret, c.body)).slice('sha256='.length)
    expect(await octokitWeb.verify(c.secret, c.body, hex)).toBe(true)
    const result = Webhooks.verify(
      { headers: { 'x-hub-signature-256': hex }, body: c.body },
      { scheme: Webhooks.github, secret: c.secret },
    )
    expect(await codeOf(result)).toBe('malformed-header')
  })

  test('github: rejects non-hex characters, which the web build of upstream skips or crashes on', async () => {
    const c = makeCase('github', random(8))
    const signature = await octokitSign(c.secret, c.body)
    const padded = `sha256=${signature.slice(7).replace(/(..)/g, '$1g')}`
    expect(await octokitWeb.verify(c.secret, c.body, padded)).toBe(true)
    await expect(octokitWeb.verify(c.secret, c.body, 'sha256=zz')).rejects.toThrow(TypeError)
    for (const header of [padded, 'sha256=zz']) {
      const result = Webhooks.verify(
        { headers: { 'x-hub-signature-256': header }, body: c.body },
        { scheme: Webhooks.github, secret: c.secret },
      )
      expect(await codeOf(result)).toBe('malformed-header')
    }
  })
})
