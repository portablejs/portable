import { describe, expect, test } from 'vite-plus/test'
import * as WebCrypto from '@portable/web-crypto'
import { encode, fromHex, offsetView, toHex } from './utils.js'
import { hkdfRfc5869, hmacRfc4231 } from './vectors.js'

describe('digest', () => {
  test.each([
    ['SHA-1', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
    ['SHA-256', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'SHA-384',
      'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
    ],
    [
      'SHA-512',
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    ],
  ] as const)('hashes "abc" with %s (FIPS 180-2)', async (hash, expected) => {
    expect(toHex(await WebCrypto.digest(hash, 'abc'))).toBe(expected)
  })

  test('hashes the empty string', async () => {
    expect(toHex(await WebCrypto.digest('SHA-256', ''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  test('hashes a string as its UTF-8 bytes', async () => {
    expect(await WebCrypto.digest('SHA-256', 'héllo €')).toEqual(
      await WebCrypto.digest('SHA-256', encode('héllo €')),
    )
  })

  test('hashes only the bytes a subarray covers', async () => {
    const data = encode('abc')
    expect(await WebCrypto.digest('SHA-256', offsetView(data))).toEqual(
      await WebCrypto.digest('SHA-256', data),
    )
  })

  test('returns bytes backed by an ArrayBuffer', async () => {
    const hash = (await WebCrypto.digest('SHA-256', 'abc')) satisfies Uint8Array<ArrayBuffer>
    expect(hash.buffer).toBeInstanceOf(ArrayBuffer)
    expect(hash.byteLength).toBe(hash.buffer.byteLength)
  })

  test('rejects with the reason of an aborted signal', async () => {
    const reason = new Error('stop')
    await expect(
      WebCrypto.digest('SHA-256', 'abc', { signal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason)
  })
})

describe('hmac (RFC 4231)', () => {
  for (const vector of hmacRfc4231) {
    for (const [hash, expected] of [
      ['SHA-256', vector.sha256],
      ['SHA-384', vector.sha384],
      ['SHA-512', vector.sha512],
    ] as const) {
      test(`test case ${vector.case} with ${hash}`, async () => {
        const mac = await WebCrypto.hmac(hash, fromHex(vector.key), fromHex(vector.data))
        // Test case 5 lists only the first 128 bits.
        expect(toHex(mac).slice(0, expected.length)).toBe(expected)
        expect(mac.length).toBe(Number(hash.slice(4)) / 8)
      })
    }
  }
})

describe('hmac', () => {
  test('reads a string key and string data as UTF-8', async () => {
    expect(toHex(await WebCrypto.hmac('SHA-256', 'Jefe', 'what do ya want for nothing?'))).toBe(
      hmacRfc4231[1]!.sha256,
    )
  })

  test('accepts an empty key', async () => {
    // Expected values from Python's hmac module.
    expect(toHex(await WebCrypto.hmac('SHA-256', '', ''))).toBe(
      'b613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad',
    )
    expect(toHex(await WebCrypto.hmac('SHA-1', new Uint8Array(0), 'abc'))).toBe(
      '9b4a918f398d74d3e367970aba3cbe54e4d2b5d9',
    )
  })

  test('uses only the bytes subarrays cover', async () => {
    const key = encode('key')
    const data = encode('data')
    expect(await WebCrypto.hmac('SHA-256', offsetView(key), offsetView(data))).toEqual(
      await WebCrypto.hmac('SHA-256', key, data),
    )
  })

  test('rejects with the reason of an aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      WebCrypto.hmac('SHA-256', 'key', 'data', { signal: controller.signal }),
    ).rejects.toBe(controller.signal.reason)
  })
})

describe('hkdf (RFC 5869)', () => {
  for (const vector of hkdfRfc5869) {
    test(`test case ${vector.case} with ${vector.hash}`, async () => {
      const okm = await WebCrypto.hkdf(vector.hash, fromHex(vector.ikm), {
        info: fromHex(vector.info),
        length: vector.length,
        ...(vector.salt === null ? {} : { salt: fromHex(vector.salt) }),
      })
      expect(toHex(okm)).toBe(vector.okm)
    })
  }
})

describe('hkdf', () => {
  test('derives as many bytes as the hash by default', async () => {
    expect(await WebCrypto.hkdf('SHA-256', 'secret')).toHaveLength(32)
    expect(await WebCrypto.hkdf('SHA-512', 'secret')).toHaveLength(64)
  })

  test('reads string key, salt and info as UTF-8', async () => {
    expect(
      await WebCrypto.hkdf('SHA-256', 'key', { info: 'info', length: 16, salt: 'salt' }),
    ).toEqual(
      await WebCrypto.hkdf('SHA-256', encode('key'), {
        info: encode('info'),
        length: 16,
        salt: encode('salt'),
      }),
    )
  })

  test('derives up to 255 blocks and rejects more', async () => {
    expect(await WebCrypto.hkdf('SHA-256', 'key', { length: 255 * 32 })).toHaveLength(255 * 32)
    await expect(WebCrypto.hkdf('SHA-256', 'key', { length: 255 * 32 + 1 })).rejects.toMatchObject({
      name: 'OperationError',
    })
  })

  test('accepts an empty key', async () => {
    expect(await WebCrypto.hkdf('SHA-256', new Uint8Array(0), { length: 32 })).toHaveLength(32)
  })

  test('rejects with the reason of an aborted signal', async () => {
    const reason = new Error('stop')
    await expect(
      WebCrypto.hkdf('SHA-256', 'key', { signal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason)
  })
})
