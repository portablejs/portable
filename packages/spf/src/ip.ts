export type Address = { version: 4 | 6; bytes: Uint8Array }

const octet = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)$/
const group = /^[\da-f]{1,4}$/i

export function parseIp(text: string): Address | undefined {
  if (text.includes(':')) {
    const bytes = parse6(text)
    return bytes && { version: 6, bytes }
  }
  const bytes = parse4(text)
  return bytes && { version: 4, bytes }
}

function parse4(text: string): Uint8Array | undefined {
  const parts = text.split('.')
  if (parts.length !== 4 || !parts.every((part) => octet.test(part))) return undefined
  return Uint8Array.from(parts, Number)
}

function parse6(text: string): Uint8Array | undefined {
  const lastColon = text.lastIndexOf(':')
  if (text.includes('.', lastColon)) {
    const v4 = parse4(text.slice(lastColon + 1))
    if (!v4) return undefined
    text = `${text.slice(0, lastColon + 1)}${((v4[0]! << 8) | v4[1]!).toString(16)}:${((v4[2]! << 8) | v4[3]!).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return undefined
  const head = groups(halves[0]!)
  const tail = halves.length === 2 ? groups(halves[1]!) : []
  if (!head || !tail) return undefined
  if (halves.length === 1 ? head.length !== 8 : head.length + tail.length > 7) return undefined
  const words = [...head, ...Array<number>(8 - head.length - tail.length).fill(0), ...tail]
  const bytes = new Uint8Array(16)
  words.forEach((word, i) => {
    bytes[i * 2] = word >> 8
    bytes[i * 2 + 1] = word & 0xff
  })
  return bytes
}

function groups(text: string): number[] | undefined {
  if (text === '') return []
  const parts = text.split(':')
  if (!parts.every((part) => group.test(part))) return undefined
  return parts.map((part) => parseInt(part, 16))
}

/** An IPv4-mapped IPv6 address (`::ffff:0:0/96`) becomes the IPv4 address it holds. */
export function unmap(address: Address): Address {
  const { bytes } = address
  if (address.version === 6 && bytes.subarray(0, 10).every((b) => b === 0)) {
    if (bytes[10] === 0xff && bytes[11] === 0xff) return { version: 4, bytes: bytes.slice(12) }
  }
  return address
}

export function inNetwork(address: Address, network: Address, prefix: number): boolean {
  if (address.version !== network.version) return false
  const whole = prefix >> 3
  for (let i = 0; i < whole; i++) if (address.bytes[i] !== network.bytes[i]) return false
  const bits = prefix & 7
  if (bits === 0) return true
  const mask = (0xff << (8 - bits)) & 0xff
  return (address.bytes[whole]! & mask) === (network.bytes[whole]! & mask)
}

export function format(address: Address): string {
  if (address.version === 4) return address.bytes.join('.')
  const words: number[] = []
  for (let i = 0; i < 16; i += 2) words.push((address.bytes[i]! << 8) | address.bytes[i + 1]!)
  let start = -1
  let length = 0
  for (let i = 0; i < 8; i++) {
    let j = i
    while (j < 8 && words[j] === 0) j++
    if (j - i > Math.max(length, 1)) [start, length] = [i, j - i]
    i = j
  }
  const hex = words.map((word) => word.toString(16))
  if (start < 0) return hex.join(':')
  return `${hex.slice(0, start).join(':')}::${hex.slice(start + length).join(':')}`
}

/** The address as `%{i}` expands it: dotted decimal, or 32 dot-separated nibbles for IPv6. */
export function dotted(address: Address): string {
  if (address.version === 4) return address.bytes.join('.')
  return Array.from(address.bytes, (b) => `${(b >> 4).toString(16)}.${(b & 15).toString(16)}`).join(
    '.',
  )
}

export function reverseName(address: Address): string {
  const labels = dotted(address).split('.').reverse().join('.')
  return `${labels}.${address.version === 4 ? 'in-addr' : 'ip6'}.arpa`
}

export function equal(a: Address, b: Address): boolean {
  return a.version === b.version && a.bytes.every((byte, i) => byte === b.bytes[i])
}
