import asn from './fixtures/bootstrap-asn.json' with { type: 'json' }
import dns from './fixtures/bootstrap-dns.json' with { type: 'json' }
import ipv4 from './fixtures/bootstrap-ipv4.json' with { type: 'json' }
import ipv6 from './fixtures/bootstrap-ipv6.json' with { type: 'json' }
import afnicGoogleFr from './fixtures/afnic-google.fr.json' with { type: 'json' }
import apnic1111 from './fixtures/apnic-1.1.1.1.json' with { type: 'json' }
import arin8888 from './fixtures/arin-8.8.8.8.json' with { type: 'json' }
import arinAs15169 from './fixtures/arin-as15169.json' with { type: 'json' }
import dynadotMunchen from './fixtures/dynadot-xn--mnchen-3ya.com.json' with { type: 'json' }
import markmonitorGoogle from './fixtures/markmonitor-google.com.json' with { type: 'json' }
import markmonitorWikipedia from './fixtures/markmonitor-wikipedia.org.json' with { type: 'json' }
import nominetBbc from './fixtures/nominet-bbc.co.uk.json' with { type: 'json' }
import pirWikipedia from './fixtures/pir-wikipedia.org.json' with { type: 'json' }
import ripe193 from './fixtures/ripe-193.0.6.139.json' with { type: 'json' }
import ripe2001 from './fixtures/ripe-2001-67c-2e8.json' with { type: 'json' }
import ripeAs3333 from './fixtures/ripe-as3333.json' with { type: 'json' }
import sidnNl from './fixtures/sidn-sidn.nl.json' with { type: 'json' }
import verisignGoogle from './fixtures/verisign-google.com.json' with { type: 'json' }
import verisignMunchen from './fixtures/verisign-xn--mnchen-3ya.com.json' with { type: 'json' }

export const bootstrap: Readonly<Record<string, unknown>> = {
  'https://data.iana.org/rdap/dns.json': dns,
  'https://data.iana.org/rdap/ipv4.json': ipv4,
  'https://data.iana.org/rdap/ipv6.json': ipv6,
  'https://data.iana.org/rdap/asn.json': asn,
}

/** Responses recorded on 2026-10-18, keyed by the URL that sent them. */
export const recorded: Readonly<Record<string, Record<string, unknown>>> = {
  'https://rdap.verisign.com/com/v1/domain/google.com': verisignGoogle,
  'https://rdap.markmonitor.com/rdap/domain/GOOGLE.COM': markmonitorGoogle,
  'https://rdap.verisign.com/com/v1/domain/xn--mnchen-3ya.com': verisignMunchen,
  'https://rdap.dynadot.com/domain/XN--MNCHEN-3YA.COM': dynadotMunchen,
  'https://rdap.publicinterestregistry.org/rdap/domain/wikipedia.org': pirWikipedia,
  'https://rdap.markmonitor.com/rdap/domain/wikipedia.org': markmonitorWikipedia,
  'https://rdap.sidn.nl/domain/sidn.nl': sidnNl,
  'https://rdap.nominet.uk/uk/domain/bbc.co.uk': nominetBbc,
  'https://rdap.nic.fr/domain/google.fr': afnicGoogleFr,
  'https://rdap.arin.net/registry/ip/8.8.8.8': arin8888,
  'https://rdap.arin.net/registry/autnum/15169': arinAs15169,
  'https://rdap.db.ripe.net/ip/193.0.6.139': ripe193,
  'https://rdap.db.ripe.net/ip/2001:67c:2e8::1': ripe2001,
  'https://rdap.db.ripe.net/autnum/3333': ripeAs3333,
  'https://rdap.apnic.net/ip/1.1.1.1': apnic1111,
}

/**
 * What the fake server sends for a URL. A plain value is sent as JSON. `'hang'` doesn't answer
 * until the request is aborted. A URL with no reply gets an empty 404, as RDAP servers send.
 */
export type Reply = unknown

export type Server = {
  fetch: (input: Request | string, init?: RequestInit) => Promise<Response>
  /** The URLs requested, in order. */
  urls: string[]
  /** The requests, in order. */
  requests: Request[]
}

/** A `fetch` that answers from `routes`, then the bootstrap files and the recorded responses. */
export function server(routes: Readonly<Record<string, Reply>> = {}): Server {
  const urls = new Array<string>()
  const requests = new Array<Request>()
  async function fetch(input: Request | string, init?: RequestInit): Promise<Response> {
    const request = typeof input === 'string' ? new Request(input, init) : input
    const url = typeof input === 'string' ? input : request.url
    urls.push(url)
    requests.push(request)
    const reply = url in routes ? routes[url] : (bootstrap[url] ?? recorded[url])
    if (reply === 'hang')
      return new Promise((_, reject) => {
        const signal = request.signal
        if (signal.aborted) reject(signal.reason)
        signal.addEventListener('abort', () => reject(signal.reason))
      })
    if (reply instanceof Error) throw reply
    if (reply instanceof Response) return reply
    if (reply === undefined) return new Response(null, { status: 404 })
    return new Response(JSON.stringify(reply), {
      headers: { 'content-type': 'application/rdap+json' },
    })
  }
  return { fetch, urls, requests }
}

/** A bootstrap file with the given services. */
export const services = (...entries: [string[], string[]][]): Record<string, unknown> => ({
  version: '1.0',
  publication: '2026-10-18T00:00:00Z',
  services: entries,
})

/** The rejection of `promise`, or a failure if it resolves. */
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('Expected a rejection')
    },
    (error: unknown) => error,
  )
}
