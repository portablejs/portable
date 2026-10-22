import * as OAuth1 from '@portable/oauth1'
import { fc, fuzz, outcomeAsync } from '@portable/fuzz'
import { describe, expect, test } from 'vite-plus/test'
import { form, hmac, parseHeader, pkcs1, pkcs8 } from './utils.js'

/** RFC 3986 percent-encoding, as RFC 5849 section 3.6 requires, written without the package. */
const rfc3986 = (text: string) =>
  encodeURIComponent(text).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )

const text = fc.string({ unit: 'grapheme', maxLength: 12 })
const key = fc.string({ unit: 'grapheme', minLength: 1, maxLength: 12 })
const pairs = fc.array(fc.tuple(text, text), { maxLength: 5 })
const url = 'https://api.example.com/1/statuses/update.json'

describe('authorization', () => {
  test('writes every protocol parameter so it decodes to the value given', async () => {
    await fuzz(
      fc.asyncProperty(
        fc.record({ key, secret: text }),
        fc.record({ key, secret: text }),
        fc.record({ nonce: key, callback: text, verifier: text, realm: text }),
        async (consumer, token, extra) => {
          const header = await OAuth1.authorization(new Request(url), {
            signatureMethod: 'PLAINTEXT',
            consumer,
            token,
            now: new Date(1318622958_000),
            ...extra,
          })
          expect(parseHeader(header)).toEqual({
            realm: extra.realm,
            oauth_callback: extra.callback,
            oauth_consumer_key: consumer.key,
            oauth_nonce: extra.nonce,
            oauth_signature: `${rfc3986(consumer.secret)}&${rfc3986(token.secret)}`,
            oauth_signature_method: 'PLAINTEXT',
            oauth_timestamp: '1318622958',
            oauth_token: token.key,
            oauth_verifier: extra.verifier,
            oauth_version: '1.0',
          })
        },
      ),
    )
  })

  test('signs the RFC 5849 base string of any query and form parameters', async () => {
    await fuzz(
      fc.asyncProperty(pairs, pairs, text, async (query, body, secret) => {
        const search = new URLSearchParams(query).toString()
        const request = new Request(`${url}${search ? '?' + search : ''}`, {
          ...form(new URLSearchParams(body).toString()),
        })
        const options = {
          signatureMethod: 'HMAC-SHA1' as const,
          consumer: { key: 'consumer', secret },
          nonce: 'nonce',
          now: new Date(1_000),
        }
        const protocol: [string, string][] = [
          ['oauth_consumer_key', 'consumer'],
          ['oauth_nonce', 'nonce'],
          ['oauth_signature_method', 'HMAC-SHA1'],
          ['oauth_timestamp', '1'],
          ['oauth_version', '1.0'],
        ]
        const parameters = [...protocol, ...query, ...body]
          .map(([name, value]) => [rfc3986(name), rfc3986(value)] as const)
          .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
          .map(([name, value]) => `${name}=${value}`)
          .join('&')
        const base = `POST&${rfc3986(url)}&${rfc3986(parameters)}`
        const header = parseHeader(await OAuth1.authorization(request, options))
        expect(header.oauth_signature).toBe(await hmac('SHA-1', `${rfc3986(secret)}&`, base))
      }),
    )
  })

  test('signs the same in the header and in the query', async () => {
    await fuzz(
      fc.asyncProperty(pairs, pairs, async (query, body) => {
        const search = new URLSearchParams(query).toString()
        const make = () =>
          new Request(
            `${url}${search ? '?' + search : ''}`,
            form(new URLSearchParams(body).toString()),
          )
        const options = {
          consumer: { key: 'k', secret: 's' },
          nonce: 'n',
          now: new Date(1_000),
        }
        const header = parseHeader(await OAuth1.authorization(make(), options))
        const signed = await OAuth1.sign(make(), { ...options, placement: 'query' })
        expect(new URL(signed.url).searchParams.get('oauth_signature')).toBe(header.oauth_signature)
      }),
    )
  })
})

describe('RSA-SHA1 keys', () => {
  const mutatedPem = fc
    .tuple(
      fc.constantFrom(pkcs1, pkcs8),
      fc.array(fc.tuple(fc.nat(), fc.constantFrom('A', '/', '=', '-', ' ', '\n', '')), {
        minLength: 1,
        maxLength: 4,
      }),
    )
    .map(([pem, edits]) => {
      let out = pem
      for (const [at, char] of edits) {
        const i = at % out.length
        out = out.slice(0, i) + char + out.slice(i + 1)
      }
      return out
    })

  test('a mutated PEM key signs or throws RangeError', async () => {
    await fuzz(
      fc.asyncProperty(mutatedPem, async (privateKey) => {
        await outcomeAsync([RangeError], () =>
          OAuth1.authorization(new Request(url), {
            signatureMethod: 'RSA-SHA1',
            consumer: { key: 'k', privateKey },
          }),
        )
      }),
      { scale: 0.5 },
    )
  })
})
