import * as DnsPacket from '@portable/dns-packet'
import dgram from 'node:dgram'
import dnsPromises from 'node:dns/promises'
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test'
import { create, type Resolver } from '@portable/dns'
import { doh, record, recorded, respond, utf8 } from './utils.js'

type Handler = (query: DnsPacket.DecodedPacket) => DnsPacket.Packet | Uint8Array

let handler: Handler = () => ({})
const server = dgram.createSocket('udp4')
const node = new dnsPromises.Resolver({ timeout: 1000, tries: 1 })

beforeAll(async () => {
  server.on('message', (message, remote) => {
    const query = DnsPacket.decode(message)
    const reply = handler(query)
    server.send(
      reply instanceof Uint8Array ? withId(reply, query.id) : respond(query, reply),
      remote.port,
      remote.address,
    )
  })
  await new Promise<void>((resolve) => server.bind(0, '127.0.0.1', resolve))
  node.setServers([`127.0.0.1:${server.address().port}`])
})

afterAll(() => server.close())

function withId(bytes: Uint8Array, id: number): Uint8Array {
  const copy = new Uint8Array(bytes)
  copy[0] = id >> 8
  copy[1] = id & 0xff
  return copy
}

const ours = create({
  fetch: doh((_, request) => {
    const query = DnsPacket.decode(
      Uint8Array.from(
        atob(
          new URL(request.url).searchParams.get('dns')!.replaceAll('-', '+').replaceAll('_', '/'),
        ),
        (c) => c.charCodeAt(0),
      ),
    )
    const reply = handler(query)
    return reply instanceof Uint8Array ? new Uint8Array(withId(reply, query.id)) : reply
  }).fetch,
  endpoints: ['https://doh.test/dns-query'],
})

type Method = Exclude<keyof Resolver, 'reverse'>

/** Node adds `type` to MX, SRV and CAA results, and the `Resolver` shapes leave it out. */
function withoutType(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutType)
  if (value && typeof value === 'object' && 'type' in value) {
    const { type: _, ...rest } = value as Record<string, unknown>
    return rest
  }
  return value
}

async function outcome(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return { value: withoutType(await run()) }
  } catch (error) {
    const { code, syscall, hostname, message } = error as Record<string, unknown>
    return { error: { code, syscall, hostname, message } }
  }
}

async function compare(method: Method | 'reverse', name: string, reply: Handler) {
  handler = reply
  const expected = await outcome(() => (node[method] as (name: string) => Promise<unknown>)(name))
  const actual = await outcome(() => ours[method](name))
  expect(actual).toEqual(expected)
  return actual
}

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

const generators: Record<Method, { type: string; data: (next: () => number) => unknown }> = {
  resolve4: { type: 'A', data: (n) => [0, 0, 0, 0].map(() => Math.floor(n() * 256)).join('.') },
  resolve6: {
    type: 'AAAA',
    data: (n) =>
      Array.from({ length: 8 }, (_, i) =>
        (i > 0 && n() < 0.4 ? 0 : 1 + Math.floor(n() * 65535)).toString(16),
      ).join(':'),
  },
  resolveCname: { type: 'CNAME', data: (n) => hostName(n) },
  resolveNs: { type: 'NS', data: (n) => hostName(n) },
  resolvePtr: { type: 'PTR', data: (n) => hostName(n) },
  resolveMx: {
    type: 'MX',
    data: (n) => ({ preference: Math.floor(n() * 65536), exchange: hostName(n) }),
  },
  resolveTxt: {
    type: 'TXT',
    data: (n) =>
      Array.from({ length: 1 + Math.floor(n() * 3) }, () =>
        Array.from({ length: Math.floor(n() * 255) }, () =>
          String.fromCharCode(0x20 + Math.floor(n() * 95)),
        ).join(''),
      ),
  },
  resolveSrv: {
    type: 'SRV',
    data: (n) => ({
      priority: Math.floor(n() * 65536),
      weight: Math.floor(n() * 65536),
      port: Math.floor(n() * 65536),
      target: hostName(n),
    }),
  },
  resolveSoa: {
    type: 'SOA',
    data: (n) => ({
      mname: hostName(n),
      rname: hostName(n),
      serial: Math.floor(n() * 2 ** 32),
      refresh: Math.floor(n() * 2 ** 31),
      retry: Math.floor(n() * 2 ** 31),
      expire: Math.floor(n() * 2 ** 31),
      minimum: Math.floor(n() * 2 ** 32),
    }),
  },
  resolveCaa: {
    type: 'CAA',
    data: (n) => ({
      flags: n() < 0.5 ? 0 : 128,
      tag: ['issue', 'issuewild', 'iodef', 'contactemail'][Math.floor(n() * 4)],
      value: hostName(n),
    }),
  },
  resolveNaptr: {
    type: 'NAPTR',
    data: (n) => ({
      order: Math.floor(n() * 65536),
      preference: Math.floor(n() * 65536),
      flags: n() < 0.5 ? 'S' : 'U',
      services: 'SIP+D2U',
      regexp: n() < 0.5 ? '' : '!^.*$!sip:info@example.org!',
      replacement: n() < 0.5 ? '.' : hostName(n),
    }),
  },
}

