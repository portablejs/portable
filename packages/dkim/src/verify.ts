import * as Base64 from '@portable/base64'
import type * as Dns from '@portable/dns'
import { binaryToText, equal, fromBinary, toBinary } from './internal/bytes.js'
import { bodyHashKey, type BodyHash, type Hash, hashBody, sha256 } from './internal/digest.js'
import {
  type Canonicalization,
  type Field,
  lowerAscii,
  parseFields,
  selectFields,
  signedData,
  stripFws,
} from './internal/header.js'
import { importPublicKey, type KeyType } from './internal/keys.js'
import { type Message, splitMessage } from './internal/message.js'
import {
  fitsDns,
  isDomainName,
  isLocalPart,
  isSameOrSubdomain,
  isSelector,
  toALabel,
} from './internal/names.js'
import { parseTags } from './internal/tags.js'

/**
 * The DNS lookup DKIM needs: a `Dns.Resolver` from `@portable/dns`, `node:dns/promises`, or any
 * object with `resolveTxt`. A rejection with `code` `ENOTFOUND`, `ENODATA` or `EBADNAME` means
 * there is no key, and any other rejection a temporary DNS error.
 *
 * @example
 * ```ts
 * import * as Dns from '@portable/dns'
 * import * as Dkim from '@portable/dkim'
 *
 * const resolver: Dkim.Resolver = Dns.createResolver()
 * ```
 */
export type Resolver = Pick<Dns.Resolver, 'resolveTxt'>

/**
 * The outcome of one DKIM-Signature field.
 *
 * @example
 * ```ts
 * import * as Dkim from '@portable/dkim'
 *
 * const results: Dkim.Result[] = await Dkim.verify(message, { resolver })
 * const passed = results.filter((r) => r.result === 'pass' && !r.testing).map((r) => r.domain)
 * ```
 */
export type Result = {
  /** The RFC 8601 result. */
  result: Result.Code
  /** The signing domain (`d=`), in lower-case A-label form. Empty when the tag is missing. */
  domain: string
  /** The selector (`s=`), in lower-case A-label form. */
  selector: string
  /** The algorithm (`a=`) in lower case, such as `rsa-sha256` or `ed25519-sha256`. */
  algorithm: string
  /** The agent or user identifier (`i=`), or `@` and the signing domain when there is no `i=`. */
  identity: string
  /** The signature (`b=`) in base64 without whitespace, for `header.b` (RFC 6008). */
  signature: string
  /** Why the result is not `pass`, such as `body hash did not verify` or `no key`. */
  reason?: string | undefined
  /** The key record has `t=y`: the domain is testing DKIM, so treat a pass as unsigned mail. */
  testing: boolean
  /** The `l=` value: only this many bytes of the canonicalized body are signed. */
  bodyLength?: number | undefined
  /** With `l=`, the canonicalized body bytes after `bodyLength`, which anyone could have added. */
  unsignedBodyBytes?: number | undefined
}

export declare namespace Result {
  type Code = 'pass' | 'fail' | 'policy' | 'neutral' | 'temperror' | 'permerror'
}

export declare namespace verify {
  type Options = {
    /** Looks up the keys. `Dns.createResolver()` and `node:dns/promises` both fit. */
    resolver: Resolver
    /** The time to check `x=` against. @default new Date() */
    now?: Date | undefined
    /** RSA keys shorter than this give `policy` (RFC 8301 section 3.2). @default 1024 */
    minKeyBits?: number | undefined
    /** Creates the body hash. @default buffers the canonicalized body for `crypto.subtle.digest` */
    hash?: (() => Hash) | undefined
    /** Stops reading the message and the key lookups, and rejects with `signal.reason`. */
    signal?: AbortSignal | undefined
  }
}

type Outcome = { result: Result.Code; reason: string }

type Signature = {
  field: Field
  result: Result
  outcome?: Outcome | undefined
  algorithm: { key: KeyType; supported: boolean }
  header: Canonicalization
  body: BodyHash
  names: readonly string[]
  bodyHash: Uint8Array
  value: Uint8Array<ArrayBuffer>
  keyName: string
  identityDomain: string | undefined
}

