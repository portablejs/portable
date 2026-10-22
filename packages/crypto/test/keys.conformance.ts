import { describe, expect, test } from 'vite-plus/test'
import * as Crypto from '@portable/crypto'
import { encode, fromHex, toHex } from './utils.js'
import { ed25519Rfc8032, x25519Rfc7748 } from './vectors.js'

describe('importSeed Ed25519 (RFC 8032)', () => {
  for (const vector of ed25519Rfc8032) {
    test(`TEST ${vector.name}`, async () => {
      const { privateKey, publicKey } = await Crypto.importSeed(
        'Ed25519',
        fromHex(vector.secretKey),
      )
      expect(toHex(await crypto.subtle.exportKey('raw', publicKey))).toBe(vector.publicKey)
      const message = fromHex(vector.message)
      const signature = await crypto.subtle.sign('Ed25519', privateKey, message)
      expect(toHex(signature)).toBe(vector.signature)
      expect(await crypto.subtle.verify('Ed25519', publicKey, signature, message)).toBe(true)
    })
  }
})

describe('importSeed X25519 (RFC 7748)', () => {
  const { alicePrivate, alicePublic, bobPrivate, bobPublic, shared } = x25519Rfc7748.diffieHellman

  test('computes both public keys and the shared secret of section 6.1', async () => {
    const alice = await Crypto.importSeed('X25519', fromHex(alicePrivate))
    const bob = await Crypto.importSeed('X25519', fromHex(bobPrivate))
    expect(toHex(await crypto.subtle.exportKey('raw', alice.publicKey))).toBe(alicePublic)
    expect(toHex(await crypto.subtle.exportKey('raw', bob.publicKey))).toBe(bobPublic)
    const aliceShared = await crypto.subtle.deriveBits(
      { name: 'X25519', public: bob.publicKey },
      alice.privateKey,
      256,
    )
    const bobShared = await crypto.subtle.deriveBits(
      { name: 'X25519', public: alice.publicKey },
      bob.privateKey,
      256,
    )
    expect(toHex(aliceShared)).toBe(shared)
    expect(toHex(bobShared)).toBe(shared)
  })

  for (const [i, { scalar, u, output }] of x25519Rfc7748.scalarMultiplication.entries()) {
    test(`multiplies the scalar of section 5.2 vector ${i + 1}`, async () => {
      const { privateKey } = await Crypto.importSeed('X25519', fromHex(scalar))
      const point = await crypto.subtle.importKey('raw', fromHex(u), 'X25519', true, [])
      const bits = await crypto.subtle.deriveBits(
        { name: 'X25519', public: point },
        privateKey,
        256,
      )
      expect(toHex(bits)).toBe(output)
    })
  }
})

describe('importSeed', () => {
  const seed = fromHex(ed25519Rfc8032[0]!.secretKey)

  test('returns a private key that cannot be exported by default', async () => {
    const { privateKey, publicKey } = await Crypto.importSeed('Ed25519', seed)
    expect(privateKey.extractable).toBe(false)
    expect(privateKey.usages).toEqual(['sign'])
    expect(publicKey.extractable).toBe(true)
    expect(publicKey.usages).toEqual(['verify'])
    await expect(crypto.subtle.exportKey('pkcs8', privateKey)).rejects.toMatchObject({
      name: 'InvalidAccessError',
    })
  })

  test('returns an exportable private key with extractable: true', async () => {
    const { privateKey } = await Crypto.importSeed('Ed25519', seed, { extractable: true })
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey))
    expect(toHex(pkcs8.subarray(-32))).toBe(toHex(seed))
  })

  test('gives X25519 keys the usages of key agreement', async () => {
    const { privateKey, publicKey } = await Crypto.importSeed('X25519', seed)
    expect([...privateKey.usages].sort()).toEqual(['deriveBits', 'deriveKey'])
    expect(publicKey.usages).toEqual([])
  })

  test.each([0, 31, 33, 64])('rejects a %i-byte seed', async (length) => {
    await expect(Crypto.importSeed('Ed25519', new Uint8Array(length))).rejects.toThrow(
      Crypto.InvalidInputError,
    )
  })

  test('rejects with the reason of an aborted signal', async () => {
    const reason = new Error('stop')
    await expect(
      Crypto.importSeed('Ed25519', seed, { signal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason)
  })
})

