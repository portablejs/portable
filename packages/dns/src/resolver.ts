import * as Base64 from '@portable/base64'
import * as DnsPacket from '@portable/dns-packet'
import * as Errors from '@portable/errors'
import * as Ip from '@portable/ip'
import { QueryError } from './errors.js'
import { hostToAscii } from '@portable/idna/internal'

/** A mail exchange, as `resolveMx` returns it. */
export type MxRecord = { exchange: string; priority: number }

/** A service location, as `resolveSrv` returns it. `name` is the target host. */
export type SrvRecord = { name: string; port: number; priority: number; weight: number }

/** A start of authority, as `resolveSoa` returns it. */
export type SoaRecord = {
  nsname: string
  hostmaster: string
  serial: number
  refresh: number
  retry: number
  expire: number
  minttl: number
}

/**
 * A certification authority authorization, as `resolveCaa` returns it. `critical` is the whole
 * flags byte (128 when the issuer-critical bit is set), and the tag is the key of the value. A tag
 * not listed here is still set on the object.
 */
export type CaaRecord = {
  critical: number
  issue?: string | undefined
  issuewild?: string | undefined
  iodef?: string | undefined
  contactemail?: string | undefined
  contactphone?: string | undefined
}

/** A naming authority pointer, as `resolveNaptr` returns it. */
export type NaptrRecord = {
  flags: string
  service: string
  regexp: string
  replacement: string
  order: number
  preference: number
}

/**
 * The lookups that SPF, DMARC and DKIM need, with the method names and result shapes of
 * `node:dns/promises`. `create` returns one, and `node:dns/promises`, a `new Resolver()` from it
 * and a plain object of functions in a test also match the type.
 *
 * @example
 * ```ts
 * import * as Dns from '@portable/dns'
 *
 * async function dmarcRecord(resolver: Dns.Resolver, domain: string) {
 *   const records = await resolver.resolveTxt(`_dmarc.${domain}`)
 *   return records.map((chunks) => chunks.join('')).find((text) => text.startsWith('v=DMARC1'))
 * }
 *
 * await dmarcRecord(Dns.create(), 'example.com')
 * ```
 */
export type Resolver = {
  /** IPv4 addresses (A records). */
  resolve4(name: string, options?: create.CallOptions): Promise<string[]>
  /** IPv6 addresses (AAAA records), formatted as RFC 5952 recommends. */
  resolve6(name: string, options?: create.CallOptions): Promise<string[]>
  /** The CNAME targets of `name` itself. */
  resolveCname(name: string, options?: create.CallOptions): Promise<string[]>
  resolveMx(name: string, options?: create.CallOptions): Promise<MxRecord[]>
  resolveNs(name: string, options?: create.CallOptions): Promise<string[]>
  resolvePtr(name: string, options?: create.CallOptions): Promise<string[]>
  /** One array per TXT record, holding its character-strings decoded as UTF-8. Join them for SPF, DKIM and DMARC. */
  resolveTxt(name: string, options?: create.CallOptions): Promise<string[][]>
  resolveSrv(name: string, options?: create.CallOptions): Promise<SrvRecord[]>
  /** The first SOA record. */
  resolveSoa(name: string, options?: create.CallOptions): Promise<SoaRecord>
  resolveCaa(name: string, options?: create.CallOptions): Promise<CaaRecord[]>
  resolveNaptr(name: string, options?: create.CallOptions): Promise<NaptrRecord[]>
  /** Host names for an IPv4 or IPv6 address, from a PTR lookup under `in-addr.arpa` or `ip6.arpa`. */
  reverse(ip: string, options?: create.CallOptions): Promise<string[]>
}

