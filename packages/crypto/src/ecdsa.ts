import { InvalidInputError } from './errors.js'

/** An ECDSA curve, named as WebCrypto names it. */
export type NamedCurve = 'P-256' | 'P-384' | 'P-521'

const sizes: Record<NamedCurve, number> = { 'P-256': 32, 'P-384': 48, 'P-521': 66 }

export declare namespace derToRawEcdsa {
  type Options = {
    /** The curve of the key that made the signature. It sets the width of `r` and `s`. @default 'P-256' */
    namedCurve?: NamedCurve | undefined
  }
}

/**
 * Converts a DER-encoded ECDSA signature, as WebAuthn and OpenSSL produce, into the raw `r || s`
 * form that `crypto.subtle.verify` and JWS (ES256, ES384, ES512) use. Only strict DER is accepted:
 * BER length forms, extra leading zeros, negative integers and trailing bytes throw.
 *
 * @example
 * ```ts
 * import * as Crypto from '@portable/crypto'
 *
 * const raw = Crypto.derToRawEcdsa(assertion.signature)
 * await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, raw, signedData)
 * ```
 */
export function derToRawEcdsa(
  signature: Uint8Array,
  options: derToRawEcdsa.Options = {},
): Uint8Array<ArrayBuffer> {
  const size = sizes[options.namedCurve ?? 'P-256']
  if (signature[0] !== 0x30) throw new InvalidInputError('Expected a DER SEQUENCE')
  let length = signature[1] ?? 0
  let offset = 2
  if (length === 0x81) {
    length = signature[2] ?? 0
    offset = 3
    if (length < 0x80)
      throw new InvalidInputError('The SEQUENCE length is not in its shortest form')
  } else if (length >= 0x80) {
    throw new InvalidInputError('The SEQUENCE length is too long for an ECDSA signature')
  }
  if (length !== signature.length - offset)
    throw new InvalidInputError(
      `The SEQUENCE is ${length} bytes, but ${signature.length - offset} bytes follow its header`,
    )
  const raw = new Uint8Array(size * 2)
  offset = readInteger(signature, offset, raw, 0, size)
  offset = readInteger(signature, offset, raw, size, size)
  if (offset !== signature.length)
    throw new InvalidInputError('The SEQUENCE holds more than two INTEGERs')
  return raw
}

function readInteger(
  der: Uint8Array,
  offset: number,
  raw: Uint8Array,
  at: number,
  size: number,
): number {
  if (der[offset] !== 0x02) throw new InvalidInputError('Expected a DER INTEGER')
  const length = der[offset + 1] ?? 0
  if (length === 0 || length >= 0x80) throw new InvalidInputError('Invalid INTEGER length')
  let start = offset + 2
  const end = start + length
  if (end > der.length) throw new InvalidInputError('The INTEGER runs past the end of the SEQUENCE')
  if (der[start]! & 0x80) throw new InvalidInputError('The INTEGER is negative')
  if (der[start] === 0 && length > 1) {
    if (!(der[start + 1]! & 0x80))
      throw new InvalidInputError('The INTEGER has a leading zero it does not need')
    start++
  }
  if (end - start > size)
    throw new InvalidInputError(`The INTEGER is longer than the curve's ${size} bytes`)
  raw.set(der.subarray(start, end), at + size - (end - start))
  return end
}

/**
 * Converts a raw `r || s` ECDSA signature, as `crypto.subtle.sign` and JWS produce, into DER.
 * The curve follows from the length: 64 bytes for P-256, 96 for P-384 and 132 for P-521.
 *
 * @example
 * ```ts
 * import * as Crypto from '@portable/crypto'
 *
 * const raw = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, data)
 * const der = Crypto.rawToDerEcdsa(new Uint8Array(raw))
 * ```
 */
export function rawToDerEcdsa(signature: Uint8Array): Uint8Array<ArrayBuffer> {
  const size = signature.length / 2
  if (size !== 32 && size !== 48 && size !== 66)
    throw new InvalidInputError(
      `A raw ECDSA signature is 64, 96 or 132 bytes, not ${signature.length}`,
    )
  const r = trimInteger(signature.subarray(0, size))
  const s = trimInteger(signature.subarray(size))
  const length = 4 + r.length + s.length + (r[0]! & 0x80 ? 1 : 0) + (s[0]! & 0x80 ? 1 : 0)
  const der = new Uint8Array(length + (length < 0x80 ? 2 : 3))
  let offset = 0
  der[offset++] = 0x30
  if (length >= 0x80) der[offset++] = 0x81
  der[offset++] = length
  offset = writeInteger(der, offset, r)
  writeInteger(der, offset, s)
  return der
}

function trimInteger(bytes: Uint8Array): Uint8Array {
  let start = 0
  while (start < bytes.length - 1 && bytes[start] === 0) start++
  return bytes.subarray(start)
}

function writeInteger(der: Uint8Array, offset: number, value: Uint8Array): number {
  const pad = value[0]! & 0x80 ? 1 : 0
  der[offset++] = 0x02
  der[offset++] = value.length + pad
  offset += pad
  der.set(value, offset)
  return offset + value.length
}
