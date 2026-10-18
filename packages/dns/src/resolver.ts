import * as DnsPacket from '@portable/dns-packet'
import { QueryError } from './errors.js'

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
 * `node:dns/promises`. The object `createResolver` returns fits it, and so do `node:dns/promises`
 * itself, `new Resolver()` from it, and a plain object of functions in tests.
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
 * await dmarcRecord(Dns.createResolver(), 'example.com')
 * ```
 */
export type Resolver = {
  resolve4(name: string): Promise<string[]>
  resolve6(name: string): Promise<string[]>
  resolveCname(name: string): Promise<string[]>
  resolveMx(name: string): Promise<MxRecord[]>
  resolveNs(name: string): Promise<string[]>
  resolvePtr(name: string): Promise<string[]>
  resolveTxt(name: string): Promise<string[][]>
  resolveSrv(name: string): Promise<SrvRecord[]>
  resolveSoa(name: string): Promise<SoaRecord>
  resolveCaa(name: string): Promise<CaaRecord[]>
  resolveNaptr(name: string): Promise<NaptrRecord[]>
  reverse(ip: string): Promise<string[]>
}

export declare namespace createResolver {
  type Options = {
    /**
     * DNS-over-HTTPS endpoints (RFC 8484), tried in order. The next one is tried when a request
     * fails, times out, or gets SERVFAIL, REFUSED, NOTIMP, FORMERR or a truncated response.
     * @default ['https://cloudflare-dns.com/dns-query', 'https://dns.google/dns-query']
     */
    endpoints?: readonly (string | URL)[] | undefined
    /** Sends each request. Pass one to add headers, route through a proxy, or mock in tests. @default globalThis.fetch */
    fetch?: ((request: Request) => Promise<Response>) | undefined
    /** Milliseconds to wait for each endpoint, including reading the response body. @default 5000 */
    timeout?: number | undefined
  }

  type CallOptions = {
    /** Cancels the lookup. It rejects with `signal.reason`, as `fetch` does. */
    signal?: AbortSignal | undefined
  }

  type ReturnType = {
    /** IPv4 addresses (A records). */
    resolve4(name: string, options?: CallOptions): Promise<string[]>
    /** IPv6 addresses (AAAA records), formatted as RFC 5952 recommends. */
    resolve6(name: string, options?: CallOptions): Promise<string[]>
    /** The CNAME targets of `name` itself. */
    resolveCname(name: string, options?: CallOptions): Promise<string[]>
    resolveMx(name: string, options?: CallOptions): Promise<MxRecord[]>
    resolveNs(name: string, options?: CallOptions): Promise<string[]>
    resolvePtr(name: string, options?: CallOptions): Promise<string[]>
    /** One array per TXT record, holding its character-strings decoded as UTF-8. Join them for SPF, DKIM and DMARC. */
    resolveTxt(name: string, options?: CallOptions): Promise<string[][]>
    resolveSrv(name: string, options?: CallOptions): Promise<SrvRecord[]>
    /** The first SOA record. */
    resolveSoa(name: string, options?: CallOptions): Promise<SoaRecord>
    resolveCaa(name: string, options?: CallOptions): Promise<CaaRecord[]>
    resolveNaptr(name: string, options?: CallOptions): Promise<NaptrRecord[]>
    /** Host names for an IPv4 or IPv6 address, from a PTR lookup under `in-addr.arpa` or `ip6.arpa`. */
    reverse(ip: string, options?: CallOptions): Promise<string[]>
    /**
     * Sends one question of any type and returns the whole decoded response, with TTLs, the
     * authority section and the AD flag. It resolves for NOERROR and NXDOMAIN, so `answers` can be
     * empty, and throws `QueryError` like the other methods for everything else.
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

const text = new TextDecoder('utf-8', { ignoreBOM: true })

const canonical = (name: string) => (name.endsWith('.') ? name.slice(0, -1) : name).toLowerCase()

const syscallFor = (type: string) => `query${type[0]}${type.slice(1).toLowerCase()}`

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')

function toQueryName(name: string, syscall: string): string {
  if (typeof name !== 'string') throw new TypeError('The name must be a string.')
  if (!/[\u0080-￿]/.test(name)) return name
  if (/[\s/?#@:\\%[\]]/.test(name)) throw new QueryError('EBADNAME', syscall, name)
  try {
    return new URL(`http://${name}/`).hostname
  } catch (cause) {
    throw new QueryError('EBADNAME', syscall, name, { cause })
  }
}