type KeyRecord =
  | {
      data: Uint8Array<ArrayBuffer>
      type: KeyType
      hashes: readonly string[] | undefined
      flags: readonly string[]
    }
  | Outcome

const required = ['v', 'a', 'b', 'bh', 'd', 'h', 's']
const algorithms: Record<string, { key: KeyType; supported: boolean }> = {
  'rsa-sha256': { key: 'rsa', supported: true },
  'ed25519-sha256': { key: 'ed25519', supported: true },
  'rsa-sha1': { key: 'rsa', supported: false },
}
const canonicalizationAlgorithm = '[A-Za-z](?:[A-Za-z0-9-]*[A-Za-z0-9])?'
const canonicalizationSyntax = new RegExp(
  `^${canonicalizationAlgorithm}(?:/${canonicalizationAlgorithm})?$`,
)
const noKeyCodes = new Set(['ENOTFOUND', 'ENODATA', 'EBADNAME'])

/**
 * Verifies every DKIM-Signature field of a message (RFC 6376, RFC 8301, RFC 8463) and resolves to
 * one result per field, in header order. A message without signatures gives an empty array. The
 * body is read once, whatever the number of signatures, and keys are looked up while it is read.
 *
 * Results follow RFC 8601: `fail` for a body or signature that doesn't match, `policy` for
 * rsa-sha1 and short RSA keys, `neutral` for a signature that can't be processed, `permerror` for
 * a missing, revoked or unusable key, and `temperror` for a DNS failure. The promise rejects only
 * for invalid options, a failing message stream or an aborted `signal`.
 *
 * @example
 * ```ts
 * import * as Dns from '@portable/dns'
 * import * as Dkim from '@portable/dkim'
 *
 * const results = await Dkim.verify(request.body!, {
 *   resolver: Dns.createResolver(),
 *   signal: AbortSignal.timeout(10_000),
 * })
 * for (const r of results) console.log(`dkim=${r.result} header.d=${r.domain} header.s=${r.selector}`)
 * ```
 */
export async function verify(message: Message, options: verify.Options): Promise<Result[]> {
  const { resolver, now = new Date(), minKeyBits = 1024, hash, signal } = options
  if (typeof resolver?.resolveTxt !== 'function')
    throw new TypeError('options.resolver must have a resolveTxt method.')
  signal?.throwIfAborted()
  const { header, body } = await splitMessage(message)
  const fields = parseFields(toBinary(header))
  const signatures = fields
    .filter((field) => field.name === 'dkim-signature')
    .map((field) => prepare(field, now))
  const pending = signatures.filter((signature) => !signature.outcome)
  if (pending.length === 0) {
    await body.cancel()
    return signatures.map((signature) => signature.result)
  }

  const keys = new Map<string, Promise<KeyRecord>>()
  for (const { keyName } of pending) {
    if (keys.has(keyName)) continue
    const key = fetchKey(resolver, keyName, signal)
    key.catch(() => {})
    keys.set(keyName, key)
  }
  const stop = () => void body.cancel().catch(() => {})
  signal?.addEventListener('abort', stop, { once: true })
  const digests = await hashBody(
    body,
    pending.map((signature) => signature.body),
    hash,
  ).finally(() => signal?.removeEventListener('abort', stop))
  signal?.throwIfAborted()

  return Promise.all(
    signatures.map(async (signature) => {
      if (signature.outcome) return signature.result
      const { result } = signature
      const digest = digests.get(bodyHashKey(signature.body))!
      const { length } = signature.body
      if (length !== undefined) {
        result.bodyLength = length
        result.unsignedBodyBytes = Math.max(0, digest.total - length)
      }
      const outcome =
        length !== undefined && length > digest.total
          ? { result: 'neutral' as const, reason: 'l= is longer than the body' }
          : !equal(digest.digest, signature.bodyHash)
            ? { result: 'fail' as const, reason: 'body hash did not verify' }
            : await check(signature, fields, await keys.get(signature.keyName)!, minKeyBits)
      result.result = outcome.result
      if (outcome.reason) result.reason = outcome.reason
      return result
    }),
  )
}

