import { describe, expect, test } from 'vite-plus/test'
import * as WebCrypto from '@portable/web-crypto'
import p256 from './fixtures/wycheproof/ecdsa_secp256r1_sha256_test.json' with { type: 'json' }
import p384 from './fixtures/wycheproof/ecdsa_secp384r1_sha384_test.json' with { type: 'json' }
import p521 from './fixtures/wycheproof/ecdsa_secp521r1_sha512_test.json' with { type: 'json' }
import { encode, fromBase64, fromHex, toHex, type WycheproofEcdsa } from './utils.js'

const curves = [
  { namedCurve: 'P-256', size: 32 },
  { namedCurve: 'P-384', size: 48 },
  { namedCurve: 'P-521', size: 66 },
] as const

describe('derToRawEcdsa (ecdsa-sig-formatter)', () => {
  for (const { namedCurve, size } of curves) {
    const convert = (der: Uint8Array) => () => WebCrypto.derToRawEcdsa(der, { namedCurve })
    const bytes = (length: number, head: readonly number[]) => {
      const der = new Uint8Array(length)
      der.set(head)
      return der
    }

    describe(`${namedCurve}`, () => {
      test('rejects input without a SEQUENCE', () => {
        expect(convert(bytes(10, [0x31]))).toThrow(WebCrypto.InvalidInputError)
      })

      test('rejects a SEQUENCE length longer than the input', () => {
        expect(convert(bytes(10, [0x30, 10]))).toThrow(WebCrypto.InvalidInputError)
      })

      test('rejects r that is not an INTEGER', () => {
        expect(convert(bytes(10, [0x30, 8, 0x03]))).toThrow(WebCrypto.InvalidInputError)
      })

      test('rejects an r length longer than the input', () => {
        expect(convert(bytes(10, [0x30, 8, 0x02, 7]))).toThrow(WebCrypto.InvalidInputError)
      })

      test('rejects an r longer than the curve allows', () => {
        const der = bytes(size + 8, [0x30, size + 6, 0x02, size + 2, 0x01])
        expect(convert(der)).toThrow(WebCrypto.InvalidInputError)
      })

      test('rejects s that is not an INTEGER', () => {
        expect(convert(bytes(10, [0x30, 8, 0x02, 2, 0, 0x80, 0x03]))).toThrow(
          WebCrypto.InvalidInputError,
        )
      })

      test('rejects an s length longer than the input', () => {
        expect(convert(bytes(10, [0x30, 8, 0x02, 1, 1, 0x02, 4]))).toThrow(
          WebCrypto.InvalidInputError,
        )
      })

      test('rejects bytes after s', () => {
        expect(convert(bytes(10, [0x30, 8, 0x02, 1, 1, 0x02, 1, 1]))).toThrow(
          WebCrypto.InvalidInputError,
        )
      })

      test('rejects an s longer than the curve allows', () => {
        const der = bytes(size + 9, [0x30, size + 7, 0x02, 1, 1, 0x02, size + 2, 0x01])
        expect(convert(der)).toThrow(WebCrypto.InvalidInputError)
      })
    })
  }
})

describe('rawToDerEcdsa (ecdsa-sig-formatter)', () => {
  test.each([0, 63, 65, 95, 97, 131, 133])('rejects a %i-byte signature', (length) => {
    expect(() => WebCrypto.rawToDerEcdsa(new Uint8Array(length))).toThrow(
      WebCrypto.InvalidInputError,
    )
  })
})

