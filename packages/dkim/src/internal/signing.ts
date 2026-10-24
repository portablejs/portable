import { lowerAscii, type Field, trimWsp } from './header.js'
import type { KeyType } from './keys.js'
import { toALabel } from './names.js'
import { sha256 } from './digest.js'

const headerName = /^[\x21-\x39\x3c-\x7e]+$/
const lineLength = 76

/** The fields mailauth signs by default. */
export const defaultHeaders: readonly string[] = [
  'From',
  'Sender',
  'Reply-To',
  'Subject',
  'Date',
  'Message-ID',
  'To',
  'Cc',
  'MIME-Version',
  'Content-Type',
  'Content-Transfer-Encoding',
  'Content-ID',
  'Content-Description',
  'Resent-Date',
  'Resent-From',
  'Resent-Sender',
  'Resent-To',
  'Resent-Cc',
  'Resent-Message-ID',
  'In-Reply-To',
  'References',
  'List-Id',
  'List-Help',
  'List-Unsubscribe',
  'List-Subscribe',
  'List-Post',
  'List-Owner',
  'List-Archive',
  'BIMI-Selector',
]

export function normalizeName(
  option: string,
  value: unknown,
  valid: (name: string) => boolean,
): string {
  if (typeof value !== 'string') {
    throw new TypeError(`options.${option} must be a string.`)
  }
  const name = toALabel(value)
  if (!name || !valid(name)) {
    throw new RangeError(`options.${option} is not a valid DNS name: ${value}`)
  }
  return name
}

export function assertHeaders(headers: readonly string[]): string[] {
  if (!Array.isArray(headers)) {
    throw new TypeError('options.headers must be an array of field names.')
  }
  const names = headers.map((name: unknown) => {
    if (typeof name !== 'string' || !headerName.test(name)) {
      throw new RangeError(`options.headers has an invalid field name: ${String(name)}`)
    }
    return name
  })
  if (!names.some((name) => lowerAscii(name) === 'from')) {
    throw new RangeError('options.headers must include From (RFC 6376 section 5.4).')
  }
  return names
}

export function seconds(option: string, date: Date): number {
  if (!(date instanceof Date)) {
    throw new TypeError(`options.${option} must be a Date.`)
  }
  const time = Math.floor(date.getTime() / 1000)
  if (!(time >= 0 && time < 1e12)) {
    throw new RangeError(
      `options.${option} must be between 1970 and the year 33658 (RFC 6376 section 3.5).`,
    )
  }
  return time
}

export function selectForSigning(fields: readonly Field[], names: readonly string[]): Field[] {
  const wanted = new Set(names.map(lowerAscii))
  const selected: Field[] = []
  for (let i = fields.length - 1; i >= 0; i--) {
    if (wanted.has(fields[i]!.name)) {
      selected.push(fields[i]!)
    }
  }
  return selected
}

export const casedName = (field: Field): string =>
  trimWsp(field.raw.slice(0, field.raw.indexOf(':')).replaceAll('\r\n', ''))

/** Extra `h=` entries so that each name appears at least as often as `names` lists it. */
export function overSigned(names: readonly string[], selected: readonly Field[]): string[] {
  const listed = new Map<string, { name: string; count: number }>()
  for (const name of names) {
    const key = lowerAscii(name)
    const entry = listed.get(key) ?? { name, count: 0 }
    entry.count++
    listed.set(key, entry)
  }
  const extra: string[] = []
  for (const [key, { name, count }] of listed) {
    if (count < 2) {
      continue
    }
    const present = selected.filter((field) => field.name === key).length
    for (let i = present; i < count; i++) {
      extra.push(name)
    }
  }
  return extra
}

/** Writes `name:` and the tokens, folding before a token that would pass 76 characters. */
export function fold(name: string, tokens: readonly string[]): string {
  let field = `${name}:`
  let line = field.length
  for (const token of tokens) {
    if (line + 1 + token.length > lineLength) {
      field += '\r\n ' + token
      line = 1 + token.length
    } else {
      field += ' ' + token
      line += 1 + token.length
    }
  }
  return field
}

export function appendValue(prefix: string, value: string): string {
  let field = prefix
  let line = prefix.length - prefix.lastIndexOf('\n') - 1
  for (let i = 0; i < value.length;) {
    const room = lineLength - line
    if (room <= 0) {
      field += '\r\n '
      line = 1
      continue
    }
    field += value.slice(i, i + room)
    line += Math.min(room, value.length - i)
    i += room
  }
  return field
}

export async function signData(
  key: CryptoKey,
  type: KeyType,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  return new Uint8Array(
    type === 'rsa'
      ? await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, data)
      : await crypto.subtle.sign('Ed25519', key, await sha256(data)),
  )
}
