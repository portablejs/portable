import { createHash, createHmac } from 'node:crypto'
import { OAuth as NodeOAuth } from 'oauth'
import OAuth from 'oauth-1.0a'
import { describe, expect, test } from 'vite-plus/test'
import * as OAuth1 from '@portable/oauth1'
import { parseHeader, pkcs1 } from './utils.js'

function random(seed: number) {
  let state = seed
  const next = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
  const int = (n: number) => Math.floor(next() * n)
  const pick = <value>(items: readonly value[]): value => items[int(items.length)]!
  const string = (alphabet: readonly string[], max: number) =>
    Array.from({ length: int(max + 1) }, () => pick(alphabet)).join('')
  return { int, pick, string }
}

const unreserved = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~'.split('')
const anything = [
  ...unreserved,
  ...' !*\'()&=+%/?:@#$,;[]"<>{}|\\^`'.split(''),
  'é',
  'ß',
  '中',
  '😀',
]
const alphanumeric = unreserved.slice(0, 62)
const nonce = 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg'
const timestamp = 1318622958
const methods = ['HMAC-SHA1', 'HMAC-SHA256', 'PLAINTEXT'] as const

type Case = {
  signatureMethod: (typeof methods)[number]
  consumer: { key: string; secret: string }
  token: { key: string; secret: string } | undefined
  method: string
  url: string
  query: Record<string, string | string[]>
  data: Record<string, string>
  realm: string | undefined
}

/**
 * Inputs on which oauth-1.0a follows RFC 5849: names are unreserved characters, a name is not
 * in both the query and the body, repeated values are alphanumeric and not empty, and hosts are lowercase
 * without a default port. PARITY.md lists the inputs it gets wrong.
 */
function generate(seed: number): Case {
  const r = random(seed)
  const names = new Set<string>()
  const name = () => {
    let n = ''
    while (n === '' || names.has(n) || n.startsWith('oauth_')) {
      n = r.string(unreserved, 8)
    }
    names.add(n)
    return n
  }
  const query: Record<string, string | string[]> = {}
  for (let i = r.int(5); i > 0; i--) {
    query[name()] =
      r.int(4) === 0
        ? ['v' + r.string(alphanumeric, 5), 'v' + r.string(alphanumeric, 5)]
        : r.string(anything, 12)
  }
  const method = r.pick(['GET', 'POST', 'PUT', 'DELETE'])
  const data: Record<string, string> = {}
  if (method === 'POST' || method === 'PUT') {
    for (let i = r.int(5); i > 0; i--) {
      data[name()] = r.string(anything, 20)
    }
  }
  const search = Object.entries(query)
    .flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => `${k}=${encodeURIComponent(x)}`))
    .join('&')
  const host = r.pick(['example.com', 'api.example.com:8443', 'localhost:3737'])
  const path = '/' + Array.from({ length: r.int(3) }, () => r.string(alphanumeric, 6)).join('/')
  return {
    signatureMethod: r.pick(methods),
    consumer: { key: r.string(anything, 20), secret: r.string(anything, r.pick([10, 100])) },
    token: r.int(3) ? { key: r.string(anything, 20), secret: r.string(anything, 30) } : undefined,
    method,
    url: `${r.pick(['http', 'https'])}://${host}${path}${search ? '?' + search : ''}`,
    query,
    data,
    realm: r.int(3) ? undefined : 'r' + r.string(alphanumeric, 10),
  }
}

function hashFunction(signatureMethod: string) {
  if (signatureMethod === 'PLAINTEXT') {
    return (_: string, key: string) => key
  }
  const algorithm = signatureMethod === 'HMAC-SHA1' ? 'sha1' : 'sha256'
  return (base: string, key: string) => createHmac(algorithm, key).update(base).digest('base64')
}