function reverseName(ip: string): string | undefined {
  const type = ip.includes(':') ? 'AAAA' : 'A'
  let bytes: Uint8Array
  try {
    bytes = DnsPacket.encode({ answers: [{ type, name: '.', data: ip }] })
  } catch {
    return undefined
  }
  const address = [...bytes.subarray(type === 'A' ? -4 : -16)].reverse()
  if (type === 'A') return `${address.join('.')}.in-addr.arpa`
  return `${address.map((byte) => `${(byte & 15).toString(16)}.${(byte >> 4).toString(16)}`).join('.')}.ip6.arpa`
}

type DataOf<T extends string> =
  Extract<DnsPacket.DecodedResourceRecord, { type: T }> extends {
    data: infer D
  }
    ? D
    : never

function recordsFor<T extends string>(
  packet: DnsPacket.DecodedPacket,
  name: string,
  type: T,
): DataOf<T>[] {
  const found: DataOf<T>[] = []
  let owner = canonical(name)
  for (let hops = 0; hops <= packet.answers.length; hops++) {
    let target: string | undefined
    for (const record of packet.answers) {
      if (canonical(record.name) !== owner) continue
      if (record.type === type) found.push((record as unknown as { data: DataOf<T> }).data)
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
 * const resolver = Dns.createResolver({ timeout: 2000 })
 * const records = await resolver.resolveTxt('example.com')
 * const spf = records.map((chunks) => chunks.join('')).find((text) => text.startsWith('v=spf1'))
 * ```
 */
export function createResolver(options: createResolver.Options = {}): createResolver.ReturnType {
  const endpoints = (options.endpoints ?? defaultEndpoints).map((endpoint) => new URL(endpoint))
  if (endpoints.length === 0) throw new TypeError('At least one endpoint is required.')
  const timeout = options.timeout ?? 5000
  if (!(timeout > 0 && timeout <= 2 ** 31 - 1))
    throw new RangeError('`timeout` must be a number of milliseconds above 0.')
  const send = options.fetch ?? ((request: Request) => fetch(request))

  async function attempt(
    endpoint: URL,
    query: string,
    question: { name: string; type: string; syscall: string; hostname: string },
    signal: AbortSignal | undefined,
  ): Promise<DnsPacket.DecodedPacket | QueryError> {
    const { syscall, hostname } = question
    const url = new URL(endpoint)
    url.searchParams.set('dns', query)
    // AbortSignal.timeout holds its signal weakly in Node, so a fetch that never settles could be
    // garbage collected along with its timer and leave the lookup pending forever.
    const deadline = new AbortController()
    const timer = setTimeout(() => deadline.abort(), timeout)
    let bytes: Uint8Array
    try {
      const response = await send(
        new Request(url, {
          headers: { accept: 'application/dns-message' },
          signal: signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal,
        }),
      )
      if (!response.ok)
        return new QueryError('EBADRESP', syscall, hostname, {
          cause: new Error(`${url.origin} answered HTTP ${response.status}.`),
        })
      bytes = new Uint8Array(await response.arrayBuffer())
    } catch (cause) {
      signal?.throwIfAborted()
      return new QueryError(
        deadline.signal.aborted ? 'ETIMEOUT' : 'ECONNREFUSED',
        syscall,
        hostname,
        { cause },
      )
    } finally {
      clearTimeout(timer)
    }
    let packet: DnsPacket.DecodedPacket
    try {
      packet = DnsPacket.decode(bytes)
    } catch (cause) {
      return new QueryError('EBADRESP', syscall, hostname, { cause })
    }
    const echoed = packet.questions[0]
    if (
      packet.type !== 'response' ||
      packet.questions.length !== 1 ||
      echoed?.type !== question.type ||
      canonical(echoed.name) !== canonical(question.name)
    )
      return new QueryError('EBADRESP', syscall, hostname, {
        cause: new Error('The response is for a different question.'),
      })
    if (packet.flags.tc)
      return new QueryError('EBADRESP', syscall, hostname, {
        cause: new Error('The response is truncated.'),
      })
    if (packet.rcode === 'NOERROR' || packet.rcode === 'NXDOMAIN') return packet
    return new QueryError(failures[packet.rcode] ?? 'EBADRESP', syscall, hostname, {
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
    if (/(?:^|\.)onion\.?$/i.test(name)) throw new QueryError('ENOTFOUND', syscall, hostname)
    let query: string
    try {
      query = base64url(DnsPacket.encode({ flags: { rd: true }, questions: [{ name, type }] }))
    } catch (cause) {
      throw new QueryError('EBADNAME', syscall, hostname, { cause })
    }
    let error: QueryError | undefined
    for (const endpoint of endpoints) {
      const result = await attempt(endpoint, query, { name, type, syscall, hostname }, signal)
      if (!(result instanceof QueryError)) return result
      error = result
    }
    throw error
  }

  async function lookup<T extends DnsPacket.RecordType>(
    hostname: string,
    name: string,
    type: T,
    syscall: string,
    signal: AbortSignal | undefined,
  ): Promise<DataOf<T>[]> {
    const packet = await exchange(hostname, name, type, syscall, signal)
    if (packet.rcode === 'NXDOMAIN') throw new QueryError('ENOTFOUND', syscall, hostname)
    const records = recordsFor(packet, name, type)
    if (records.length === 0) throw new QueryError('ENODATA', syscall, hostname)
    return records
  }

  async function resolve<T extends DnsPacket.RecordType>(
    name: string,
    type: T,
    options: createResolver.CallOptions = {},
  ): Promise<DataOf<T>[]> {
    const syscall = syscallFor(type)
    return lookup(name, toQueryName(name, syscall), type, syscall, options.signal)
  }

  return {
    resolve4: (name, options) => resolve(name, 'A', options),
    resolve6: (name, options) => resolve(name, 'AAAA', options),
    resolveCname: (name, options) => resolve(name, 'CNAME', options),
    resolveNs: (name, options) => resolve(name, 'NS', options),
    resolvePtr: (name, options) => resolve(name, 'PTR', options),
    async resolveMx(name, options) {
      const records = await resolve(name, 'MX', options)
      return records.map((data) => ({ exchange: data.exchange, priority: data.preference }))
    },
    async resolveTxt(name, options) {
      const records = await resolve(name, 'TXT', options)
      return records.map((strings) => strings.map((bytes) => text.decode(bytes)))
    },
    async resolveSrv(name, options) {
      const records = await resolve(name, 'SRV', options)
      return records.map((data) => ({
        name: data.target,
        port: data.port,
        priority: data.priority,
        weight: data.weight,
      }))
    },
    async resolveSoa(name, options) {
      const [data] = (await resolve(name, 'SOA', options)) as [DataOf<'SOA'>]
      return {
        nsname: data.mname,
        hostmaster: data.rname,
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
        replacement: data.replacement,
        order: data.order,
        preference: data.preference,
      }))
    },
    async reverse(ip, options = {}) {
      const name = reverseName(ip)
      if (name === undefined) throw new QueryError('EINVAL', 'getHostByAddr', ip)
      return lookup(ip, name, 'PTR', 'getHostByAddr', options.signal)
    },
    async query(name, type, options = {}) {
      const syscall = syscallFor(type)
      return exchange(name, toQueryName(name, syscall), type, syscall, options.signal)
    },
  }
}
