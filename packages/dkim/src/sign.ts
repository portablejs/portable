import * as Base64 from '@portable/base64'
import { fromBinary, toBinary } from './internal/bytes.js'
import type { Hash, Hasher } from '@portable/web-crypto'
import { bodyHashKey, type BodyHash, hashBody } from './internal/digest.js'
import { InvalidInputError } from './errors.js'
import { type Canonicalization, parseFields, signedData } from './internal/header.js'
import { importPrivateKey, keyType } from './internal/keys.js'
import { type Message, splitMessage } from './internal/message.js'
import {
  canFitDns,
  isDomainName,
  isLocalPart,
  isSameOrSubdomain,
  isSelector,
  toALabel,
} from './internal/names.js'
import {
  appendValue,
  casedName,
  checkHeaders,
  checkName,
  defaultHeaders,
  fold,
  overSigned,
  seconds,
  selectForSigning,
  signData,
} from './internal/signing.js'

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
    now?: Date | undefined
    /** The expiry (`x=`). It must be after `now`. */
    expiresAt?: Date | undefined
    /** Creates the body hash. @default buffers the canonicalized body for `crypto.subtle.digest` */
    hasher?: ((hash: Hash) => Hasher) | undefined
    /** Stops reading the message, and rejects with `signal.reason`. */
    signal?: AbortSignal | undefined
  }
}

const canonicalizations = new Set([
  'simple/simple',
  'simple/relaxed',
  'relaxed/simple',
  'relaxed/relaxed',
])

/**
 * Signs a message (RFC 6376, RFC 8463) and resolves to the DKIM-Signature field, ending in CRLF,
 * to put above the message's other fields. The key type sets the algorithm: `rsa-sha256` or
 * `ed25519-sha256`. The signature always has `t=` and never `l=`.
 *
 * Throws a `TypeError` or `RangeError` for invalid options, and `Dkim.InvalidInputError` for a
 * message without a From field.
 *
 * If `message` is in a `SharedArrayBuffer`, don't write to it until the promise settles, or the
 * signature may not match the bytes you send.
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
    now = new Date(),
    expiresAt,
    hasher,
    signal,
  } = options
  const domain = checkName('domain', options.domain, isDomainName)
  const selector = checkName('selector', options.selector, isSelector)
  if (!canFitDns(`${selector}._domainkey.${domain}`))
    throw new RangeError('The key name <selector>._domainkey.<domain> is too long for DNS.')
  if (!canonicalizations.has(canonicalization))
    throw new RangeError(`canonicalization must be one of ${[...canonicalizations].join(', ')}.`)
  const names = checkHeaders(headers)
  const identity =
    options.identity === undefined ? undefined : encodeIdentity(options.identity, domain)
  const timestamp = seconds('now', now)
  const expiration = expiresAt === undefined ? undefined : seconds('expiresAt', expiresAt)
  if (expiration !== undefined && expiration <= timestamp)
    throw new RangeError('expiresAt must be at least a second after now.')
  signal?.throwIfAborted()
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
  const request = { canonicalization: bodyCanonicalization } satisfies BodyHash
  const cancel = () => void split.body.cancel().catch(() => {})
  signal?.addEventListener('abort', cancel, { once: true })
  const digests = await hashBody(split.body, [request], hasher).finally(() =>
    signal?.removeEventListener('abort', cancel),
  )
  signal?.throwIfAborted()
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
  const prefix = fold('DKIM-Signature', tokens)
  const data = fromBinary(signedData(selected, prefix, headerCanonicalization))
  const signature = await signData(key, type, data)
  return appendValue(prefix, Base64.encode(signature)) + '\r\n'
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
