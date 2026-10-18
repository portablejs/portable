import { describe, expect, test } from 'vite-plus/test'
import * as OAuth1 from '../index.js'
import { baseString, form, hmac, parseHeader, signature } from './utils.js'

describe('RFC 5849 examples', () => {
  test('§1.2: PLAINTEXT temporary credentials request with realm and callback', async () => {
    const header = await OAuth1.authorization(
      new Request('https://photos.example.net/initiate', { method: 'POST' }),
      {
        signatureMethod: 'PLAINTEXT',
        consumer: { key: 'dpf43f3p2l4k3l03', secret: 'kd94hf93k423kf44' },
        realm: 'Photos',
        callback: 'http://printer.example.com/ready',
        nonce: 'wIjqoS',
        timestamp: 137131200,
      },
    )
    expect(header).toBe(
      'OAuth realm="Photos", oauth_callback="http%3A%2F%2Fprinter.example.com%2Fready", oauth_consumer_key="dpf43f3p2l4k3l03", oauth_nonce="wIjqoS", oauth_signature="kd94hf93k423kf44%26", oauth_signature_method="PLAINTEXT", oauth_timestamp="137131200", oauth_version="1.0"',
    )
  })

  test('§1.2: verifier is sent and signed', async () => {
    const options = {
      consumer: { key: 'dpf43f3p2l4k3l03', secret: 'kd94hf93k423kf44' },
      token: { key: 'hh5s93j4hdidpola', secret: 'hdhd0244k9j7ao03' },
      verifier: 'hfdp7dh39dks9884',
      nonce: 'walatlh',
      timestamp: 137131201,
    }
    const request = () => new Request('https://photos.example.net/token', { method: 'POST' })
    const params = parseHeader(await OAuth1.authorization(request(), options))
    expect(params.oauth_verifier).toBe('hfdp7dh39dks9884')
    const base = baseString(
      'POST',
      'https://photos.example.net/token',
      'oauth_consumer_key=dpf43f3p2l4k3l03&oauth_nonce=walatlh&oauth_signature_method=HMAC-SHA1&oauth_timestamp=137131201&oauth_token=hh5s93j4hdidpola&oauth_verifier=hfdp7dh39dks9884&oauth_version=1.0',
    )
    expect(params.oauth_signature).toBe(
      await hmac('SHA-1', 'kd94hf93k423kf44&hdhd0244k9j7ao03', base),
    )
  })

  // The RFC's base string has no oauth_version, which this package always sends, so it is added here.
  test('§3.4.1: query, form body, duplicates, empty values and realm', async () => {
    const request = new Request(
      'http://example.com/request?b5=%3D%253D&a3=a&c%40=&a2=r%20b',
      form('c2&a3=2+q'),
    )
    const actual = await signature(request, {
      consumer: { key: '9djdj82h48djs9d2', secret: 'j49sk3j29djd' },
      token: { key: 'kkk9d7dh3k39sjv7', secret: 'dh893hdasih9' },
      realm: 'Example',
      nonce: '7d8f3e4a',
      timestamp: 137131201,
    })
    const base = baseString(
      'POST',
      'http://example.com/request',
      'a2=r%20b&a3=2%20q&a3=a&b5=%3D%253D&c%40=&c2=&oauth_consumer_key=9djdj82h48djs9d2&oauth_nonce=7d8f3e4a&oauth_signature_method=HMAC-SHA1&oauth_timestamp=137131201&oauth_token=kkk9d7dh3k39sjv7&oauth_version=1.0',
    )
    expect(actual).toBe(await hmac('SHA-1', 'j49sk3j29djd&dh893hdasih9', base))
  })

  test('§3.4.1.2: scheme and host are lowercased and the default port is dropped', async () => {
    const options = { consumer: { key: 'k', secret: 's' }, nonce: 'n', timestamp: 1 }
    const base = baseString(
      'GET',
      'http://example.com/r%20v/X',
      'id=123&oauth_consumer_key=k&oauth_nonce=n&oauth_signature_method=HMAC-SHA1&oauth_timestamp=1&oauth_version=1.0',
    )
    expect(await signature(new Request('HTTP://EXAMPLE.COM:80/r%20v/X?id=123'), options)).toBe(
      await hmac('SHA-1', 's&', base),
    )
  })

  test('§3.4.1.2: a non-default port is kept', async () => {
    const options = { consumer: { key: 'k', secret: 's' }, nonce: 'n', timestamp: 1 }
    const base = baseString(
      'GET',
      'https://www.example.net:8080/',
      'oauth_consumer_key=k&oauth_nonce=n&oauth_signature_method=HMAC-SHA1&oauth_timestamp=1&oauth_version=1.0&q=1',
    )
    expect(await signature(new Request('https://www.example.net:8080/?q=1'), options)).toBe(
      await hmac('SHA-1', 's&', base),
    )
  })

  test('§3.4.4: PLAINTEXT signs with the encoded secrets joined by "&"', async () => {
    const actual = await signature(new Request('https://example.com/'), {
      signatureMethod: 'PLAINTEXT',
      consumer: { key: 'k', secret: 'j49sk3j29djd' },
      token: { key: 't', secret: 'dh893hdasih9' },
    })
    expect(actual).toBe('j49sk3j29djd&dh893hdasih9')
  })

  test('§3.6: unreserved characters stay, everything else is UTF-8 percent-encoded', async () => {
    const header = await OAuth1.authorization(new Request('https://example.com/'), {
      signatureMethod: 'PLAINTEXT',
      consumer: { key: "aZ09-._~ !*'()é😀", secret: 's' },
    })
    expect(header).toContain('oauth_consumer_key="aZ09-._~%20%21%2A%27%28%29%C3%A9%F0%9F%98%80"')
  })

  test('§3.6: a lone surrogate is encoded as U+FFFD, as TextEncoder does', async () => {
    const header = await OAuth1.authorization(new Request('https://example.com/'), {
      signatureMethod: 'PLAINTEXT',
      consumer: { key: `a${String.fromCharCode(0xd800)}b`, secret: 's' },
    })
    expect(header).toContain('oauth_consumer_key="a%EF%BF%BDb"')
  })

  test('OAuth Core 1.0 §A.5.2 example signature', async () => {
    const actual = await signature(
      new Request('http://photos.example.net/photos?file=vacation.jpg&size=original'),
      {
        consumer: { key: 'dpf43f3p2l4k3l03', secret: 'kd94hf93k423kf44' },
        token: { key: 'nnch734d00sl2jdk', secret: 'pfkkdhi9sl3r4s00' },
        nonce: 'kllo9940pd9333jh',
        timestamp: 1191242096,
      },
    )
    expect(actual).toBe('tR3+Ty81lMeYAr/Fid0kMTYa/WM=')
  })
})
