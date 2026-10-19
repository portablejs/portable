import { sha1 } from '@noble/hashes/legacy.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { describe, expect, test } from 'vite-plus/test'
import * as OAuth1 from '@portable/oauth1'
import { form, parseHeader, pkcs1, pkcs8, publicKey, signature, twitter } from './utils.js'

const tweetUrl = 'https://api.twitter.com/1/statuses/update.json?include_entities=true'
const tweetBody = 'status=Hello+Ladies+%2B+Gentlemen%2C+a+signed+OAuth+request%21'

describe('sign()', () => {
  test('sets the Authorization header and keeps the method, headers and body', async () => {
    const request = new Request(
      tweetUrl,
      form(tweetBody, { headers: { accept: 'application/json' } }),
    )
    const signed = await OAuth1.sign(request, twitter)
    expect(signed.method).toBe('POST')
    expect(signed.url).toBe(tweetUrl)
    expect(signed.headers.get('accept')).toBe('application/json')
    expect(signed.headers.get('authorization')).toBe(
      await OAuth1.authorization(new Request(tweetUrl, form(tweetBody)), twitter),
    )
    expect(await signed.text()).toBe(tweetBody)
  })

  test('replaces an existing Authorization header', async () => {
    const request = new Request(tweetUrl, { headers: { authorization: 'Bearer x' } })
    const signed = await OAuth1.sign(request, twitter)
    expect(signed.headers.get('authorization')).toMatch(/^OAuth /)
  })

  test('keeps a JSON body that is not read for signing', async () => {
    const signed = await OAuth1.sign(
      new Request('https://example.com/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"a":1}',
      }),
      twitter,
    )
    expect(await signed.json()).toEqual({ a: 1 })
  })

  test('placement "query" appends the protocol parameters and keeps the body', async () => {
    const signed = await OAuth1.sign(new Request(tweetUrl, form(tweetBody)), {
      ...twitter,
      placement: 'query',
      realm: 'ignored in the query',
    })
    const params = new URL(signed.url).searchParams
    expect(params.get('include_entities')).toBe('true')
    expect(params.get('oauth_signature')).toBe('tnnArxj06cWHq44gCs1OSKk/jLY=')
    expect(params.has('realm')).toBe(false)
    expect(signed.headers.get('content-type')).toBe('application/x-www-form-urlencoded')
    expect(await signed.text()).toBe(tweetBody)
  })

  test('placement "query" on a URL without a query', async () => {
    const signed = await OAuth1.sign(new Request('https://example.com/a'), {
      consumer: { key: 'k', secret: 's' },
      nonce: 'n',
      timestamp: new Date(1_000),
      placement: 'query',
    })
    expect(signed.url).toMatch(
      /^https:\/\/example\.com\/a\?oauth_consumer_key=k&oauth_nonce=n&oauth_signature=[\w%]+&oauth_signature_method=HMAC-SHA1&oauth_timestamp=1&oauth_version=1\.0$/,
    )
  })

  test('a request body read by sign() can be sent with the signed request', async () => {
    const signed = await OAuth1.sign(
      new Request('https://example.com/', { method: 'POST', body: 'text' }),
      {
        ...twitter,
        bodyHash: true,
      },
    )
    expect(await signed.text()).toBe('text')
    expect(parseHeader(signed.headers.get('authorization')!).oauth_body_hash).toBeDefined()
  })
})

