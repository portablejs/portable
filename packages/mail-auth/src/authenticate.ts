import { isInput, toUint8Array } from '@portable/bytes/internal'
import * as Arc from '@portable/arc'
import * as Dkim from '@portable/dkim'
import * as Dmarc from '@portable/dmarc'
import * as Spf from '@portable/spf'
import * as Streams from '@portable/streams'
import { author, type SkipReason } from './internal/author.js'
import { checkAuthservId, formatResults } from './internal/results.js'

/**
 * The DNS lookups SPF, DKIM, DMARC and ARC need: a `Dns.Resolver` from `@portable/dns`,
 * `node:dns/promises`, or a plain object with these methods.
 *
 * @example
 * ```ts
 * import * as Dns from '@portable/dns'
 * import * as MailAuth from '@portable/mail-auth'
 *
 * const resolver: MailAuth.Resolver = Dns.create()
 * ```
 */
export type Resolver = Spf.Resolver & Dmarc.Resolver & Dkim.Resolver

/**
 * What `authenticate` found, and the header fields to add to the message.
 *
 * @example
 * ```ts
 * import * as MailAuth from '@portable/mail-auth'
 *
 * const result: MailAuth.Result = await MailAuth.authenticate(message, options)
 * if (result.dmarc?.disposition === 'reject') reject('550 5.7.1 Rejected by DMARC policy')
 * ```
 */
export type Result = {
  /** The SPF result for the MAIL FROM address, or the HELO name for a bounce. */
  spf: Spf.Result
  /** One result per DKIM-Signature, in header order. */
  dkim: readonly Dkim.Result[]
  /** The ARC chain's result. */
  arc: Arc.Result
  /** The DMARC result for the From domain. Not set when `dmarcSkipReason` is. */
  dmarc?: Dmarc.Result | undefined
  /**
   * Why DMARC wasn't checked: the message has no From field or more than one, no mailbox or
   * mailboxes of several domains in it, or a From field that isn't a valid address list (RFC 9989
   * section 5.3.1). Such a message has no DMARC protection, and section 11.5 suggests treating it
   * as suspicious.
   */
  dmarcSkipReason?: Result.DmarcSkipReason | undefined
  /** The Authentication-Results value (RFC 8601), without the field name. */
  authResults: string
  /**
   * The header fields to put above the message, each ending in CRLF: the new ARC set when the
   * message was sealed, then Authentication-Results.
   */
  headers: string
  /**
   * Why the message wasn't sealed when `seal` was given: the reason from
   * `Arc.InvalidInputError`.
   */
  sealSkipReason?: string | undefined
}

export declare namespace Result {
  type DmarcSkipReason = SkipReason
}

export declare namespace authenticate {
  type Options = {
    /** Looks up DNS records. Pass `Dns.create()` or `node:dns/promises`. */
    resolver: Resolver
    /**
     * The authserv-id of Authentication-Results (RFC 8601 section 2.5), usually this server's host
     * name in A-label form. It must be a token, so a value such as `mx; dkim=pass` is rejected.
     */
    authservId: string
    /** The SMTP client's IP address. */
    ip: string
    /** The HELO or EHLO name. */
    helo?: string | undefined
    /**
     * The MAIL FROM address. Empty or missing for a bounce, for which SPF checks the HELO name
     * instead.
     */
    sender?: string | undefined
    /** Seals the message with an ARC set that records these results. */
    seal?: Seal | undefined
    /** The time to check DKIM and ARC signature expiry against. @default new Date() */
    now?: Date | undefined
    /** RSA keys shorter than this give DKIM `policy` and fail the ARC chain. @default 1024 */
    minKeyBits?: number | undefined
    /**
     * Creates the body hashes, as in `Dkim.verify`.
     * @default buffers the body for `crypto.subtle.digest`
     */
    hasher?: ((hash: Dkim.Hash) => Dkim.Hasher) | undefined
    /**
     * Finds organizational domains from a public suffix list, as in `Dmarc.check`.
     * @default the DNS tree walk
     */
    organizationalDomain?: Dmarc.check.Options['organizationalDomain'] | undefined
    /** Stops reading the message and every lookup, and rejects with `signal.reason`. */
    signal?: AbortSignal | undefined
  }

  /** The `Arc.seal` options that `authenticate` doesn't fill in itself. */
  type Seal = Pick<Arc.seal.Options, 'domain' | 'selector' | 'privateKey' | 'headers' | 'now'>
}

/**
 * Checks a received message's SPF (RFC 7208), DKIM signatures (RFC 6376), ARC chain (RFC 8617)
 * and DMARC policy (RFC 9989) and writes the results as an Authentication-Results field (RFC
 * 8601). With `seal`, it also adds an ARC set that records them, with the chain's result as
 * `cv=`.
 *
 * The promise rejects only for invalid options, a failing message stream or an aborted `signal`.
 * DNS failures are reported as results, such as `temperror`.
 *
 * If `message` is in a `SharedArrayBuffer`, don't write to it until the promise settles,
 * because `authenticate` may otherwise check different bytes from the ones you use afterwards.
 *
 * @example
 * ```ts
 * import * as Dns from '@portable/dns'
 * import * as MailAuth from '@portable/mail-auth'
 *
 * const result = await MailAuth.authenticate(message, {
 *   resolver: Dns.create(),
 *   authservId: 'mx.example.net',
 *   ip: '192.0.2.1',
 *   helo: 'mail.example.com',
 *   sender: 'alice@example.com',
 *   signal: AbortSignal.timeout(10_000),
 * })
 * result.dmarc?.result // 'pass'
 * const delivered = result.headers + message
 * ```
 */
export async function authenticate(
  message: Dkim.Message,
  options: authenticate.Options,
): Promise<Result> {
  const { resolver, ip, helo, sender, seal, now, minKeyBits, hasher, signal } = options
  const authservId = checkAuthservId(options.authservId)
  signal?.throwIfAborted()
  const bytes =
    typeof message === 'string'
      ? new TextEncoder().encode(message)
      : isInput(message)
        ? toUint8Array(message)
        : await Streams.toBytes(message, { signal })
  const verifyOptions = { resolver, now, minKeyBits, hasher, signal }
  const [spf, dkim, arc] = await Promise.all([
    Spf.check({ ip, sender, helo }, { resolver, receiver: authservId, signal }),
    Dkim.verify(bytes, verifyOptions),
    Arc.verify(bytes, verifyOptions),
  ])
  const from = author(bytes)
  const dmarc =
    'domain' in from
      ? await Dmarc.check(
          { from: from.domain, spf, dkim },
          { resolver, organizationalDomain: options.organizationalDomain, signal },
        )
      : undefined
  const authResults = formatResults({ authservId, ip, sender, spf, dkim, arc, dmarc })
  const result: Result = {
    spf,
    dkim,
    arc,
    ...(dmarc ? { dmarc } : { dmarcSkipReason: (from as { skip: SkipReason }).skip }),
    authResults,
    headers: `Authentication-Results: ${authResults}\r\n`,
  }
  if (seal) {
    try {
      const fields = await Arc.seal(bytes, {
        ...seal,
        authResults,
        chainValidation: arc.result,
        hasher,
        signal,
      })
      result.headers = fields + result.headers
    } catch (error) {
      if (!(error instanceof Arc.InvalidInputError)) throw error
      result.sealSkipReason = error.message
    }
  }
  return result
}