export declare namespace create {
  type Options = {
    /**
     * DNS-over-HTTPS endpoints (RFC 8484), tried in order. The next one is tried when a request
     * fails, times out, or gets SERVFAIL, REFUSED, NOTIMP, FORMERR or a truncated response.
     * @default ['https://cloudflare-dns.com/dns-query', 'https://dns.google/dns-query']
     */
    endpoints?: readonly (string | URL)[] | undefined
    /**
     * Sends each request. Pass one to add headers, route through a proxy, or mock in tests.
     * @default globalThis.fetch
     */
    fetch?: ((request: Request) => Promise<Response>) | undefined
    /** Milliseconds to wait for each endpoint, including reading the response body. @default 5000 */
    timeout?: number | undefined
  }

  type CallOptions = {
    /** Cancels the lookup, which then rejects with `signal.reason`, as `fetch` does. */
    signal?: AbortSignal | undefined
  }

  type ReturnType = Resolver & {
    /**
     * Sends one question of any type and returns the whole decoded response, with TTLs, the
     * authority section and the AD flag. It resolves for NOERROR and NXDOMAIN, so `answers` can be
     * empty, and rejects with `QueryError` like the other methods for everything else.
     */
    query(
      name: string,
      type: DnsPacket.RecordType,
      options?: CallOptions,
    ): Promise<DnsPacket.DecodedPacket>
  }
}

const defaultEndpoints = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/dns-query']

const failures: Partial<Record<DnsPacket.Rcode, QueryError.Code>> = {
  SERVFAIL: 'ESERVFAIL',
  REFUSED: 'EREFUSED',
  NOTIMP: 'ENOTIMP',
  FORMERR: 'EFORMERR',
}

const headers = { accept: 'application/dns-message' }

const text = new TextDecoder('utf-8', { ignoreBOM: true })

const canonical = (name: string) => (name.endsWith('.') ? name.slice(0, -1) : name).toLowerCase()

const host = (name: string) => (name === '.' ? '' : name)

const syscallFor = (type: string) => `query${type[0]}${type.slice(1).toLowerCase()}`

const hostName = /^(?:(?:[\w*/-]|\\.)+(?:\.(?:[\w*/-]|\\.)+)*\.?|\.?)$/

const nonAscii = /[\u{80}-\u{10ffff}]/gu

function toQueryName(name: string, syscall: string): string {
  if (typeof name !== 'string') throw new TypeError('The name must be a string.')
  const masked = name.replace(nonAscii, 'a')
  if (!hostName.test(masked)) throw new QueryError({ code: 'EBADNAME', syscall, hostname: name })
  if (masked === name) return name
  const ascii = hostToAscii(name)
  if (ascii === undefined || !hostName.test(ascii))
    throw new QueryError({ code: 'EBADNAME', syscall, hostname: name })
  return ascii
}

function reverseName(ip: string): string | undefined {
  if (!Ip.canParse(ip)) return undefined
  const address = Ip.parse(ip)
  if (address.version === 6 && address.zone !== undefined) return undefined
  return Ip.reverseName(address)
}

type DataOf<value extends string> =
  Extract<DnsPacket.DecodedResourceRecord, { type: value }> extends {
    data: infer data
  }
    ? data
    : never

function recordsFor<value extends string>(
  packet: DnsPacket.DecodedPacket,
  name: string,
  type: value,
): DataOf<value>[] {
  const found: DataOf<value>[] = []
  let owner = canonical(name)
  for (let hops = 0; hops <= packet.answers.length; hops++) {
    let target: string | undefined
    for (const record of packet.answers) {
      if (canonical(record.name) !== owner) continue
      if (record.type === type) found.push((record as unknown as { data: DataOf<value> }).data)
      else if (record.type === 'CNAME') target = record.data
    }
    if (found.length > 0 || target === undefined) break
    owner = canonical(target)
  }
  return found
}