describe('round trips (ecdsa-sig-formatter)', () => {
  const vectors = [
    {
      namedCurve: 'P-256',
      raw: 'yA4WNemRpUreSh9qgMh_ePGqhgn328ghJ_HG7WOBKQV98eFNm3FIvweoiSzHvl49Z6YTdV4Up7NDD7UcZ-52cw',
      der: 'MEUCIQD0nDQE4uBS6JuklnyACfPQRB/LMEh5Stq6sAfp38k6ewIgHvhX59iuruBiFpVkg3dQKJ3+Wk29lJmXfxp6ciRdj+Q=',
    },
    {
      namedCurve: 'P-384',
      raw: 'TsS1fXqgq5S2lpjO-Tz5w6ZAKqNFuQ6PufvXRN2NRY2DEsQ3iUXdEcAzcMXNqVehkZ-NwUxdIvDqwKTGLYQYVhjBxkdnwm1T5VKG2v1BYFeDQ91sgBlVhHFzvFty5wCI',
      der: 'MGUCMADcY5icKo+sLF0YCh5eVzju55Elt3Dfu4geMMDnUlLNaEO8NiCFzCHeqMx7mW5GMwIxAI6sp8ihHjRJ0sn/WV6mZCxN6/5lEg1QZJ5eiUHYv2kBgmiJ/Yv1pnqqFY3gVDBp/g==',
    },
    {
      namedCurve: 'P-521',
      raw: 'AFKapY_5gq60n8NZ_C2iOQFov7sXgcMyDzCrnGsbvE7OlSBKbgj95aZ7GtdSdbw6joK2jjWJio8IgKNB9o11GdMTADfLUsv9oAJvmIApsmsPBAIe1vH8oeHYiDMBEz9OQcwS5eL-r1iO2v7oxzl9zZb1rA5kzBqS93ARCPKbjgcr602r',
      der: 'MIGHAkFgiYpVsYxx6XiQp2OXscRW/PrbEcoime/FftP+B7x4QVa+M3KZzXlfP66zKqjo7O3nwK2s8GbTftW8H4HwojzimwJCAYQNsozTpCo5nwIkBgelcfIQ0y/U/60TbNH1+rlKpFDCFs6Q1ro7R1tjtXoAUb9aPIOVyXGiSQX/+fcmmWs1rkJU',
    },
  ] as const

  for (const { namedCurve, raw, der } of vectors) {
    test(`${namedCurve} raw to DER and back (made with WebCrypto)`, () => {
      const bytes = fromBase64(raw)
      expect(WebCrypto.derToRawEcdsa(WebCrypto.rawToDerEcdsa(bytes), { namedCurve })).toEqual(bytes)
    })

    test(`${namedCurve} DER to raw and back (made with OpenSSL)`, () => {
      const bytes = fromBase64(der)
      expect(WebCrypto.rawToDerEcdsa(WebCrypto.derToRawEcdsa(bytes, { namedCurve }))).toEqual(bytes)
    })
  }

  for (const { namedCurve, size } of curves) {
    test(`${namedCurve} signatures from crypto.subtle verify after a round trip through DER`, async () => {
      const { privateKey, publicKey } = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve },
        false,
        ['sign', 'verify'],
      )
      const algorithm = { name: 'ECDSA', hash: 'SHA-256' }
      for (let i = 0; i < 20; i++) {
        const data = crypto.getRandomValues(new Uint8Array(1 + i * 13))
        const raw = new Uint8Array(await crypto.subtle.sign(algorithm, privateKey, data))
        expect(raw).toHaveLength(size * 2)
        const back = WebCrypto.derToRawEcdsa(WebCrypto.rawToDerEcdsa(raw), { namedCurve })
        expect(back).toEqual(raw)
        expect(await crypto.subtle.verify(algorithm, publicKey, back, data)).toBe(true)
      }
    })
  }
})

describe('rawToDerEcdsa', () => {
  test('writes the shortest DER for small, zero and high-bit integers', () => {
    const raw = new Uint8Array(64)
    raw[31] = 0x01
    raw[32] = 0x80
    expect(toHex(WebCrypto.rawToDerEcdsa(raw))).toBe(`3026020101022100${'80'}${'00'.repeat(31)}`)
    expect(toHex(WebCrypto.rawToDerEcdsa(new Uint8Array(64)))).toBe('3006020100020100')
  })

  test('uses the long length form for P-521 signatures', () => {
    const raw = new Uint8Array(132).fill(0x01)
    const der = WebCrypto.rawToDerEcdsa(raw)
    expect(toHex(der.subarray(0, 6))).toBe('308188024201')
    expect(der).toHaveLength(3 + 2 * (2 + 66))
  })

  test('reads only the bytes a subarray covers', () => {
    const raw = crypto.getRandomValues(new Uint8Array(64))
    const padded = new Uint8Array(70)
    padded.set(raw, 3)
    expect(WebCrypto.rawToDerEcdsa(padded.subarray(3, 67))).toEqual(WebCrypto.rawToDerEcdsa(raw))
  })
})

