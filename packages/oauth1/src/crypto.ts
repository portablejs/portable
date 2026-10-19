import * as Base64 from '@portable/base64'

/** A hash algorithm, named as WebCrypto names it. */
export type HashAlgorithm = 'SHA-1' | 'SHA-256'

/**
 * Hashes bytes, sync or async. The default is `crypto.subtle.digest`. `@noble/hashes` is sync and
 * 4 to 8 times faster on Node.
 *
 * @example
 * ```ts
 * import { sha1 } from '@noble/hashes/legacy.js'
 * import { sha256 } from '@noble/hashes/sha2.js'
 * import type * as OAuth1 from '@portable/oauth1'
 *
 * const digest: OAuth1.Digest = (algorithm, data) =>
 *   algorithm === 'SHA-1' ? sha1(data) : sha256(data)
 * ```
 */
export type Digest = (
  algorithm: HashAlgorithm,
  data: Uint8Array<ArrayBuffer>,
) => Uint8Array | Promise<Uint8Array>

export const subtleDigest: Digest = async (algorithm, data) =>
  new Uint8Array(await crypto.subtle.digest(algorithm, data))

const blockSize = 64

/** RFC 2104 over the caller's `digest`. SHA-1 and SHA-256 both use 64-byte blocks. */
export async function hmac(
  digest: Digest,
  algorithm: HashAlgorithm,
  secret: Uint8Array<ArrayBuffer>,
  data: Uint8Array,
): Promise<Uint8Array> {
  const key = secret.length > blockSize ? await digest(algorithm, secret) : secret
  const inner = new Uint8Array(blockSize + data.length)
  for (let i = 0; i < blockSize; i++) inner[i] = (key[i] ?? 0) ^ 0x36
  inner.set(data, blockSize)
  const innerHash = await digest(algorithm, inner)
  const outer = new Uint8Array(blockSize + innerHash.length)
  for (let i = 0; i < blockSize; i++) outer[i] = (key[i] ?? 0) ^ 0x5c
  outer.set(innerHash, blockSize)
  return digest(algorithm, outer)
}

const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }
const pem = /-----BEGIN (RSA )?PRIVATE KEY-----([^-]*)-----END \1?PRIVATE KEY-----/

export async function rsaSha1(
  privateKey: CryptoKey | string,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  const key = typeof privateKey === 'string' ? await importPem(privateKey) : privateKey
  const { name, hash } = key.algorithm as Partial<RsaHashedKeyAlgorithm>
  if (name !== algorithm.name || hash?.name !== algorithm.hash)
    throw new RangeError(
      `RSA-SHA1 needs an RSASSA-PKCS1-v1_5 key with SHA-1, not ${name} with ${hash?.name}`,
    )
  try {
    return new Uint8Array(await crypto.subtle.sign(algorithm.name, key, data))
  } catch (cause) {
    // A PEM key whose numbers are inconsistent imports, then fails here with an OperationError.
    throw new InvalidInputError('The RSA private key can not sign', { cause })
  }
}

async function importPem(text: string): Promise<CryptoKey> {
  const match = pem.exec(text)
  if (!match) throw new RangeError('Expected a PEM "PRIVATE KEY" or "RSA PRIVATE KEY" block')
  let decoded: Uint8Array
  try {
    decoded = Base64.decode(match[2]!)
  } catch (cause) {
    throw new RangeError('The PEM block is not valid base64', { cause })
  }
  const der = match[1] ? pkcs1ToPkcs8(decoded) : new Uint8Array(decoded)
  try {
    return await crypto.subtle.importKey('pkcs8', der, algorithm, false, ['sign'])
  } catch (cause) {
    throw new RangeError('The PEM block is not an RSA private key', { cause })
  }
}

const rsaEncryption = [
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
]

/** WebCrypto imports only PKCS #8, so a PKCS #1 `RSA PRIVATE KEY` is wrapped in a PrivateKeyInfo. */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const octetString = [0x04, ...derLength(pkcs1.length)]
  const contentLength = 3 + rsaEncryption.length + octetString.length + pkcs1.length
  const head = [
    0x30,
    ...derLength(contentLength),
    0x02,
    0x01,
    0x00,
    ...rsaEncryption,
    ...octetString,
  ]
  const out = new Uint8Array(head.length + pkcs1.length)
  out.set(head)
  out.set(pkcs1, head.length)
  return out
}

function derLength(length: number): number[] {
  if (length < 0x80) return [length]
  const bytes: number[] = []
  for (let n = length; n > 0; n >>>= 8) bytes.unshift(n & 0xff)
  return [0x80 | bytes.length, ...bytes]
}
