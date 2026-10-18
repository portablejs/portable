import * as Base64 from '@portable/base64'
import { fromBinary, toBinary } from './internal/bytes.js'
import { bodyHashKey, type BodyHash, type Hash, hashBody, sha256 } from './internal/digest.js'
import { InvalidInputError } from './errors.js'
import {
  type Canonicalization,
  type Field,
  lowerAscii,
  parseFields,
  signedData,
  trimWsp,
} from './internal/header.js'
import { importPrivateKey, keyType } from './internal/keys.js'
import { type Message, splitMessage } from './internal/message.js'
import {
  fitsDns,
  isDomainName,
  isLocalPart,
  isSameOrSubdomain,
  isSelector,
  toALabel,
} from './internal/names.js'

export declare namespace sign {
  type Options = {
    /** The signing domain (`d=`). U-labels are converted to A-labels. */
    domain: string
    /** The selector (`s=`): the key is published at `<selector>._domainkey.<domain>`. */
    selector: string
    /**
     * An RSA key of at least 1024 bits or an Ed25519 key: a `CryptoKey` that can sign
     * (RSASSA-PKCS1-v1_5 with SHA-256, or Ed25519), a PEM `PRIVATE KEY` (PKCS #8) or
     * `RSA PRIVATE KEY` (PKCS #1), or a JWK. The key type sets `a=`.
     */
    privateKey: CryptoKey | string | JsonWebKey
    /**
     * The header fields to sign, matched without regard to case. Each field of a listed name is
     * signed. A name listed n times appears in `h=` at least n times, so listing a name more times
     * than the message has it over-signs it: a field of that name added later breaks the signature
     * (RFC 6376 section 8.15). `['From', 'From', 'Subject']` over-signs a message's single From.
     * @default the fields mailauth signs, from `From` to `BIMI-Selector`
     */
    headers?: readonly string[] | undefined
    /** `header/body`. @default 'relaxed/relaxed' */
    canonicalization?: `${Canonicalization}/${Canonicalization}` | undefined
    /** The agent or user identifier (`i=`), such as `user@example.com` or `@mail.example.com`. */
    identity?: string | undefined
    /** The signature time (`t=`). @default new Date() */
    signedAt?: Date | undefined
    /** The expiry (`x=`). It must be after `signedAt`. */
    expiresAt?: Date | undefined
    /** Creates the body hash. @default buffers the canonicalized body for `crypto.subtle.digest` */
    hash?: (() => Hash) | undefined
  }
}

const defaultHeaders = [
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
const headerName = /^[\x21-\x39\x3c-\x7e]+$/
const canonicalizations = new Set([
  'simple/simple',
  'simple/relaxed',
  'relaxed/simple',
  'relaxed/relaxed',
])
const lineLength = 76

/**
 * Signs a message (RFC 6376, RFC 8463) and resolves to the DKIM-Signature field, ending in CRLF,
 * to put above the message's other fields. The algorithm is `rsa-sha256` or `ed25519-sha256`
 * after the key. The signature always has `t=` and never `l=`.
 *
 * Throws a `TypeError` or `RangeError` for invalid options, and `Dkim.InvalidInputError` for a
 * message without a From field.
 *
 * @example
 * ```ts
 * import * as Dkim from '@portable/dkim'
 *
 * const field = await Dkim.sign(message, {
 *   domain: 'example.com',
 *   selector: 'mail',
 *   privateKey: env.DKIM_PRIVATE_KEY,
 * })
 * const signed = field + message
 * ```
 */
export async function sign(message: Message, options: sign.Options): Promise<string> {
  const {
    headers = defaultHeaders,
    canonicalization = 'relaxed/relaxed',
    signedAt = new Date(),
    expiresAt,
    hash,
  } = options
  const domain = checkName('domain', options.domain, isDomainName)
  const selector = checkName('selector', options.selector, isSelector)
  if (!fitsDns(`${selector}._domainkey.${domain}`))
    throw new RangeError('The key name <selector>._domainkey.<domain> is too long for DNS.')
  if (!canonicalizations.has(canonicalization))
    throw new RangeError(`canonicalization must be one of ${[...canonicalizations].join(', ')}.`)
  const names = checkHeaders(headers)
  const identity =
    options.identity === undefined ? undefined : encodeIdentity(options.identity, domain)
  const timestamp = seconds('signedAt', signedAt)
  const expiration = expiresAt === undefined ? undefined : seconds('expiresAt', expiresAt)
  if (expiration !== undefined && expiration <= timestamp)
    throw new RangeError('expiresAt must be at least a second after signedAt.')
  const key = await importPrivateKey(options.privateKey)
  const type = keyType(key)!
  if (type === 'rsa' && (key.algorithm as RsaHashedKeyAlgorithm).modulusLength < 1024)
    throw new RangeError('RSA keys shorter than 1024 bits are not allowed (RFC 8301 section 3.2).')
  const [headerCanonicalization, bodyCanonicalization] = canonicalization.split('/') as [
    Canonicalization,
    Canonicalization,
  ]

  const split = await splitMessage(message)
  const fields = parseFields(toBinary(split.header))
  const selected = selectForSigning(fields, names)
  if (!selected.some((field) => field.name === 'from')) {
    await split.body.cancel()
    throw new InvalidInputError('The message has no From field to sign.')
  }
  const request: BodyHash = { canonicalization: bodyCanonicalization }
  const digests = await hashBody(split.body, [request], hash)
  const bodyHash = Base64.encode(digests.get(bodyHashKey(request))!.digest)

  const signedNames = [...selected.map(casedName), ...overSigned(names, selected)]
  const tokens = [
    'v=1;',
    `a=${type}-sha256;`,
    `c=${canonicalization};`,
    `d=${domain};`,
    `s=${selector};`,
    `t=${timestamp};`,
    ...(expiration === undefined ? [] : [`x=${expiration};`]),
    ...(identity === undefined ? [] : [`i=${identity};`]),
    ...signedNames.map(
      (name, i) => `${i === 0 ? 'h=' : ''}${name}${i === signedNames.length - 1 ? ';' : ':'}`,
    ),
    `bh=${bodyHash};`,
    'b=',
  ]
  const prefix = fold(tokens)
  const data = fromBinary(signedData(selected, prefix, headerCanonicalization))
  const signature = new Uint8Array(
    type === 'rsa'
      ? await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, data)
      : await crypto.subtle.sign('Ed25519', key, await sha256(data)),
  )
  return appendValue(prefix, Base64.encode(signature)) + '\r\n'
}