function prepare(field: Field, now: Date): Signature {
  const { tags, valid } = parseTags(field.raw.slice(field.raw.indexOf(':') + 1))
  const domainText = binaryToText(tags.get('d') ?? '')
  const selectorText = binaryToText(tags.get('s') ?? '')
  const domain = toALabel(domainText)
  const selector = toALabel(selectorText)
  const identityTag = tags.get('i')
  const identity = identityTag === undefined ? undefined : parseIdentity(identityTag)
  const algorithmName = stripFws(tags.get('a') ?? '').toLowerCase()
  const algorithm = algorithms[algorithmName]
  const result: Result = {
    result: 'neutral',
    domain: domain ?? domainText.toLowerCase(),
    selector: selector ?? selectorText,
    algorithm: algorithmName,
    identity: identity?.text ?? `@${domain ?? domainText.toLowerCase()}`,
    signature: stripFws(tags.get('b') ?? ''),
    testing: false,
  }
  const keyName = `${selector}._domainkey.${domain}`
  const names = (tags.get('h') ?? '')
    .split(':')
    .map((name) => lowerAscii(stripFws(name)))
    .filter((name) => name !== '')
  const canonicalization = stripFws(tags.get('c') ?? 'simple/simple')
  const [header = '', body = 'simple'] = canonicalization.toLowerCase().split('/')
  const timestamp = tags.get('t')
  const expiration = tags.get('x')
  const length = tags.get('l')
  const bodyHash = decodeBase64(tags.get('bh') ?? '')
  const value = decodeBase64(tags.get('b') ?? '')

  const outcome = ((): Outcome | undefined => {
    const neutral = (reason: string): Outcome => ({ result: 'neutral', reason })
    if (!valid) return neutral('signature syntax error')
    if (required.some((name) => !tags.has(name))) return neutral('signature missing required tag')
    if (tags.get('v') !== '1') return neutral('incompatible version')
    if (!algorithm) return neutral('unknown algorithm')
    if (!canonicalizationSyntax.test(canonicalization)) return neutral('signature syntax error')
    if (!isCanonicalization(header) || !isCanonicalization(body))
      return neutral('unknown canonicalization')
    if (
      [timestamp, expiration].some((tag) => tag !== undefined && !/^\d{1,12}$/.test(tag)) ||
      (length !== undefined && !/^\d{1,76}$/.test(length))
    )
      return neutral('signature syntax error')
    if (!domain || !isDomainName(domain) || !selector || !isSelector(selector) || !fitsDns(keyName))
      return neutral('signature syntax error')
    const query = tags.get('q')
    if (
      query !== undefined &&
      !query.split(':').some((method) => lowerAscii(stripFws(method)) === 'dns/txt')
    )
      return neutral('unsupported query method')
    if (identity && !identity.valid) return neutral('signature syntax error')
    if (identity && !isSameOrSubdomain(identity.domain, domain)) return neutral('domain mismatch')
    if (
      timestamp !== undefined &&
      expiration !== undefined &&
      Number(expiration) <= Number(timestamp)
    )
      return neutral('invalid expiration')
    if (names.length === 0) return neutral('signature syntax error')
    if (!names.includes('from')) return neutral('From field not signed')
    if (!bodyHash || !value) return neutral('signature syntax error')
    if (!algorithm.supported) return { result: 'policy', reason: 'weak algorithm' }
    if (expiration !== undefined && Number(expiration) * 1000 < now.getTime())
      return neutral('signature expired')
    return undefined
  })()
  if (outcome) {
    result.result = outcome.result
    result.reason = outcome.reason
  }
  return {
    field,
    result,
    outcome,
    algorithm: algorithm ?? { key: 'rsa', supported: false },
    header: header as Canonicalization,
    body: {
      canonicalization: body as Canonicalization,
      length: length === undefined ? undefined : Number(length),
    },
    names,
    bodyHash: bodyHash ?? new Uint8Array(),
    value: value ?? new Uint8Array(),
    keyName,
    identityDomain: identity?.domain,
  }
}

const isCanonicalization = (name: string): name is Canonicalization =>
  name === 'simple' || name === 'relaxed'

function decodeBase64(text: string): Uint8Array<ArrayBuffer> | undefined {
  try {
    return new Uint8Array(Base64.decode(text))
  } catch {
    return undefined
  }
}