describe('publicKeyOf', () => {
  const data = encode('signed data')

  test('returns the Ed25519 public key that verifies the private key signatures', async () => {
    const vector = ed25519Rfc8032[2]!
    const { privateKey } = await Crypto.importSeed('Ed25519', fromHex(vector.secretKey), {
      extractable: true,
    })
    const publicKey = await Crypto.publicKeyOf(privateKey)
    expect(publicKey.type).toBe('public')
    expect(toHex(await crypto.subtle.exportKey('raw', publicKey))).toBe(vector.publicKey)
  })

  test.each(['P-256', 'P-384', 'P-521'] as const)(
    'returns the ECDSA %s public key',
    async (namedCurve) => {
      const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve }, true, [
        'sign',
        'verify',
      ])
      const publicKey = await Crypto.publicKeyOf(pair.privateKey)
      expect(publicKey.usages).toEqual(['verify'])
      expect(await crypto.subtle.exportKey('spki', publicKey)).toEqual(
        await crypto.subtle.exportKey('spki', pair.publicKey),
      )
      const algorithm = { name: 'ECDSA', hash: 'SHA-256' }
      const signature = await crypto.subtle.sign(algorithm, pair.privateKey, data)
      expect(await crypto.subtle.verify(algorithm, publicKey, signature, data)).toBe(true)
    },
  )

  test('returns the ECDH public key, which has no usages', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])
    const publicKey = await Crypto.publicKeyOf(pair.privateKey)
    expect(publicKey.usages).toEqual([])
    expect(await crypto.subtle.exportKey('raw', publicKey)).toEqual(
      await crypto.subtle.exportKey('raw', pair.publicKey),
    )
  })

  test('returns the RSA-PSS public key with its hash', async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        hash: 'SHA-384',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ['sign', 'verify'],
    )
    const publicKey = await Crypto.publicKeyOf(pair.privateKey)
    expect(publicKey.algorithm).toEqual(pair.publicKey.algorithm)
    const algorithm = { name: 'RSA-PSS', saltLength: 48 }
    const signature = await crypto.subtle.sign(algorithm, pair.privateKey, data)
    expect(await crypto.subtle.verify(algorithm, publicKey, signature, data)).toBe(true)
  })

  test('returns the RSA-OAEP public key, which encrypts what the private key decrypts', async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ['encrypt', 'decrypt'],
    )
    const publicKey = await Crypto.publicKeyOf(pair.privateKey)
    expect(publicKey.usages).toEqual(['encrypt'])
    const ciphertext = await crypto.subtle.encrypt('RSA-OAEP', publicKey, data)
    expect(
      new Uint8Array(await crypto.subtle.decrypt('RSA-OAEP', pair.privateKey, ciphertext)),
    ).toEqual(data)
  })

  test('rejects a private key that cannot be exported', async () => {
    const { privateKey } = await Crypto.importSeed('Ed25519', fromHex(ed25519Rfc8032[0]!.secretKey))
    await expect(Crypto.publicKeyOf(privateKey)).rejects.toThrow(Crypto.InvalidInputError)
  })

  test('rejects a public key and a secret key', async () => {
    const { publicKey } = await Crypto.importSeed('Ed25519', fromHex(ed25519Rfc8032[0]!.secretKey))
    await expect(Crypto.publicKeyOf(publicKey)).rejects.toThrow(Crypto.InvalidInputError)
    const secret = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, true, [
      'sign',
    ])
    await expect(Crypto.publicKeyOf(secret)).rejects.toThrow(Crypto.InvalidInputError)
  })
})
