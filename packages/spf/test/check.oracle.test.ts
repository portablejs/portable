import { createSocket } from 'node:dgram'
import dns, { Resolver } from 'node:dns/promises'
import * as Spf from '@portable/spf'
import { spf } from 'mailauth/lib/spf/index.js'
import { describe, expect, test } from 'vite-plus/test'
import { mailauthResolver, rfc7208, type Zone, zoneResolver } from './utils.js'

async function both(zone: Zone, input: Spf.check.Input) {
  const ours = await Spf.check(input, { resolver: zoneResolver(zone), receiver: 'mx.test' })
  const theirs = await spf({
    ip: input.ip,
    sender: input.sender ?? '',
    helo: input.helo ?? '',
    mta: 'mx.test',
    strict: true,
    resolver: mailauthResolver(zoneResolver(zone)),
  })
  return {
    ours: { result: ours.result, explanation: ours.explanation },
    mailauth: { result: theirs.status.result, explanation: theirs.explanation },
  }
}

describe('matches mailauth strict mode on the RFC 7208 suite', () => {
  for (const suiteTest of rfc7208) {
    test(`${suiteTest.name}`, async () => {
      const { ours, mailauth } = await both(suiteTest.zone, {
        ip: suiteTest.host,
        sender: suiteTest.mailfrom,
        helo: suiteTest.helo,
      })
      expect(ours.result).toBe(mailauth.result)
      expect(ours.explanation?.toLowerCase()).toBe(mailauth.explanation?.toLowerCase())
    })
  }
})

const zone = {
  'host.example.test': { A: ['192.0.2.1', '198.51.100.9'], AAAA: ['2001:db8::1'] },
  'v6.example.test': { AAAA: ['2001:db8:1::5'] },
  'mx1.example.test': { A: ['203.0.113.5'] },
  'mx2.example.test': { AAAA: ['2001:db8:2::1'] },
  'mx.example.test': {
    MX: [
      { priority: 10, exchange: 'mx1.example.test' },
      { priority: 20, exchange: 'mx2.example.test' },
    ],
  },
  '1.2.0.192.list.example.test': { A: ['127.0.0.2'] },
  'user.users.example.test': { A: ['127.0.0.2'] },
  'inc.example.test': { TXT: ['v=spf1 ip4:198.51.100.0/24 ip6:2001:db9::/32 -all'] },
  'fail.example.test': { TXT: ['v=spf1 -all exp=explain.example.test'] },
  'loop.example.test': { TXT: ['v=spf1 include:loop.example.test -all'] },
  'timeout.example.test': { TXT: 'ETIMEOUT', A: 'ETIMEOUT' },
  'red.example.test': { TXT: ['v=spf1 a:host.example.test ~all exp=explain.example.test'] },
  'explain.example.test': { TXT: ['%{i} is not allowed to send for %{d} (%{l})'] },
  '1.2.0.192.in-addr.arpa': { PTR: ['host.example.test', 'other.test'] },
  '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa': {
    PTR: ['host.example.test'],
  },
} satisfies Zone

const terms = [
  'ip4:192.0.2.0/24',
  'ip4:198.51.100.7',
  'ip6:2001:db8::/32',
  'ip6:2001:db8:1::5',
  'a',
  'a/24',
  'a:host.example.test',
  'a:v6.example.test//48',
  'a:nx.example.test',
  'mx',
  'mx:mx.example.test/24',
  'mx:mx.example.test//64',
  'exists:%{ir}.list.example.test',
  'exists:%{l}.users.example.test',
  'exists:%{p}.users.example.test',
  'include:inc.example.test',
  'include:fail.example.test',
  'include:nx.example.test',
  'include:timeout.example.test',
  'include:loop.example.test',
  'ptr',
  'ptr:example.test',
  'ptr:other.test',
]
const endings = [
  '',
  ' -all',
  ' ~all',
  ' ?all',
  ' redirect=red.example.test',
  ' -all exp=explain.example.test',
  ' exp=explain.example.test redirect=fail.example.test',
]
const clients = [
  '192.0.2.1',
  '192.0.2.77',
  '198.51.100.7',
  '203.0.113.5',
  '2001:db8::1',
  '2001:db8:1::5',
  '::ffff:192.0.2.1',
  '2001:db9::1',
]
const senders = ['user@example.test', 'other@example.test', '']

function random(seed: number) {
  let state = seed
  return (n: number) => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return Math.floor((state / 2 ** 31) * n)
  }
}

describe('matches mailauth strict mode on random records', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const pick = random(seed)
    const qualifiers = ['', '', '-', '~', '?']
    const record = `v=spf1 ${Array.from({ length: 1 + pick(5) }, () => `${qualifiers[pick(5)]}${terms[pick(terms.length)]}`).join(' ')}${endings[pick(endings.length)]}`
    const input = {
      ip: clients[pick(clients.length)]!,
      sender: senders[pick(senders.length)]!,
      helo: 'example.test',
    }
    test(`${record} from ${input.ip} for "${input.sender}"`, async () => {
      const records = {
        ...zone,
        'example.test': {
          TXT: [record],
          A: ['192.0.2.200', '203.0.113.5'],
          MX: [{ priority: 5, exchange: 'mx1.example.test' }],
        },
      }
      const { ours, mailauth } = await both(records, input)
      expect(ours).toEqual(mailauth)
    })
  }
})

test('node:dns/promises fits Spf.Resolver', () => {
  const resolvers = [dns, new Resolver()] satisfies Spf.Resolver[]
  expect(resolvers).toHaveLength(2)
})

test('gives temperror for a SERVFAIL from node:dns, as mailauth does', async () => {
  const server = createSocket('udp4')
  server.on('message', (message, remote) => {
    let offset = 12
    const labels = new Array<string>()
    while (message[offset]) {
      labels.push(message.subarray(offset + 1, offset + 1 + message[offset]!).toString())
      offset += message[offset]! + 1
    }
    const question = message.subarray(12, offset + 5)
    const name = labels.join('.').toLowerCase()
    const record = new TextEncoder().encode('v=spf1 -include:blocklist.example.test +all')
    const answer =
      name === 'example.test'
        ? new Uint8Array([
            0xc0,
            0x0c,
            0,
            16,
            0,
            1,
            0,
            0,
            0,
            60,
            0,
            record.length + 1,
            record.length,
            ...record,
          ])
        : new Uint8Array()
    const rcode = name === 'example.test' ? 0 : 2
    const header = new Uint8Array([
      message[0]!,
      message[1]!,
      0x81,
      0x80 | rcode,
      0,
      1,
      0,
      answer.length ? 1 : 0,
      0,
      0,
      0,
      0,
    ])
    server.send(new Uint8Array([...header, ...question, ...answer]), remote.port, remote.address)
  })
  await new Promise<void>((resolve) => server.bind(0, '127.0.0.1', resolve))
  try {
    const resolver = new Resolver({ timeout: 1000, tries: 1 })
    resolver.setServers([`127.0.0.1:${server.address().port}`])
    const result = await Spf.check({ ip: '192.0.2.1', sender: 'user@example.test' }, { resolver })
    expect(result).toMatchObject({
      result: 'temperror',
      reason: expect.stringContaining('ESERVFAIL'),
    })
  } finally {
    server.close()
  }
})