/** Decodes dkim-quoted-printable (RFC 6376 section 2.11) and checks the `i=` syntax. */
function parseIdentity(tag: string): { text: string; domain: string; valid: boolean } {
  const decoded = binaryToText(
    stripFws(tag).replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    ),
  )
  const at = decoded.lastIndexOf('@')
  const local = decoded.slice(0, Math.max(at, 0))
  const domain = at < 0 ? undefined : toALabel(decoded.slice(at + 1))
  if (domain === undefined) return { text: decoded, domain: '', valid: false }
  return {
    text: `${local}@${domain}`,
    domain,
    valid: isLocalPart(local) && isDomainName(domain),
  }
}

async function check(
  signature: Signature,
  fields: readonly Field[],
  record: KeyRecord,
  minKeyBits: number,
): Promise<Outcome> {
  if ('result' in record) return record
  const { data: keyData, type, hashes, flags } = record
  signature.result.testing = flags.includes('y')
  if (type !== signature.algorithm.key)
    return { result: 'permerror', reason: 'inappropriate key algorithm' }
  if (hashes && !hashes.includes('sha256'))
    return { result: 'permerror', reason: 'inappropriate hash algorithm' }
  if (
    flags.includes('s') &&
    signature.identityDomain !== undefined &&
    signature.identityDomain !== signature.result.domain
  )
    return { result: 'permerror', reason: 'domain mismatch' }
  const key = await importPublicKey(type, keyData).catch(() => undefined)
  if (!key) return { result: 'permerror', reason: 'invalid public key' }
  if (type === 'rsa' && (key.algorithm as RsaHashedKeyAlgorithm).modulusLength < minKeyBits)
    return { result: 'policy', reason: 'weak key' }

  const selected = selectFields(fields, signature.names, signature.field)
  const data = fromBinary(signedData(selected, signature.field.raw, signature.header))
  const verified = await (
    type === 'rsa'
      ? crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature.value, data)
      : crypto.subtle.verify('Ed25519', key, signature.value, await sha256(data))
  ).catch(() => false)
  return verified
    ? { result: 'pass', reason: '' }
    : { result: 'fail', reason: 'signature did not verify' }
}

async function fetchKey(
  resolver: Resolver,
  name: string,
  signal: AbortSignal | undefined,
): Promise<KeyRecord> {
  let records: string[][]
  try {
    records = await abortable(resolver.resolveTxt(name), signal)
  } catch (error) {
    if (signal?.aborted) throw signal.reason
    const code = (error as { code?: unknown } | null)?.code
    if (typeof code === 'string' && noKeyCodes.has(code))
      return { result: 'permerror', reason: 'no key' }
    return {
      result: 'temperror',
      reason: `key lookup failed${typeof code === 'string' ? `: ${code}` : ''}`,
    }
  }
  const text = records[0]?.join('')
  if (text === undefined) return { result: 'permerror', reason: 'no key' }
  return parseKeyRecord(text)
}

function parseKeyRecord(text: string): KeyRecord {
  const permerror = (reason: string): Outcome => ({ result: 'permerror', reason })
  const { tags, valid } = parseTags(toBinary(new TextEncoder().encode(text)))
  if (!valid) return permerror('key syntax error')
  const version = tags.get('v')
  if (version !== undefined && (version !== 'DKIM1' || tags.keys().next().value !== 'v'))
    return permerror('unknown key version')
  const list = (name: string) => {
    const value = tags.get(name)
    return value === undefined
      ? undefined
      : value.split(':').map((item) => lowerAscii(stripFws(item)))
  }
  const services = list('s')
  if (services && !services.includes('email') && !services.includes('*'))
    return permerror('key not for email')
  const type = list('k')?.[0] ?? 'rsa'
  if (type !== 'rsa' && type !== 'ed25519') return permerror('unknown key type')
  const data = tags.get('p')
  if (data === undefined) return permerror('key syntax error')
  if (stripFws(data) === '') return permerror('key revoked')
  const der = decodeBase64(data)
  if (!der) return permerror('invalid public key')
  return { data: der, type, hashes: list('h'), flags: list('t') ?? [] }
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
