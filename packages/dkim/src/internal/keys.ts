import * as Base64 from '@portable/base64'

export type KeyType = 'rsa' | 'ed25519'

const rsa = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const
const ed25519 = { name: 'Ed25519' } as const

const rsaOid = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]
const ed25519Oid = [0x2b, 0x65, 0x70]
const rsaAlgorithmId = sequence(tlv(0x06, rsaOid), [0x05, 0x00])

/** The DKIM key type of a CryptoKey, or `undefined` for any other kind of key. */
export function keyType(key: CryptoKey): KeyType | undefined {
  const { name } = key.algorithm
  if (name === 'Ed25519') return 'ed25519'
  if (
    name === 'RSASSA-PKCS1-v1_5' &&
    (key.algorithm as RsaHashedKeyAlgorithm).hash.name === 'SHA-256'
  )
    return 'rsa'
  return undefined
}

export async function importPrivateKey(input: CryptoKey | string | JsonWebKey): Promise<CryptoKey> {
  if (typeof input !== 'string' && (typeof input !== 'object' || input === null))
    throw new TypeError('privateKey must be a CryptoKey, a PEM string or a JWK.')
  const key = await importKey(input).catch((error: unknown) => {
    throw new RangeError('privateKey is not a valid RSA or Ed25519 private key.', { cause: error })
  })
  if (key.type !== 'private' || !key.usages.includes('sign') || !keyType(key))
    throw new RangeError(
      'privateKey must be an RSA (RSASSA-PKCS1-v1_5 with SHA-256) or Ed25519 private key that can sign.',
    )
  return key
}

async function importKey(input: CryptoKey | string | JsonWebKey): Promise<CryptoKey> {
  if (input instanceof CryptoKey) return input
  if (typeof input === 'string') {
    const pem = /-----BEGIN (RSA )?PRIVATE KEY-----([^-]*)-----END \1?PRIVATE KEY-----/.exec(input)
    if (!pem) throw new RangeError('Expected a PEM "PRIVATE KEY" or "RSA PRIVATE KEY" block.')
    const der = new Uint8Array(Base64.decode(pem[2]!))
    if (pem[1]) return crypto.subtle.importKey('pkcs8', pkcs1ToPkcs8(der), rsa, false, ['sign'])
    return crypto.subtle.importKey('pkcs8', der, pkcs8Algorithm(der), false, ['sign'])
  }
  const algorithm = input.kty === 'OKP' && input.crv === 'Ed25519' ? ed25519 : rsa
  return crypto.subtle.importKey('jwk', input, algorithm, false, ['sign'])
}

function pkcs8Algorithm(der: Uint8Array): typeof rsa | typeof ed25519 {
  const info = children(der, 0)
  const first = info[1] === undefined ? undefined : children(der, info[1])[0]
  const oid = first === undefined ? undefined : contents(der, first)
  if (oid && sameBytes(oid, ed25519Oid)) return ed25519
  if (oid && sameBytes(oid, rsaOid)) return rsa
  throw new RangeError('The PKCS #8 key is neither RSA nor Ed25519.')
}

const pkcs1ToPkcs8 = (der: Uint8Array): Uint8Array<ArrayBuffer> =>
  new Uint8Array(sequence([0x02, 0x01, 0x00], rsaAlgorithmId, tlv(0x04, der)))

/**
 * Imports the `p=` key of a DNS key record. RSA keys are a SubjectPublicKeyInfo or a bare
 * RSAPublicKey (RFC 6376 section 3.6.1), Ed25519 keys the 32 raw bytes (RFC 8463 section 4.2).
 */
export function importPublicKey(type: KeyType, der: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (type === 'ed25519') {
    if (der.length !== 32) return Promise.reject(new TypeError('An Ed25519 key is 32 bytes.'))
    return crypto.subtle.importKey('raw', der, ed25519, false, ['verify'])
  }
  const first = children(der, 0)[0]
  const spki =
    first !== undefined && der[first] === 0x02
      ? new Uint8Array(sequence(rsaAlgorithmId, tlv(0x03, [0x00, ...der])))
      : der
  return crypto.subtle.importKey('spki', spki, rsa, false, ['verify'])
}

function tlv(tag: number, content: ArrayLike<number>): number[] {
  const length = content.length
  const header =
    length < 0x80
      ? [length]
      : length < 0x100
        ? [0x81, length]
        : length < 0x10000
          ? [0x82, length >> 8, length & 0xff]
          : [0x83, length >> 16, (length >> 8) & 0xff, length & 0xff]
  return [tag, ...header, ...Array.from(content)]
}

function sequence(...parts: number[][]): number[] {
  return tlv(0x30, parts.flat())
}

function readHeader(der: Uint8Array, at: number): { start: number; end: number } | undefined {
  let length = der[at + 1]
  if (length === undefined) return undefined
  let start = at + 2
  if (length >= 0x80) {
    const size = length & 0x7f
    if (size === 0 || size > 3) return undefined
    length = 0
    for (let i = 0; i < size; i++) length = (length << 8) | (der[start + i] ?? 0)
    start += size
  }
  const end = start + length
  return end <= der.length ? { start, end } : undefined
}

function contents(der: Uint8Array, at: number): Uint8Array | undefined {
  const header = readHeader(der, at)
  return header && der.subarray(header.start, header.end)
}

/** The offsets of the elements inside the constructed element at `at`. */
function children(der: Uint8Array, at: number): number[] {
  const header = readHeader(der, at)
  const offsets: number[] = []
  if (!header) return offsets
  for (let offset = header.start; offset < header.end;) {
    const child = readHeader(der, offset)
    if (!child) break
    offsets.push(offset)
    offset = child.end
  }
  return offsets
}

const sameBytes = (bytes: Uint8Array, expected: readonly number[]): boolean =>
  bytes.length === expected.length && expected.every((byte, i) => bytes[i] === byte)
