import * as Address from './address.js'
import * as Bootstrap from './bootstrap.js'
import { InvalidInputError, UnsupportedError } from './errors.js'
import {
  relatedLink,
  toAutnum,
  toDomain,
  toNetwork,
  withReferral,
  type Autnum,
  type Domain,
  type Network,
} from './normalize.js'
import { request, type Fetch } from './request.js'
import { hostToAscii } from '@portable/idna/internal'

type Shared = {
  /**
   * The function that sends each `Request`. Pass one to add headers, set a
   * timeout, route through a proxy, or mock responses. Bootstrap files are cached separately for
   * each `fetch` function.
   * @default globalThis.fetch
   */
  fetch?: Fetch | undefined
  /** Cancels the lookup. It rejects with `signal.reason`, as `fetch` does. */
  signal?: AbortSignal | undefined
}

export declare namespace domain {
  type Options = Shared & {
    /**
     * Fetches the registrar's response when the registry links to it, and takes the contacts from
     * it. A failed referral doesn't fail the lookup: `referral.error` holds the error.
     * @default true
     */
    follow?: boolean | undefined
  }
}

export declare namespace ip {
  type Options = Shared
}

export declare namespace asn {
  type Options = Shared
}

const defaultFetch: Fetch = (request) => globalThis.fetch(request)

const label = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/

function toAscii(name: string): string {
  if (typeof name !== 'string') throw new TypeError('The domain name must be a string')
  const host = hostToAscii(name)?.replace(/\.$/, '')
  if (host === undefined) throw new InvalidInputError(`Not a domain name: ${name}`)
  const labels = host.split('.')
  if (
    host.length > 253 ||
    labels.length < 2 ||
    !labels.every((part) => label.test(part)) ||
    /^\d+$/.test(labels.at(-1)!)
  )
    throw new InvalidInputError(`Not a domain name: ${name}`)
  return host
}

/**
 * Looks up a domain name. The registry comes from IANA's bootstrap file (RFC 9224), which is cached
 * in memory for 24 hours. Unicode names are converted to A-labels with the IDNA rules `URL` uses.
 * When the registry links to the registrar's response, as gTLD registries do, that response is
 * fetched too and its contacts are used.
 *
 * Rejects with `InvalidInputError` for a malformed name, `UnsupportedError` when the TLD has no
 * RDAP server, and `NotFoundError` when the name isn't registered.
 *
 * @example
 * ```ts
 * import * as Rdap from '@portable/rdap'
 *
 * const domain = await Rdap.domain('example.com')
 * domain.events.expiration // Date
 * domain.entities.find((entity) => entity.roles.includes('registrar'))?.name
 * ```
 */
export async function domain(name: string, options: domain.Options = {}): Promise<Domain> {
  const { fetch = defaultFetch, signal, follow = true } = options
  const ascii = toAscii(name)
  const base = await Bootstrap.domain(ascii, fetch, signal)
  if (!base) throw new UnsupportedError(`IANA lists no RDAP server for ${ascii}`)
  const url = new URL(`domain/${ascii}`, base).href
  const { json } = await request(url, fetch, signal)
  const result = toDomain(json, ascii)
  const related = follow ? relatedLink(json, url) : undefined
  if (!related) return result
  try {
    return withReferral(result, related, (await request(related, fetch, signal)).json)
  } catch (error) {
    signal?.throwIfAborted()
    return { ...result, referral: { url: related, error } }
  }
}

/**
 * Looks up the network that contains an IPv4 or IPv6 address, or a prefix such as
 * `192.0.2.0/24`. The regional internet registry comes from IANA's bootstrap file, by the
 * longest matching prefix.
 *
 * Rejects with `InvalidInputError` for a malformed address, `UnsupportedError` for an address no
 * registry serves, such as `10.0.0.1`, and `NotFoundError` when the registry has no record.
 *
 * @example
 * ```ts
 * import * as Rdap from '@portable/rdap'
 *
 * const network = await Rdap.ip('8.8.8.8')
 * network.cidrs // ['8.8.8.0/24']
 * network.entities.find((entity) => entity.roles.includes('abuse'))?.email
 * ```
 */
export async function ip(address: string, options: ip.Options = {}): Promise<Network> {
  const { fetch = defaultFetch, signal } = options
  if (typeof address !== 'string') throw new TypeError('The address must be a string')
  const prefix = Address.parse(address)
  if (!prefix) throw new InvalidInputError(`Not an IP address or prefix: ${address}`)
  const query = Address.format(prefix)
  const base = await Bootstrap.ip(prefix, fetch, signal)
  if (!base) throw new UnsupportedError(`IANA lists no RDAP server for ${query}`)
  return toNetwork((await request(new URL(`ip/${query}`, base).href, fetch, signal)).json)
}

/**
 * Looks up an autonomous system number, such as `15169`. The regional internet registry comes from
 * IANA's bootstrap file.
 *
 * Rejects with `InvalidInputError` for a number outside 0 to 4294967295, `UnsupportedError` for a
 * number no registry serves, and `NotFoundError` when the registry has no record.
 *
 * @example
 * ```ts
 * import * as Rdap from '@portable/rdap'
 *
 * const autnum = await Rdap.asn(15169)
 * autnum.name // 'GOOGLE'
 * ```
 */
export async function asn(number: number, options: asn.Options = {}): Promise<Autnum> {
  const { fetch = defaultFetch, signal } = options
  if (!Number.isInteger(number) || number < 0 || number > 0xffffffff)
    throw new InvalidInputError(`Not an AS number: ${number}`)
  const base = await Bootstrap.asn(number, fetch, signal)
  if (!base) throw new UnsupportedError(`IANA lists no RDAP server for AS${number}`)
  return toAutnum((await request(new URL(`autnum/${number}`, base).href, fetch, signal)).json)
}
