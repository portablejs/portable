import { describe, expect, test } from 'vite-plus/test'
import * as OAuth1 from '@portable/oauth1'
import { baseString, form, hmac, parseHeader, signature } from './utils.js'

const somehost = {
  consumer: { key: 'consumerkey', secret: 'consumersecret' },
  nonce: 'ybHPeOEkAUJ3k2wJT9Xb43MjtSgTvKqp',
  timestamp: 1272399856,
}
const oauthParams =
  'oauth_consumer_key=k&oauth_nonce=n&oauth_signature_method=HMAC-SHA1&oauth_timestamp=1&oauth_version=1.0'
const options = { consumer: { key: 'k', secret: 's' }, nonce: 'n', timestamp: 1 }

describe('cases from the node-oauth test suite', () => {
  test('HMAC-SHA1 encodes the consumer secret in the signing key', async () => {
    const actual = await signature(new Request('https://example.com/'), {
      signatureMethod: 'PLAINTEXT',
      consumer: { key: 'k', secret: 'ascas2312dxc1sdsdk!' },
      token: { key: 't', secret: 'xyz4992k83j47x0b' },
    })
    expect(actual).toBe('ascas2312dxc1sdsdk%21&xyz4992k83j47x0b')
  })

  test('HMAC-SHA1 and HMAC-SHA256 sign the base string with the signing key', async () => {
    for (const [signatureMethod, hash] of [
      ['HMAC-SHA1', 'SHA-1'],
      ['HMAC-SHA256', 'SHA-256'],
    ] as const) {
      const actual = await signature(
        new Request('http://photos.example.net/photos?file=vacation.jpg&size=original'),
        {
          signatureMethod,
          consumer: { key: 'dpf43f3p2l4k3l03', secret: 'ascas2312dxc1sdsdk!' },
          token: { key: 'nnch734d00sl2jdk', secret: 'xyz4992k83j47x0b' },
          nonce: 'kllo9940pd9333jh',
          timestamp: 1191242096,
        },
      )
      const base = baseString(
        'GET',
        'http://photos.example.net/photos',
        `file=vacation.jpg&oauth_consumer_key=dpf43f3p2l4k3l03&oauth_nonce=kllo9940pd9333jh&oauth_signature_method=${signatureMethod}&oauth_timestamp=1191242096&oauth_token=nnch734d00sl2jdk&oauth_version=1.0&size=original`,
      )
      expect(actual).toBe(await hmac(hash, 'ascas2312dxc1sdsdk%21&xyz4992k83j47x0b', base))
    }
  })

  test('PLAINTEXT with an empty consumer secret', async () => {
    const actual = await signature(new Request('http://photos.example.net/photos'), {
      signatureMethod: 'PLAINTEXT',
      consumer: { key: 'k', secret: '' },
      token: { key: 't', secret: 'test' },
    })
    expect(actual).toBe('&test')
  })

  test('default ports are dropped, other ports kept, and an empty path becomes "/"', async () => {
    const base = (uri: string) => baseString('GET', uri, oauthParams)
    expect(await signature(new Request('https://somehost.com:443/foo/bar'), options)).toBe(
      await hmac('SHA-1', 's&', base('https://somehost.com/foo/bar')),
    )
    expect(await signature(new Request('https://somehost.com:446/foo/bar'), options)).toBe(
      await hmac('SHA-1', 's&', base('https://somehost.com:446/foo/bar')),
    )
    expect(await signature(new Request('http://somehost.com:81/foo/bar'), options)).toBe(
      await hmac('SHA-1', 's&', base('http://somehost.com:81/foo/bar')),
    )
    expect(await signature(new Request('http://somehost.com'), options)).toBe(
      await hmac('SHA-1', 's&', base('http://somehost.com/')),
    )
  })

  test('parameters are sorted by name, then by value', async () => {
    const request = new Request('https://example.com/?z=a&a=z&a=b&a=b&a=a&a=y&1=c')
    expect(await signature(request, options)).toBe(
      await hmac(
        'SHA-1',
        's&',
        baseString('GET', 'https://example.com/', `1=c&a=a&a=b&a=b&a=y&a=z&${oauthParams}&z=a`),
      ),
    )
  })

  test('foo[bar] query names are signed as written', async () => {
    const request = new Request('http://foo.com/?foo[bar]=xxx&bar[foo]=yyy')
    expect(await signature(request, options)).toBe(
      await hmac(
        'SHA-1',
        's&',
        baseString('GET', 'http://foo.com/', `bar%5Bfoo%5D=yyy&foo%5Bbar%5D=xxx&${oauthParams}`),
      ),
    )
  })

  test('signUrl: without a token', async () => {
    const signed = await OAuth1.sign(new Request('http://somehost.com:3323/foo/poop?bar=foo'), {
      ...somehost,
      placement: 'query',
    })
    expect(signed.url).toBe(
      'http://somehost.com:3323/foo/poop?bar=foo&oauth_consumer_key=consumerkey&oauth_nonce=ybHPeOEkAUJ3k2wJT9Xb43MjtSgTvKqp&oauth_signature=7ytO8vPSLut2GzHjU9pn1SV9xjc%3D&oauth_signature_method=HMAC-SHA1&oauth_timestamp=1272399856&oauth_version=1.0',
    )
    expect(signed.headers.has('authorization')).toBe(false)
  })

  test('signUrl: with a token', async () => {
    const signed = await OAuth1.sign(new Request('http://somehost.com:3323/foo/poop?bar=foo'), {
      ...somehost,
      token: { key: 'token' },
      placement: 'query',
    })
    const params = new URL(signed.url).searchParams
    expect(params.get('oauth_token')).toBe('token')
    expect(params.get('oauth_signature')).toBe('9LwCuCWw5sURtpMroIolU3YwsdI=')
  })

  test('signUrl: with a token and a token secret', async () => {
    const signed = await OAuth1.sign(new Request('http://somehost.com:3323/foo/poop?bar=foo'), {
      ...somehost,
      token: { key: 'token', secret: 'tokensecret' },
      placement: 'query',
    })
    expect(new URL(signed.url).searchParams.get('oauth_signature')).toBe(
      'zeOR0Wsm6EG6XSg0Vw/sbpoSib8=',
    )
  })

  test('authHeader: with a token and a token secret', async () => {
    const header = await OAuth1.authorization(
      new Request('http://somehost.com:3323/foo/poop?bar=foo'),
      {
        ...somehost,
        token: { key: 'token', secret: 'tokensecret' },
      },
    )
    expect(header).toBe(
      'OAuth oauth_consumer_key="consumerkey", oauth_nonce="ybHPeOEkAUJ3k2wJT9Xb43MjtSgTvKqp", oauth_signature="zeOR0Wsm6EG6XSg0Vw%2FsbpoSib8%3D", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1272399856", oauth_token="token", oauth_version="1.0"',
    )
  })

  test('OAuth Echo: the verify-credentials request is signed with a realm', async () => {
    const header = await OAuth1.authorization(new Request('http://api.foobar.com/verify.json'), {
      ...somehost,
      token: { key: 'token', secret: 'tokensecret' },
      realm: 'http://foobar.com/',
    })
    const base = baseString(
      'GET',
      'http://api.foobar.com/verify.json',
      'oauth_consumer_key=consumerkey&oauth_nonce=ybHPeOEkAUJ3k2wJT9Xb43MjtSgTvKqp&oauth_signature_method=HMAC-SHA1&oauth_timestamp=1272399856&oauth_token=token&oauth_version=1.0',
    )
    expect(header.startsWith('OAuth realm="http://foobar.com/", ')).toBe(true)
    expect(parseHeader(header).oauth_signature).toBe(
      await hmac('SHA-1', 'consumersecret&tokensecret', base),
    )
  })

  test('form body parameters are signed and the body is sent unchanged', async () => {
    const signed = await OAuth1.sign(
      new Request('http://foo.com/protected_resource', form('scope=foobar%2C1%2C2')),
      options,
    )
    expect(await signed.text()).toBe('scope=foobar%2C1%2C2')
    expect(parseHeader(signed.headers.get('authorization')!).oauth_signature).toBe(
      await hmac(
        'SHA-1',
        's&',
        baseString(
          'POST',
          'http://foo.com/protected_resource',
          `${oauthParams}&scope=foobar%2C1%2C2`,
        ),
      ),
    )
  })

  test('a binary body keeps its bytes and content type and is not signed', async () => {
    for (const method of ['POST', 'PUT']) {
      const bytes = new Uint8Array([10, 20, 30, 40])
      const signed = await OAuth1.sign(
        new Request('http://foo.com/blah', {
          method,
          headers: { 'content-type': 'image/jpeg' },
          body: bytes,
        }),
        options,
      )
      expect(new Uint8Array(await signed.arrayBuffer())).toEqual(bytes)
      expect(signed.headers.get('content-type')).toBe('image/jpeg')
      expect(parseHeader(signed.headers.get('authorization')!).oauth_signature).toBe(
        await hmac('SHA-1', 's&', baseString(method, 'http://foo.com/blah', oauthParams)),
      )
    }
  })

  test('a non-ASCII form body is signed by its UTF-8 bytes', async () => {
    const request = new Request('http://foo.com/blah', form('text=T%C3%B4i+y%C3%AAu+node'))
    expect(await signature(request, options)).toBe(
      await hmac(
        'SHA-1',
        's&',
        baseString('POST', 'http://foo.com/blah', `${oauthParams}&text=T%C3%B4i%20y%C3%AAu%20node`),
      ),
    )
  })

  test('GET, DELETE and a lowercase method are signed in upper case', async () => {
    for (const method of ['GET', 'DELETE', 'patch']) {
      expect(await signature(new Request('http://foo.com/blah', { method }), options)).toBe(
        await hmac(
          'SHA-1',
          's&',
          baseString(method.toUpperCase(), 'http://foo.com/blah', oauthParams),
        ),
      )
    }
  })
})