function viaOAuth1a(c: Case, bodyHash?: string): string {
  const oauth = new OAuth({
    consumer: c.consumer,
    signature_method: c.signatureMethod,
    hash_function: hashFunction(c.signatureMethod),
    body_hash_function: (data: string) =>
      createHash(c.signatureMethod === 'HMAC-SHA256' ? 'sha256' : 'sha1')
        .update(data)
        .digest('base64'),
    ...(c.realm === undefined ? {} : { realm: c.realm }),
  })
  oauth.getNonce = () => nonce
  oauth.getTimeStamp = () => timestamp
  const request =
    bodyHash === undefined
      ? { url: c.url, method: c.method, data: { ...c.data } }
      : { url: c.url, method: c.method, data: bodyHash, includeBodyHash: true }
  return oauth.toHeader(oauth.authorize(request, c.token)).Authorization
}

function toRequest(c: Case, chunkSeed: number): Request {
  const entries = Object.entries(c.data)
  if (entries.length === 0) {
    return new Request(c.url, { method: c.method })
  }
  const body = new TextEncoder().encode(
    entries.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%20/g, '+')}`).join('&'),
  )
  const r = random(chunkSeed)
  let offset = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= body.length) {
        return controller.close()
      }
      const size = 1 + r.int(16)
      controller.enqueue(body.slice(offset, offset + size))
      offset += size
    },
  })
  return new Request(c.url, {
    method: c.method,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: stream,
    duplex: 'half',
  } as RequestInit)
}

function options(c: Case) {
  return {
    signatureMethod: c.signatureMethod,
    consumer: c.consumer,
    token: c.token,
    realm: c.realm,
    nonce,
    now: new Date(timestamp * 1000),
  }
}

describe('matches oauth-1.0a', () => {
  for (let seed = 1; seed <= 300; seed++) {
    test(`random request ${seed}`, async () => {
      const c = generate(seed)
      expect(await OAuth1.authorization(toRequest(c, seed), options(c))).toBe(viaOAuth1a(c))
    })
  }

  for (let seed = 1; seed <= 30; seed++) {
    test(`random JSON body with oauth_body_hash ${seed}`, async () => {
      const c = { ...generate(seed), method: 'POST', data: {} }
      const body = JSON.stringify({ text: random(seed).string(anything, 200) })
      if (c.signatureMethod === 'PLAINTEXT') {
        c.signatureMethod = 'HMAC-SHA1'
      }
      const request = new Request(c.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      expect(await OAuth1.authorization(request, { ...options(c), bodyHash: true })).toBe(
        viaOAuth1a(c, body),
      )
    })
  }
})

describe('matches node-oauth', () => {
  for (let seed = 1; seed <= 100; seed++) {
    test(`random GET request ${seed}`, async () => {
      const c = { ...generate(seed), method: 'GET', data: {}, realm: undefined }
      if (Object.values(c.query).some(Array.isArray)) {
        return
      }
      const token = c.token?.key ? c.token : undefined
      const oauth = new NodeOAuth(
        null,
        null,
        c.consumer.key,
        c.consumer.secret,
        '1.0',
        null,
        c.signatureMethod,
      )
      oauth._getNonce = () => nonce
      oauth._getTimestamp = () => timestamp
      const expected = parseHeader(oauth.authHeader(c.url, token?.key, token?.secret, 'GET'))
      const actual = parseHeader(
        await OAuth1.authorization(new Request(c.url), { ...options(c), token }),
      )
      expect(actual).toEqual(expected)
    })
  }

  test('RSA-SHA1', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const c = { ...generate(seed), method: 'GET', data: {}, realm: undefined }
      if (Object.values(c.query).some(Array.isArray)) {
        continue
      }
      const token = c.token?.key ? c.token : undefined
      const oauth = new NodeOAuth(null, null, c.consumer.key, pkcs1, '1.0', null, 'RSA-SHA1')
      oauth._getNonce = () => nonce
      oauth._getTimestamp = () => timestamp
      const expected = parseHeader(oauth.authHeader(c.url, token?.key, token?.secret, 'GET'))
      const actual = parseHeader(
        await OAuth1.authorization(new Request(c.url), {
          signatureMethod: 'RSA-SHA1',
          consumer: { key: c.consumer.key, privateKey: pkcs1 },
          token,
          nonce,
          now: new Date(timestamp * 1000),
        }),
      )
      expect(actual).toEqual(expected)
    }
  })
})