describe('derToRawEcdsa', () => {
  test('reads P-256 by default', () => {
    expect(WebCrypto.derToRawEcdsa(fromHex('3006020101020102'))).toEqual(
      fromHex(`${'00'.repeat(31)}01${'00'.repeat(31)}02`),
    )
  })

  test.each([
    ['an indefinite SEQUENCE length', '3080020101020101'],
    ['a long-form SEQUENCE length under 128', '308106020101020101'],
    ['a two-byte SEQUENCE length', '30820006020101020101'],
    ['a long-form INTEGER length', '300702810101020101'],
    ['an empty INTEGER', '30050200020101'],
    ['a negative INTEGER', '3006020181020101'],
    ['an unneeded leading zero', '300702020001020101'],
    ['an empty input', ''],
    ['a SEQUENCE header alone', '30'],
  ])('rejects %s', (_, hex) => {
    expect(() => WebCrypto.derToRawEcdsa(fromHex(hex))).toThrow(WebCrypto.InvalidInputError)
  })

  test('rejects a 33-byte r instead of dropping its top byte', () => {
    const der = fromHex(`3026022101${'11'.repeat(32)}020101`)
    expect(() => WebCrypto.derToRawEcdsa(der)).toThrow(WebCrypto.InvalidInputError)
  })
})

describe('Wycheproof', () => {
  const suites = [
    [p256.groups, 'P-256', 'SHA-256'],
    [p384.groups, 'P-384', 'SHA-384'],
    [p521.groups, 'P-521', 'SHA-512'],
  ] satisfies [WycheproofEcdsa['groups'], WebCrypto.NamedCurve, string][]
  const encodingFlags = new Set(['BerEncodedSignature', 'InvalidEncoding', 'MissingZero'])

  for (const [groups, namedCurve, hash] of suites) {
    test(`${namedCurve} with ${hash}: valid signatures convert and verify, invalid ones throw or fail`, async () => {
      const wrong = new Array<string>()
      let checked = 0
      for (const group of groups) {
        const publicKey = await crypto.subtle.importKey(
          'spki',
          fromHex(group.publicKeyDer),
          { name: 'ECDSA', namedCurve },
          false,
          ['verify'],
        )
        const outcome = async (sig: string, msg: string): Promise<string> => {
          let raw: Uint8Array<ArrayBuffer>
          try {
            raw = WebCrypto.derToRawEcdsa(fromHex(sig), { namedCurve })
          } catch (error) {
            return error instanceof WebCrypto.InvalidInputError ? 'rejected' : String(error)
          }
          if (toHex(WebCrypto.rawToDerEcdsa(raw)) !== sig) return 'converted to different DER'
          const algorithm = { name: 'ECDSA', hash }
          return (await crypto.subtle.verify(algorithm, publicKey, raw, fromHex(msg)))
            ? 'verified'
            : 'not verified'
        }
        for (const { tcId, flags, msg, sig, result } of group.tests) {
          const actual = await outcome(sig, msg)
          const expected =
            result === 'valid'
              ? ['verified']
              : flags.some((flag) => encodingFlags.has(flag))
                ? ['rejected']
                : ['rejected', 'not verified', 'converted to different DER']
          if (!expected.includes(actual))
            wrong.push(`tcId ${tcId} (${flags.join(', ')}): ${actual}`)
          checked++
        }
      }
      expect(wrong).toEqual([])
      expect(checked).toBe(groups.reduce((count, group) => count + group.tests.length, 0))
    })
  }
})

test('derToRawEcdsa turns a WebAuthn-style DER signature into one crypto.subtle verifies', async () => {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  )
  const data = encode('authenticatorData || clientDataHash')
  const algorithm = { name: 'ECDSA', hash: 'SHA-256' }
  const der = WebCrypto.rawToDerEcdsa(
    new Uint8Array(await crypto.subtle.sign(algorithm, privateKey, data)),
  )
  expect(der[0]).toBe(0x30)
  expect(await crypto.subtle.verify(algorithm, publicKey, WebCrypto.derToRawEcdsa(der), data)).toBe(
    true,
  )
})