function checkName(option: string, value: unknown, valid: (name: string) => boolean): string {
  if (typeof value !== 'string') throw new TypeError(`options.${option} must be a string.`)
  const name = toALabel(value)
  if (!name || !valid(name))
    throw new RangeError(`options.${option} is not a valid DNS name: ${value}`)
  return name
}

function checkHeaders(headers: readonly string[]): string[] {
  if (!Array.isArray(headers))
    throw new TypeError('options.headers must be an array of field names.')
  const names = headers.map((name: unknown) => {
    if (typeof name !== 'string' || !headerName.test(name))
      throw new RangeError(`options.headers has an invalid field name: ${String(name)}`)
    return name
  })
  if (!names.some((name) => lowerAscii(name) === 'from'))
    throw new RangeError('options.headers must include From (RFC 6376 section 5.4).')
  return names
}

function seconds(option: string, date: Date): number {
  if (!(date instanceof Date)) throw new TypeError(`options.${option} must be a Date.`)
  const time = Math.floor(date.getTime() / 1000)
  if (!(time >= 0 && time < 1e12))
    throw new RangeError(
      `options.${option} must be between 1970 and the year 33658 (RFC 6376 section 3.5).`,
    )
  return time
}

/** Checks `i=` and writes it in dkim-quoted-printable (RFC 6376 section 2.11). */
function encodeIdentity(identity: string, domain: string): string {
  if (typeof identity !== 'string') throw new TypeError('options.identity must be a string.')
  const at = identity.lastIndexOf('@')
  const local = identity.slice(0, Math.max(at, 0))
  const host = at < 0 ? undefined : toALabel(identity.slice(at + 1))
  if (!host || !isDomainName(host) || !isLocalPart(local))
    throw new RangeError(`options.identity is not an address or @domain: ${identity}`)
  if (!isSameOrSubdomain(host, domain))
    throw new RangeError('options.identity must be in options.domain or one of its subdomains.')
  let encoded = ''
  for (const byte of new TextEncoder().encode(local))
    encoded +=
      byte > 0x20 && byte < 0x7f && byte !== 0x3b && byte !== 0x3d
        ? String.fromCharCode(byte)
        : `=${byte.toString(16).toUpperCase().padStart(2, '0')}`
  return `${encoded}@${host}`
}

function selectForSigning(fields: readonly Field[], names: readonly string[]): Field[] {
  const wanted = new Set(names.map(lowerAscii))
  const selected: Field[] = []
  for (let i = fields.length - 1; i >= 0; i--)
    if (wanted.has(fields[i]!.name)) selected.push(fields[i]!)
  return selected
}

const casedName = (field: Field): string =>
  trimWsp(field.raw.slice(0, field.raw.indexOf(':')).replaceAll('\r\n', ''))

/** Extra `h=` entries so that each name appears at least as often as `names` lists it. */
function overSigned(names: readonly string[], selected: readonly Field[]): string[] {
  const listed = new Map<string, { name: string; count: number }>()
  for (const name of names) {
    const key = lowerAscii(name)
    const entry = listed.get(key) ?? { name, count: 0 }
    entry.count++
    listed.set(key, entry)
  }
  const extra: string[] = []
  for (const [key, { name, count }] of listed) {
    if (count < 2) continue
    const present = selected.filter((field) => field.name === key).length
    for (let i = present; i < count; i++) extra.push(name)
  }
  return extra
}

function fold(tokens: readonly string[]): string {
  let field = 'DKIM-Signature:'
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

function appendValue(prefix: string, value: string): string {
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
