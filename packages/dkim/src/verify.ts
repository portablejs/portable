import * as Bytes from '@portable/bytes'
import type * as Dns from '@portable/dns'
import { toBinary } from './internal/bytes.js'
import type { Hash, Hasher } from '@portable/web-crypto'
import { bodyHashKey, hashBody } from './internal/digest.js'
import { parseFields } from './internal/header.js'
import { type Message, splitMessage } from './internal/message.js'
import { check, fetchKey, type KeyRecord, prepare } from './internal/signature.js'

/**
 * The DNS lookup DKIM needs: a `Dns.Resolver` from `@portable/dns`, `node:dns/promises`, or any
 * object with `resolveTxt`. `verify` treats a rejection with `code` `ENOTFOUND`, `ENODATA` or
 * `EBADNAME` as no key, and any other rejection as a temporary DNS error.
 *
 * @example
 * ```ts
 * import * as Dns from '@portable/dns'
 * import * as Dkim from '@portable/dkim'
 *
 * const resolver: Dkim.Resolver = Dns.create()
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
  /** The resolver's error behind a `temperror`. */
  cause?: unknown
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
    /** Looks up the keys. Pass `Dns.create()` or `node:dns/promises`. */
    resolver: Resolver
    /** The time to check `x=` against. @default new Date() */
    now?: Date | undefined
    /** RSA keys shorter than this give `policy` (RFC 8301 section 3.2). @default 1024 */
    minKeyBits?: number | undefined
    /** Creates the body hash. @default buffers the canonicalized body for `crypto.subtle.digest` */
    hasher?: ((hash: Hash) => Hasher) | undefined
    /** Stops reading the message and the key lookups, and rejects with `signal.reason`. */
    signal?: AbortSignal | undefined
  }
}

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
 * If `message` is in a `SharedArrayBuffer`, don't write to it until the promise settles,
 * because `verify` may otherwise check different bytes from the ones you use afterwards.
 *
 * @example
 * ```ts
 * import * as Dns from '@portable/dns'
 * import * as Dkim from '@portable/dkim'
 *
 * const results = await Dkim.verify(request.body!, {
 *   resolver: Dns.create(),
 *   signal: AbortSignal.timeout(10_000),
 * })
 * for (const r of results) console.log(`dkim=${r.result} header.d=${r.domain} header.s=${r.selector}`)
 * ```
 */
export async function verify(message: Message, options: verify.Options): Promise<Result[]> {
  const { resolver, now = new Date(), minKeyBits = 1024, hasher, signal } = options
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
    hasher,
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
          : !Bytes.equal(digest.digest, signature.bodyHash)
            ? { result: 'fail' as const, reason: 'body hash did not verify' }
            : await check(signature, fields, await keys.get(signature.keyName)!, minKeyBits)
      result.result = outcome.result
      if (outcome.reason) result.reason = outcome.reason
      if ('cause' in outcome) result.cause = outcome.cause
      return result
    }),
  )
}