function hostName(next: () => number): string {
  const labels = Array.from({ length: 1 + Math.floor(next() * 3) }, () =>
    Array.from({ length: 1 + Math.floor(next() * 12) }, () =>
      'abcdefghijklmnopqrstuvwxyz0123456789-'.charAt(Math.floor(next() * 36)),
    ).join(''),
  )
  return `${labels.join('.')}.example`
}

const randomCase = (name: string, next: () => number) =>
  name.replace(/[a-z]/g, (c) => (next() < 0.5 ? c.toUpperCase() : c))

describe('random answers give the same results as node:dns/promises', () => {
  for (const [method, { type, data }] of Object.entries(generators) as [
    Method,
    (typeof generators)[Method],
  ][]) {
    test(`${method}`, async () => {
      expect.hasAssertions()
      const next = random(method.length * 7919)
      for (let i = 0; i < 25; i++) {
        const name = hostName(next)
        const count =
          method === 'resolveSoa' || method === 'resolveCname' ? 1 : 1 + Math.floor(next() * 5)
        const chain = method !== 'resolveCname' && next() < 0.3 ? hostName(next) : undefined
        const owner = chain ?? name
        const answers = [
          ...(chain ? [record(randomCase(name, next), 'CNAME', chain)] : []),
          ...Array.from({ length: count }, () =>
            record(randomCase(owner, next), type, data(next), Math.floor(next() * 2 ** 31)),
          ),
        ]
        await compare(method, name, () => ({ answers }))
      }
    })
  }
})

describe('response codes give the same errors as node:dns/promises', () => {
  const rcodes = ['NXDOMAIN', 'SERVFAIL', 'REFUSED', 'NOTIMP', 'FORMERR'] as const
  for (const method of Object.keys(generators) as Method[])
    test(`${method}`, async () => {
      expect.hasAssertions()
      for (const rcode of rcodes) await compare(method, 'missing.example.org', () => ({ rcode }))
      await compare(method, 'empty.example.org', () => ({}))
      await compare(method, 'garbage.example.org', () => Uint8Array.of(1, 2, 3))
    })

  test('reverse', async () => {
    const ptr: Handler = (query) => ({
      answers: [record(query.questions[0]!.name, 'PTR', 'host.example')],
    })
    for (const ip of ['192.0.2.255', '10.0.0.1', '2001:db8::1', '::ffff:192.0.2.4', 'fe80::1'])
      await compare('reverse', ip, ptr)
    for (const ip of ['1.2.3', 'bogus ip', '1.2.3.256', ':::1', '01.2.3.4', '::1.2.3.04'])
      expect(await compare('reverse', ip, ptr)).toMatchObject({ error: { code: 'EINVAL' } })
    await compare('reverse', '192.0.2.1', () => ({ rcode: 'NXDOMAIN' }))
    await compare('reverse', '192.0.2.1', () => ({}))
  })
})

describe('names give the same results as node:dns/promises', () => {
  const answerAll: Handler = (query) => ({
    answers: [record(query.questions[0]!.name, 'A', '192.0.2.1')],
  })
  test.each([
    'example.org.',
    '',
    '.',
    '_dmarc.Example.ORG',
    'münchen.de',
    'straße.de',
    '1.2.3.4',
    'foo.onion',
    'FOO.ONION.',
    'foo..com',
    `${'a'.repeat(64)}.com`,
    `${'a'.repeat(63)}.com`,
    'localhost',
    'localhost.',
    'localhost..',
    '..localhost',
    'foo.localhost',
    '..',
    '..a..',
    '.aa.',
    ',.,.',
    ',..',
    '.,',
    'beep..com..',
    '..foo..com.',
    '::1',
    'fe00::0',
    '192.168.1.1',
    '255.255.255.255',
    '*.example.org',
    '0/26.2.0.192.in-addr.arpa',
    '-x.example.org',
    'a\\.b.example',
    'with space.org',
    'evil.example?x',
  ])('%j', async (name) => {
    expect.hasAssertions()
    await compare('resolve4', name, answerAll)
  })
})

