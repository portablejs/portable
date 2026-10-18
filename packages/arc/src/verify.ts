import type * as Dkim from '@portable/dkim'
import {
  binaryToText,
  bodyHashKey,
  check,
  decodeBase64,
  equal,
  type Field,
  fetchKey,
  fitsDns,
  fromBinary,
  hashBody,
  isDomainName,
  isSelector,
  type KeyRecord,
  type KeyType,
  type Message,
  parseFields,
  parseTags,
  prepare,
  signedData,
  splitMessage,
  stripFws,
  toALabel,
  toBinary,
  verifyData,
} from '@portable/dkim/internal'
import {
  type ArcSet,
  authResultsOf,
  chainValidation,
  isArcField,
  newest,
  readChain,
} from './internal/chain.js'

/**
 * The DNS lookup ARC needs: a `Dns.Resolver` from `@portable/dns`, `node:dns/promises`, or any
 * object with `resolveTxt`. It is the same as `Dkim.Resolver`.
 *
 * @example
 * ```ts
 * import * as Arc from '@portable/arc'
 * import * as Dns from '@portable/dns'
 *
 * const resolver: Arc.Resolver = Dns.createResolver()
 * ```
 */
export type Resolver = Dkim.Resolver

/**
 * The outcome of validating a message's ARC chain.
 *
 * @example
 * ```ts
 * import * as Arc from '@portable/arc'
 *
 * const arc: Arc.Result = await Arc.verify(message, { resolver })
 * const google = arc.sets.find((set) => set.domain === 'google.com')
 * ```
 */
export type Result = {
  /** The chain validation status (RFC 8617 section 4.4), which is also the `arc=` result. */
  result: Result.Code
  /** The highest instance on the message's ARC fields, or 0 when it has none. */
  instance: number
  /** Why the result is `fail`, such as `i=2 as signature did not verify`. */
  reason?: string | undefined
  /** The ARC sets from the oldest (`i=1`) to the newest. Empty unless the result is `pass`. */
  sets: readonly Result.Set[]
}

export declare namespace Result {
  type Code = 'pass' | 'fail' | 'none'

  /** One validated ARC set. */
  type Set = {
    instance: number
    /** The sealing domain (`d=` of the ARC-Seal), in lower-case A-label form. */
    domain: string
    /** The selector of the ARC-Seal. */
    selector: string
    /**
     * The ARC-Authentication-Results payload after `i=`: the sealer's authserv-id and the results it
     * recorded, unfolded. It is only as trustworthy as the sealing domain.
     */
    authResults: string
  }
}

export declare namespace verify {
  type Options = {
    /** Looks up the keys. `Dns.createResolver()` and `node:dns/promises` both fit. */
    resolver: Resolver
    /** The time to check the ARC-Message-Signature's `x=` against. @default new Date() */
    now?: Date | undefined
    /** RSA keys shorter than this fail the chain (RFC 8301 section 3.2). @default 1024 */
    minKeyBits?: number | undefined
    /** Creates the body hash, as in `Dkim.verify`. @default buffers the body for `crypto.subtle.digest` */
    hash?: (() => Dkim.Hash) | undefined
    /** Stops reading the message and the key lookups, and rejects with `signal.reason`. */
    signal?: AbortSignal | undefined
  }
}

type Seal = {
  set: ArcSet
  type: KeyType
  value: Uint8Array<ArrayBuffer>
  domain: string
  selector: string
  keyName: string
}

const sealAlgorithms: Record<string, KeyType> = {
  'rsa-sha256': 'rsa',
  'ed25519-sha256': 'ed25519',
}
const sealTags = ['a', 'b', 'cv', 'd', 's']

/**
 * Validates the ARC chain of a message (RFC 8617 section 5.2) and resolves to `pass`, `fail` or
 * `none`. Every set's structure, the newest ARC-Message-Signature and every ARC-Seal are checked,
 * with the RFC 6376 tag syntax, RFC 8301 algorithms and Ed25519 seals (RFC 8463). The body is read
 * once and the keys are looked up while it is read.
 *
 * The promise rejects only for invalid options, a failing message stream or an aborted `signal`.
 *
 * @example
 * ```ts
 * import * as Arc from '@portable/arc'
 * import * as Dns from '@portable/dns'
 *
 * const arc = await Arc.verify(message, { resolver: Dns.createResolver() })
 * console.log(`arc=${arc.result}${arc.reason ? ` (${arc.reason})` : ''}`)
 * ```
 */