describe('RSA-SHA1', () => {
  const photos = () =>
    new Request('http://photos.example.net/photos?file=vacation.jpg&size=original')
  const options = {
    signatureMethod: 'RSA-SHA1',
    token: { key: 'nnch734d00sl2jdk', secret: 'ignored' },
    nonce: 'kllo9940pd9333jh',
    timestamp: new Date(1191242096_000),
  } as const
  // From node-oauth's tests; RSASSA-PKCS1-v1_5 signatures are deterministic.
  const expected =
    'qS4rhWog7GPgo4ZCJvUdC/1ZAax/Q4Ab9yOBvgxSopvmKUKp5rso+Zda46GbyN2hnYDTiA/g3P/d/YiPWa454BEBb/KWFV83HpLDIoqUUhJnlXX9MqRQQac0oeope4fWbGlfTdL2PXjSFJmvfrzybERD/ZufsFtVrQKS3QBpYiw='

  test('signs with a PKCS #1 PEM key', async () => {
    expect(
      await signature(photos(), {
        ...options,
        consumer: { key: 'dpf43f3p2l4k3l03', privateKey: pkcs1 },
      }),
    ).toBe(expected)
  })

  test('signs with a PKCS #8 PEM key', async () => {
    expect(
      await signature(photos(), {
        ...options,
        consumer: { key: 'dpf43f3p2l4k3l03', privateKey: pkcs8 },
      }),
    ).toBe(expected)
  })

  test('signs with a CryptoKey, and the public key verifies the signature', async () => {
    const der = (pem: string) =>
      Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0))
    const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }
    const privateKey = await crypto.subtle.importKey('pkcs8', der(pkcs8), algorithm, false, [
      'sign',
    ])
    const actual = await signature(photos(), {
      ...options,
      consumer: { key: 'dpf43f3p2l4k3l03', privateKey },
    })
    expect(actual).toBe(expected)

    const verifyKey = await crypto.subtle.importKey('spki', der(publicKey), algorithm, false, [
      'verify',
    ])
    const base = new TextEncoder().encode(
      'GET&http%3A%2F%2Fphotos.example.net%2Fphotos&file%3Dvacation.jpg%26oauth_consumer_key%3Ddpf43f3p2l4k3l03%26oauth_nonce%3Dkllo9940pd9333jh%26oauth_signature_method%3DRSA-SHA1%26oauth_timestamp%3D1191242096%26oauth_token%3Dnnch734d00sl2jdk%26oauth_version%3D1.0%26size%3Doriginal',
    )
    expect(await crypto.subtle.verify(algorithm, verifyKey, der(actual), base)).toBe(true)
  })

  test('a key for another algorithm or hash throws RangeError', async () => {
    const key = (
      await crypto.subtle.generateKey(
        {
          name: 'RSASSA-PKCS1-v1_5',
          modulusLength: 1024,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        false,
        ['sign', 'verify'],
      )
    ).privateKey
    await expect(
      signature(photos(), { ...options, consumer: { key: 'k', privateKey: key } }),
    ).rejects.toThrow(RangeError)
  })

  test('a string that is not a PEM private key throws RangeError', async () => {
    for (const privateKey of [
      'secret',
      publicKey,
      '-----BEGIN PRIVATE KEY-----\n!!!\n-----END PRIVATE KEY-----',
      '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----',
    ]) {
      await expect(
        signature(photos(), { ...options, consumer: { key: 'k', privateKey } }),
      ).rejects.toThrow(RangeError)
    }
  })

  test('a PEM key that imports but can not sign throws RangeError', async () => {
    // One base64 digit of the public exponent changed, so the key's numbers are inconsistent.
    const privateKey = pkcs8.replace('cWQaOKm9AgMBAAE', 'cWQaOKmAAgMBAAE')
    await expect(
      signature(photos(), { ...options, consumer: { key: 'k', privateKey } }),
    ).rejects.toThrow(RangeError)
  })
})

describe('HMAC', () => {
  test('a signing key longer than the 64-byte block is hashed first', async () => {
    const secret = 'x'.repeat(100)
    const base = new TextEncoder().encode(
      'GET&https%3A%2F%2Fexample.com%2F&oauth_consumer_key%3Dk%26oauth_nonce%3Dn%26oauth_signature_method%3DHMAC-SHA256%26oauth_timestamp%3D1%26oauth_version%3D1.0',
    )
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(`${secret}&`),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const expected = btoa(
      String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, base))),
    )
    expect(
      await signature(new Request('https://example.com/'), {
        signatureMethod: 'HMAC-SHA256',
        consumer: { key: 'k', secret },
        nonce: 'n',
        timestamp: new Date(1_000),
      }),
    ).toBe(expected)
  })
})

describe('digest option', () => {
  const nobleDigest: OAuth1.Digest = (algorithm, data) =>
    algorithm === 'SHA-1' ? sha1(data) : sha256(data)
  const asyncDigest: OAuth1.Digest = async (algorithm, data) => nobleDigest(algorithm, data)
  const longSecret = { key: twitter.consumer.key, secret: 'k'.repeat(100) }

  for (const signatureMethod of ['HMAC-SHA1', 'HMAC-SHA256'] as const)
    for (const consumer of [twitter.consumer, longSecret])
      test(`a sync or an async @noble/hashes digest signs ${signatureMethod} as the default does, with a ${consumer.secret.length}-character secret`, async () => {
        const options = { ...twitter, consumer, signatureMethod, bodyHash: true }
        const json = () =>
          new Request(tweetUrl, {
            method: 'POST',
            body: '{"a":1}',
            headers: { 'content-type': 'application/json' },
          })
        const expected = await OAuth1.authorization(json(), options)
        for (const digest of [nobleDigest, asyncDigest]) {
          expect(await OAuth1.authorization(json(), { ...options, digest })).toBe(expected)
          const signed = await OAuth1.sign(json(), { ...options, digest })
          expect(signed.headers.get('authorization')).toBe(expected)
        }
      })

  test('uses a digest passed in', async () => {
    const calls: string[] = []
    const digest: OAuth1.Digest = (algorithm, data) => {
      calls.push(algorithm)
      return nobleDigest(algorithm, data)
    }
    await OAuth1.authorization(new Request(tweetUrl), {
      ...twitter,
      signatureMethod: 'HMAC-SHA256',
      digest,
    })
    expect(calls).toContain('SHA-256')
  })
})