describe('recorded responses give the same results as node:dns/promises', () => {
  const methods: Record<string, Method> = {
    A: 'resolve4',
    AAAA: 'resolve6',
    CNAME: 'resolveCname',
    MX: 'resolveMx',
    NS: 'resolveNs',
    PTR: 'resolvePtr',
    TXT: 'resolveTxt',
    SRV: 'resolveSrv',
    SOA: 'resolveSoa',
    CAA: 'resolveCaa',
    NAPTR: 'resolveNaptr',
  }
  test.each([...recorded.keys()])('%s', async (key) => {
    expect.hasAssertions()
    const [name, type] = key.split(' ') as [string, string]
    await compare(methods[type]!, name, () => recorded.get(key)!)
  })
})

describe('deliberate differences from node:dns/promises', () => {
  const N = 'example.org'

  test('TXT is decoded as UTF-8, where Node decodes Latin-1', async () => {
    handler = () => ({ answers: [record(N, 'TXT', [utf8('héllo')])] })
    expect(await node.resolveTxt(N)).toEqual([['hÃ©llo']])
    expect(await ours.resolveTxt(N)).toEqual([['héllo']])
  })

  test('records owned by names outside the CNAME chain are left out', async () => {
    handler = () => ({
      answers: [
        record(N, 'CNAME', 'b.example'),
        record('b.example', 'A', '192.0.2.1'),
        record('unrelated.example', 'A', '192.0.2.66'),
      ],
    })
    expect(await node.resolve4(N)).toEqual(['192.0.2.1', '192.0.2.66'])
    expect(await ours.resolve4(N)).toEqual(['192.0.2.1'])
    handler = () => ({ answers: [record('unrelated.example', 'TXT', ['injected'])] })
    expect(await node.resolveTxt(N)).toEqual([['injected']])
    await expect(ours.resolveTxt(N)).rejects.toMatchObject({ code: 'ENODATA' })
  })

  test('a CNAME without records of the requested type is ENODATA, where Node returns []', async () => {
    handler = () => ({ answers: [record(N, 'CNAME', 'no-txt.example')] })
    expect(await node.resolveTxt(N)).toEqual([])
    await expect(ours.resolveTxt(N)).rejects.toMatchObject({ code: 'ENODATA' })
  })

  test('SOA refresh, retry and expire above 2^31 stay positive, where Node wraps them to negative numbers', async () => {
    const big = 2 ** 31 + 1
    const soa = {
      mname: 'a',
      rname: 'b',
      serial: 1,
      refresh: big,
      retry: big,
      expire: big,
      minimum: 1,
    }
    handler = () => ({ answers: [record(N, 'SOA', soa)] })
    expect(await node.resolveSoa(N)).toMatchObject({
      refresh: big - 2 ** 32,
      retry: big - 2 ** 32,
      expire: big - 2 ** 32,
    })
    expect(await ours.resolveSoa(N)).toMatchObject({ refresh: big, retry: big, expire: big })
  })

  test('IPv6 addresses are formatted as RFC 5952 recommends, where Node writes ::/96 with a dotted quad', async () => {
    handler = () => ({ answers: [record(N, 'AAAA', '::bd60:1')] })
    expect(await node.resolve6(N)).toEqual(['::189.96.0.1'])
    expect(await ours.resolve6(N)).toEqual(['::bd60:1'])
  })

  test('a response code Node has no error for is EBADRESP, where Node says ENODATA', async () => {
    handler = () => ({ rcode: 'YXDOMAIN' })
    await expect(node.resolve4(N)).rejects.toMatchObject({ code: 'ENODATA' })
    await expect(ours.resolve4(N)).rejects.toMatchObject({ code: 'EBADRESP' })
  })
})

test('node:dns/promises and its Resolver fit the Resolver type', () => {
  const fromModule: Resolver = dnsPromises
  const fromClass: Resolver = new dnsPromises.Resolver()
  expect(typeof fromModule.resolveTxt).toBe('function')
  expect(typeof fromClass.reverse).toBe('function')
})