describe('known node-oauth issues', () => {
  test('a repeated query name is signed as repeated pairs, not as a[0] and a[1] (#375)', async () => {
    expect(await signature(new Request('https://example.com/?a=1&a=2'), options)).toBe(
      await hmac(
        'SHA-1',
        's&',
        baseString('GET', 'https://example.com/', `a=1&a=2&${oauthParams}`),
      ),
    )
  })

  test('a form body given as a string is signed (#366)', async () => {
    const request = new Request('https://example.com/', form('status=hi'))
    expect(await signature(request, options)).toBe(
      await hmac(
        'SHA-1',
        's&',
        baseString('POST', 'https://example.com/', `${oauthParams}&status=hi`),
      ),
    )
  })

  test('a POST with a query and a form body signs both (#326)', async () => {
    const request = new Request('https://example.com/?page=2', form('status=hi'))
    expect(await signature(request, options)).toBe(
      await hmac(
        'SHA-1',
        's&',
        baseString('POST', 'https://example.com/', `${oauthParams}&page=2&status=hi`),
      ),
    )
  })

  test('parentheses in form data are encoded (#113)', async () => {
    const request = new Request('https://example.com/', form('q=(x)'))
    expect(await signature(request, options)).toBe(
      await hmac(
        'SHA-1',
        's&',
        baseString('POST', 'https://example.com/', `${oauthParams}&q=%28x%29`),
      ),
    )
  })

  test('the PLAINTEXT signature is percent-encoded in the header (#64)', async () => {
    const header = await OAuth1.authorization(new Request('https://example.com/'), {
      signatureMethod: 'PLAINTEXT',
      consumer: { key: 'k', secret: 'a b' },
      token: { key: 't', secret: 'c&d' },
    })
    expect(header).toContain('oauth_signature="a%2520b%26c%2526d"')
  })

  test('a multipart body is not signed', async () => {
    const body = new FormData()
    body.set('status', 'hi')
    const request = new Request('https://example.com/', { method: 'POST', body })
    expect(await signature(request, options)).toBe(
      await hmac('SHA-1', 's&', baseString('POST', 'https://example.com/', oauthParams)),
    )
  })

  test('Object.prototype properties do not change the signature (#174)', async () => {
    const before = await signature(new Request('https://example.com/?a=1'), options)
    Object.defineProperty(Object.prototype, 'polluted', {
      value: 'x',
      enumerable: true,
      configurable: true,
      writable: true,
    })
    try {
      expect(await signature(new Request('https://example.com/?a=1'), options)).toBe(before)
    } finally {
      delete (Object.prototype as Record<string, unknown>).polluted
    }
  })
})