/**
 * Creates a resolver that sends DNS queries over HTTPS (RFC 8484) with `fetch`, so lookups work in
 * browsers, Workers and other runtimes without a system resolver. Queries are GET requests with a
 * DNS ID of 0, which HTTP caches can store and which need no CORS preflight. Results and error
 * codes match `node:dns/promises`, and CNAME chains in the answer are followed.
 *
 * @example
 * ```ts
 * import * as Dns from '@portable/dns'
 *
 * const resolver = Dns.create({ timeout: 2000 })
 * const records = await resolver.resolveTxt('example.com')
 * const spf = records.map((chunks) => chunks.join('')).find((text) => text.startsWith('v=spf1'))
 * ```
 */
export function create(options: create.Options = {}): create.ReturnType {
  const endpoints = (options.endpoints ?? defaultEndpoints).map((endpoint) => {
    const url = new URL(endpoint)
    url.hash = ''
    url.searchParams.delete('dns')
    return `${url.href}${url.search ? '&' : '?'}dns=`
  })
  if (endpoints.length === 0) throw new RangeError('At least one endpoint is required.')
  const timeout = options.timeout ?? 5000
  if (!(timeout > 0 && timeout <= 2 ** 31 - 1))
    throw new RangeError('`timeout` must be a number of milliseconds above 0.')
  const send = options.fetch ?? ((request: Request) => fetch(request))

  async function attempt(
    endpoint: string,
    query: string,
    question: { name: string; type: string; syscall: string; hostname: string },
    signal: AbortSignal | undefined,
  ): Promise<DnsPacket.DecodedPacket | QueryError> {
    const { syscall, hostname } = question
    // AbortSignal.timeout holds its signal weakly in Node, so a fetch that never settles could be
    // garbage collected along with its timer and leave the lookup pending forever.
    const deadline = new AbortController()
    const timer = setTimeout(() => deadline.abort(), timeout)
    let bytes: Uint8Array
    try {
      const response = await send(
        new Request(endpoint + query, {
          headers,
          signal: signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal,
        }),
      )
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        return new QueryError({
          code: 'EBADRESP',
          syscall,
          hostname,
          cause: new Errors.ResponseError({
            response,
            message: `${new URL(endpoint).origin} answered HTTP ${response.status}.`,
          }),
        })
      }
      bytes = new Uint8Array(await response.arrayBuffer())
    } catch (cause) {
      signal?.throwIfAborted()
      return new QueryError({
        code: deadline.signal.aborted ? 'ETIMEOUT' : 'ECONNREFUSED',
        syscall,
        hostname,
        cause,
      })
    } finally {
      clearTimeout(timer)
    }
    let packet: DnsPacket.DecodedPacket
    try {
      packet = DnsPacket.decode(bytes)
    } catch (cause) {
      return new QueryError({ code: 'EBADRESP', syscall, hostname, cause })
    }
    const echoed = packet.questions[0]
    if (
      packet.type !== 'response' ||
      packet.questions.length !== 1 ||
      echoed?.type !== question.type ||
      canonical(echoed.name) !== canonical(question.name)
    )
      return new QueryError({
        code: 'EBADRESP',
        syscall,
        hostname,
        cause: new Error('The response is for a different question.'),
      })
    if (packet.flags.tc)
      return new QueryError({
        code: 'EBADRESP',
        syscall,
        hostname,
        cause: new Error('The response is truncated.'),
      })
    if (packet.rcode === 'NOERROR' || packet.rcode === 'NXDOMAIN') return packet
    return new QueryError({
      code: failures[packet.rcode] ?? 'EBADRESP',
      syscall,
      hostname,
      cause: new Error(`The server answered ${packet.rcode}.`),
    })
  }

  async function exchange(
    hostname: string,
    name: string,
    type: DnsPacket.RecordType,
    syscall: string,
    signal: AbortSignal | undefined,
  ): Promise<DnsPacket.DecodedPacket> {
    signal?.throwIfAborted()
    if (/(?:^|\.)onion\.?$/i.test(name))
      throw new QueryError({ code: 'ENOTFOUND', syscall, hostname })
    let query: string
    try {
      query = Base64.encode(
        DnsPacket.encode({ flags: { rd: true, ad: true }, questions: [{ name, type }] }),
        { alphabet: 'base64url', omitPadding: true },
      )
    } catch (cause) {
      throw new QueryError({ code: 'EBADNAME', syscall, hostname, cause })
    }
    let error: QueryError | undefined
    for (const endpoint of endpoints) {
      const result = await attempt(endpoint, query, { name, type, syscall, hostname }, signal)
      if (!(result instanceof QueryError)) return result
      error = result
    }
    throw error
  }

  async function lookup<value extends DnsPacket.RecordType>(
    hostname: string,
    name: string,
    type: value,
    syscall: string,
    signal: AbortSignal | undefined,
  ): Promise<DataOf<value>[]> {
    const packet = await exchange(hostname, name, type, syscall, signal)
    if (packet.rcode === 'NXDOMAIN') throw new QueryError({ code: 'ENOTFOUND', syscall, hostname })
    const records = recordsFor(packet, name, type)
    if (records.length === 0) throw new QueryError({ code: 'ENODATA', syscall, hostname })
    return records
  }

  async function resolve<value extends DnsPacket.RecordType>(
    name: string,
    type: value,
    options: create.CallOptions = {},
  ): Promise<DataOf<value>[]> {
    const syscall = syscallFor(type)
    return lookup(name, toQueryName(name, syscall), type, syscall, options.signal)
  }

  return {
    resolve4: (name, options) => resolve(name, 'A', options),
    resolve6: (name, options) => resolve(name, 'AAAA', options),
    resolveCname: async (name, options) => (await resolve(name, 'CNAME', options)).map(host),
    resolveNs: async (name, options) => (await resolve(name, 'NS', options)).map(host),
    resolvePtr: async (name, options) => (await resolve(name, 'PTR', options)).map(host),
    async resolveMx(name, options) {
      const records = await resolve(name, 'MX', options)
      return records.map((data) => ({ exchange: host(data.exchange), priority: data.preference }))
    },
    async resolveTxt(name, options) {
      const records = await resolve(name, 'TXT', options)
      return records.map((strings) => strings.map((bytes) => text.decode(bytes)))
    },
    async resolveSrv(name, options) {
      const records = await resolve(name, 'SRV', options)
      return records.map((data) => ({
        name: host(data.target),
        port: data.port,
        priority: data.priority,
        weight: data.weight,
      }))
    },
    async resolveSoa(name, options) {
      const [data] = (await resolve(name, 'SOA', options)) as [DataOf<'SOA'>]
      return {
        nsname: host(data.mname),
        hostmaster: host(data.rname),
        serial: data.serial,
        refresh: data.refresh,
        retry: data.retry,
        expire: data.expire,
        minttl: data.minimum,
      }
    },
    async resolveCaa(name, options) {
      const records = await resolve(name, 'CAA', options)
      return records.map((data) => ({ critical: data.flags, [data.tag]: data.value }))
    },
    async resolveNaptr(name, options) {
      const records = await resolve(name, 'NAPTR', options)
      return records.map((data) => ({
        flags: data.flags,
        service: data.services,
        regexp: data.regexp,
        replacement: host(data.replacement),
        order: data.order,
        preference: data.preference,
      }))
    },
    async reverse(ip, options = {}) {
      const name = reverseName(ip)
      if (name === undefined)
        throw new QueryError({ code: 'EINVAL', syscall: 'getHostByAddr', hostname: ip })
      const packet = await exchange(ip, name, 'PTR', 'getHostByAddr', options.signal)
      const records = recordsFor(packet, name, 'PTR')
      if (records.length === 0)
        throw new QueryError({ code: 'ENOTFOUND', syscall: 'getHostByAddr', hostname: ip })
      return records.map(host)
    },
    async query(name, type, options = {}) {
      const syscall = syscallFor(type)
      return exchange(name, toQueryName(name, syscall), type, syscall, options.signal)
    },
  }
}
