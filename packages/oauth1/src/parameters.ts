export type Pair = [name: string, value: string]

const utf8 = new TextEncoder()
const hex = '0123456789ABCDEF'
const unreserved = /* @__PURE__ */ (() => {
  const table = new Uint8Array(128)
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~') {
    table[c.charCodeAt(0)] = 1
  }
  return table
})()
const plain = /^[A-Za-z0-9._~-]*$/

/**
 * Percent-encodes as RFC 5849 §3.6 requires: UTF-8, then every byte outside RFC 3986's unreserved
 * set as `%XX`.
 */
export function percentEncode(text: string): string {
  if (plain.test(text)) {
    return text
  }
  try {
    return encodeURIComponent(text).replace(
      /[!'()*]/g,
      (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
    )
  } catch {
    return encodeBytes(utf8.encode(text), 0, Infinity, false)
  }
}

function encodeBytes(bytes: Uint8Array, start: number, end: number, form: boolean): string {
  let out = ''
  const stop = Math.min(end, bytes.length)
  for (let i = start; i < stop; i++) {
    let byte = bytes[i]!
    if (form) {
      if (byte === 0x2b) {
        byte = 0x20
      } else if (byte === 0x25 && i + 2 < stop && isHex(bytes[i + 1]) && isHex(bytes[i + 2])) {
        byte = (hexValue(bytes[i + 1]!) << 4) | hexValue(bytes[i + 2]!)
        i += 2
      }
    }
    out +=
      byte < 0x80 && unreserved[byte]
        ? String.fromCharCode(byte)
        : '%' + hex[byte >> 4] + hex[byte & 15]
  }
  return out
}

function isHex(byte: number | undefined): boolean {
  return (
    byte !== undefined &&
    ((byte >= 0x30 && byte <= 0x39) ||
      (byte >= 0x41 && byte <= 0x46) ||
      (byte >= 0x61 && byte <= 0x66))
  )
}

function hexValue(byte: number): number {
  return byte <= 0x39 ? byte - 0x30 : (byte | 0x20) - 0x57
}

/**
 * Reads `application/x-www-form-urlencoded` bytes into percent-encoded pairs (RFC 5849
 * §3.4.1.3). Decoding and encoding work on bytes, so a value that isn't UTF-8 keeps its original
 * bytes.
 */
export function parseForm(bytes: Uint8Array, pairs: Pair[]): void {
  let start = 0
  for (let i = 0; i <= bytes.length; i++) {
    if (i < bytes.length && bytes[i] !== 0x26) {
      continue
    }
    if (i > start) {
      const equals = bytes.subarray(start, i).indexOf(0x3d)
      const nameEnd = equals === -1 ? i : start + equals
      const name = encodeBytes(bytes, start, nameEnd, true)
      if (name !== 'oauth_signature') {
        pairs.push([name, equals === -1 ? '' : encodeBytes(bytes, nameEnd + 1, i, true)])
      }
    }
    start = i + 1
  }
}

export function parseQuery(search: string, pairs: Pair[]): void {
  if (search.length > 1) {
    parseForm(utf8.encode(search.slice(1)), pairs)
  }
}

export function sortPairs(pairs: Pair[]): Pair[] {
  return pairs.sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
}

export function joinPairs(pairs: readonly Pair[]): string {
  let out = ''
  for (const [name, value] of pairs) {
    out += (out === '' ? '' : '&') + name + '=' + value
  }
  return out
}