export async function verify(message: Message, options: verify.Options): Promise<Result> {
  const { resolver, now = new Date(), minKeyBits = 1024, hash, signal } = options
  if (typeof resolver?.resolveTxt !== 'function')
    throw new TypeError('options.resolver must have a resolveTxt method.')
  signal?.throwIfAborted()
  const { header, body } = await splitMessage(message)
  const fields = parseFields(toBinary(header))
  const { instance } = newest(fields)
  const failed = (reason: string): Result => ({ result: 'fail', instance, reason, sets: [] })
  const stop = async (result: Result): Promise<Result> => {
    await body.cancel()
    return result
  }

  if (!fields.some(isArcField)) return stop({ result: 'none', instance: 0, sets: [] })
  const sets = readChain(fields)
  if (typeof sets === 'string') return stop(failed(sets))
  const last = sets.at(-1)!
  if (chainValidation(last.seal) === 'fail') return stop(failed(`i=${last.instance} has cv=fail`))
  for (const set of sets) {
    const expected = set.instance === 1 ? 'none' : 'pass'
    const cv = chainValidation(set.seal)
    if (cv !== expected)
      return stop(failed(`i=${set.instance} has cv=${cv ?? ''} instead of cv=${expected}`))
  }
  const seals: Seal[] = []
  for (const set of sets) {
    const seal = prepareSeal(set)
    if (typeof seal === 'string') return stop(failed(seal))
    seals.push(seal)
  }
  const signature = prepare(last.signature, now, 'arc')
  if (signature.outcome) return stop(failed(`i=${last.instance} ams ${signature.outcome.reason}`))
  if (signature.names.includes('arc-seal'))
    return stop(failed(`i=${last.instance} ams signs ARC-Seal`))

  const keys = new Map<string, Promise<KeyRecord>>()
  for (const keyName of [signature.keyName, ...seals.map((seal) => seal.keyName)]) {
    if (keys.has(keyName)) continue
    const key = fetchKey(resolver, keyName, signal)
    key.catch(() => {})
    keys.set(keyName, key)
  }
  const cancel = () => void body.cancel().catch(() => {})
  signal?.addEventListener('abort', cancel, { once: true })
  const digests = await hashBody(body, [signature.body], hash).finally(() =>
    signal?.removeEventListener('abort', cancel),
  )
  signal?.throwIfAborted()

  const digest = digests.get(bodyHashKey(signature.body))!
  const { length } = signature.body
  if (length !== undefined && length > digest.total)
    return failed(`i=${last.instance} ams l= is longer than the body`)
  if (!equal(digest.digest, signature.bodyHash))
    return failed(`i=${last.instance} ams body hash did not verify`)
  const outcome = await check(signature, fields, await keys.get(signature.keyName)!, minKeyBits)
  if (outcome.result !== 'pass') return failed(`i=${last.instance} ams ${outcome.reason}`)

  for (let i = seals.length - 1; i >= 0; i--) {
    const seal = seals[i]!
    const covered: Field[] = []
    for (const set of sets.slice(0, i)) covered.push(set.results, set.signature, set.seal)
    covered.push(seal.set.results, seal.set.signature)
    const data = fromBinary(signedData(covered, seal.set.seal.raw, 'relaxed'))
    const record = await keys.get(seal.keyName)!
    const outcome = await verifyData(record, seal.type, seal.value, data, minKeyBits)
    if (outcome.result !== 'pass') return failed(`i=${seal.set.instance} as ${outcome.reason}`)
  }

  return {
    result: 'pass',
    instance,
    sets: seals.map(({ set, domain, selector }) => ({
      instance: set.instance,
      domain,
      selector,
      authResults: authResultsOf(set.results),
    })),
  }
}

/** Checks an ARC-Seal's tags (RFC 8617 section 4.1.3) before any key is looked up. */
function prepareSeal(set: ArcSet): Seal | string {
  const at = `i=${set.instance} as`
  const { tags, valid } = parseTags(set.seal.raw.slice(set.seal.raw.indexOf(':') + 1))
  if (!valid) return `${at} syntax error`
  const missing = sealTags.find((name) => !tags.has(name))
  if (missing) return `${at} has no ${missing}=`
  const timestamp = tags.get('t')
  if (timestamp !== undefined && !/^\d{1,12}$/.test(timestamp)) return `${at} has an invalid t=`
  if (tags.has('h')) return `${at} has h=`
  const type = sealAlgorithms[stripFws(tags.get('a')!).toLowerCase()]
  if (!type) return `${at} has an unknown algorithm`
  const domain = toALabel(binaryToText(tags.get('d')!))
  if (!domain || !isDomainName(domain)) return `${at} has an invalid d=`
  const selector = toALabel(binaryToText(tags.get('s')!))
  const keyName = `${selector}._domainkey.${domain}`
  if (!selector || !isSelector(selector) || !fitsDns(keyName)) return `${at} has an invalid s=`
  const value = decodeBase64(tags.get('b')!)
  if (!value) return `${at} syntax error`
  return { set, type, value, domain, selector, keyName }
}
