export type Prefix = { version: 4 | 6; bytes: Uint8Array; length: number }

const octet = /^(?:0|[1-9]\d{0,2})$/
const hextet = /^[0-9a-f]{1,4}$/i

function parse4(text: string): Uint8Array | undefined {
  const parts = text.split('.')
  if (parts.length !== 4) return undefined
  const bytes = new Uint8Array(4)
  for (let i = 0; i < 4; i++) {
    const part = parts[i]!
    if (!octet.test(part)) return undefined
    const value = Number(part)
    if (value > 255) return undefined
    bytes[i] = value
  }
  return bytes
}

function groups(text: string): number[] | undefined {
  if (text === '') return []
  const values: number[] = []
  const parts = text.split(':')
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    if (i === parts.length - 1 && part.includes('.')) {
      const v4 = parse4(part)
      if (!v4) return undefined
      values.push((v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!)
    } else if (hextet.test(part)) values.push(Number.parseInt(part, 16))
    else return undefined
  }
  return values
}

function parse6(text: string): Uint8Array | undefined {
  const gap = text.indexOf('::')
  let values: number[] | undefined
  if (gap < 0) {
    values = groups(text)
    if (values?.length !== 8) return undefined
  } else {
    if (text.indexOf('::', gap + 1) >= 0) return undefined
    const head = groups(text.slice(0, gap))
    const tail = groups(text.slice(gap + 2))
    if (!head || !tail || head.length + tail.length > 7) return undefined
    values = [...head, ...Array<number>(8 - head.length - tail.length).fill(0), ...tail]
  }
  const bytes = new Uint8Array(16)
  values.forEach((value, i) => {
    bytes[i * 2] = value >> 8
    bytes[i * 2 + 1] = value & 0xff
  })
  return bytes
}

/**
 * Parses an IPv4 or IPv6 address with an optional prefix length. An IPv4-mapped IPv6 address
 * (`::ffff:192.0.2.1`) becomes the IPv4 address, because the IPv6 bootstrap file doesn't cover
 * `::ffff:0:0/96`.
 */
export function parse(text: string): Prefix | undefined {
  const slash = text.indexOf('/')
  const host = slash < 0 ? text : text.slice(0, slash)
  const v6 = host.includes(':')
  let bytes = v6 ? parse6(host) : parse4(host)
  if (!bytes) return undefined
  let length = v6 ? 128 : 32
  if (slash >= 0) {
    const digits = text.slice(slash + 1)
    if (!/^(?:0|[1-9]\d{0,2})$/.test(digits) || Number(digits) > length) return undefined
    length = Number(digits)
  }
  if (v6 && length >= 96 && bytes.subarray(0, 10).every((byte) => byte === 0)) {
    if (bytes[10] === 0xff && bytes[11] === 0xff)
      return { version: 4, bytes: bytes.slice(12), length: length - 96 }
  }
  return { version: v6 ? 6 : 4, bytes, length }
}

/** Formats a prefix for an RDAP query path, with IPv6 written as RFC 5952 recommends. */
export function format({ version, bytes, length }: Prefix): string {
  const full = version === 4 ? 32 : 128
  const suffix = length === full ? '' : `/${length}`
  if (version === 4) return bytes.join('.') + suffix
  const words: number[] = []
  for (let i = 0; i < 16; i += 2) words.push((bytes[i]! << 8) | bytes[i + 1]!)
  let start = -1
  let size = 1
  for (let i = 0; i < 8; i++) {
    let end = i
    while (end < 8 && words[end] === 0) end++
    if (end - i > size) {
      start = i
      size = end - i
    }
  }
  const hex = words.map((word) => word.toString(16))
  if (start < 0) return hex.join(':') + suffix
  return `${hex.slice(0, start).join(':')}::${hex.slice(start + size).join(':')}${suffix}`
}

/** Whether `inner` lies entirely inside `outer`. */
export function contains(outer: Prefix, inner: Prefix): boolean {
  if (outer.version !== inner.version || inner.length < outer.length) return false
  const whole = outer.length >> 3
  for (let i = 0; i < whole; i++) if (outer.bytes[i] !== inner.bytes[i]) return false
  const bits = outer.length & 7
  if (bits === 0) return true
  const mask = (0xff << (8 - bits)) & 0xff
  return (outer.bytes[whole]! & mask) === (inner.bytes[whole]! & mask)
}
