import * as Base64 from '@portable/base64'

export const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text)

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

export type Digest = 'sha1' | 'sha256' | 'sha512'

const identifiers: Record<Digest, string> = {
  sha1: 'pbkdf2',
  sha256: 'pbkdf2-sha256',
  sha512: 'pbkdf2-sha512',
}

/** Builds the PHC string for a known PBKDF2 output, as `Password.hash` would write it. */
export function phc(
  digest: Digest,
  iterations: number,
  salt: string | Uint8Array,
  hash: Uint8Array,
): string {
  const b64 = (bytes: string | Uint8Array) => Base64.encode(bytes, { omitPadding: true })
  return `$${identifiers[digest]}$i=${iterations}$${b64(salt)}$${b64(hash)}`
}

/** Splits a PHC string from `Password.hash` into the values a PBKDF2 implementation takes. */
export function parsePhc(stored: string): {
  iterations: number
  salt: Uint8Array
  hash: Uint8Array
} {
  const match = /^\$pbkdf2-sha256\$i=(\d+)\$([\w+/]+)\$([\w+/]+)$/.exec(stored)
  if (!match) throw new Error(`Not a PHC string from Password.hash: ${stored}`)
  return {
    iterations: Number(match[1]),
    salt: Base64.decode(match[2]!),
    hash: Base64.decode(match[3]!),
  }
}

/** Flips one bit of the hash in a PHC string. */
export function tamper(stored: string): string {
  const fields = stored.split('$')
  const hash = Base64.decode(fields[4]!.replaceAll('.', '+'))
  hash[0] = hash[0]! ^ 1
  fields[4] = Base64.encode(hash, { omitPadding: true })
  return fields.join('$')
}

export function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}
