import * as DnsPacket from '@portable/dns-packet'
import responses from './fixtures/responses.json' with { type: 'json' }

export const hex = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(text.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16))

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

/** Decodes the `dns` parameter of a GET request as RFC 8484 section 6 defines it. */
export function decodeQuery(request: Request): DnsPacket.DecodedPacket {
  const value = new URL(request.url).searchParams.get('dns') ?? ''
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
  return DnsPacket.decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

/**
 * What a fake server sends back. A packet is encoded as a response to the question, and its
 * fields replace the defaults. `'hang'` never answers, until the request is aborted.
 */
export type Reply = DnsPacket.Packet | Uint8Array<ArrayBuffer> | Response | Error | 'hang'

export type Server = (question: DnsPacket.DecodedQuestion, request: Request) => Reply

/** Encodes `reply` as the response to `query`, with RD and RA set. */
export function respond(
  query: { id: number; questions: readonly DnsPacket.Question[] },
  reply: DnsPacket.Packet,
): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    DnsPacket.encode({
      id: query.id,
      type: 'response',
      flags: { rd: true, ra: true },
      questions: query.questions,
      ...reply,
    }),
  )
}

/** A `fetch` that answers DNS-over-HTTPS requests with `server`, and the requests it received. */
export function doh(server: Server): {
  fetch: (request: Request) => Promise<Response>
  requests: Request[]
} {
  const requests: Request[] = []
  async function fetch(request: Request): Promise<Response> {
    requests.push(request)
    const query = decodeQuery(request)
    const reply = server(query.questions[0]!, request)
    if (reply === 'hang')
      return new Promise((_, reject) => {
        request.signal.addEventListener('abort', () => reject(request.signal.reason))
      })
    if (reply instanceof Error) throw reply
    if (reply instanceof Response) return reply
    const body = reply instanceof Uint8Array ? reply : respond(query, reply)
    return new Response(body, { headers: { 'content-type': 'application/dns-message' } })
  }
  return { fetch, requests }
}

/** Shorthand for an answer record owned by `name`. */
export const record = (
  name: string,
  type: string,
  data: unknown,
  ttl = 300,
): DnsPacket.ResourceRecord => ({ name, type, data, ttl }) as DnsPacket.ResourceRecord

/** Real responses from Cloudflare and Google, keyed by `'<name> <type> <server>'`. */
export const recorded: ReadonlyMap<string, Uint8Array<ArrayBuffer>> = new Map(
  responses.map((entry) => [`${entry.query} ${entry.server}`, hex(entry.hex)]),
)

/**
 * A server that replays the recorded response for each question, re-encoded with the request's ID.
 */
export function replay(server: 'cloudflare-dns.com' | 'dns.google'): Server {
  return (question) => {
    const bytes = recorded.get(`${question.name} ${question.type} ${server}`)
    if (!bytes) throw new Error(`No recording for ${question.name} ${question.type}`)
    return bytes
  }
}

export { responses }
