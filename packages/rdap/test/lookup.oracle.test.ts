import * as NodeRdap from 'node-rdap'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vite-plus/test'
import * as Rdap from '@portable/rdap'
import dns from './fixtures/bootstrap-dns.json' with { type: 'json' }
import ipv6 from './fixtures/bootstrap-ipv6.json' with { type: 'json' }
import { server } from './utils.js'

const ours = server()
const theirs = server()

beforeAll(() => {
  vi.stubGlobal('fetch', theirs.fetch)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Outcome = { kind: 'invalid' | 'unsupported' | 'queried'; url?: string | undefined }

const seen = new Set<string>()

async function outcome(
  run: () => Promise<unknown>,
  urls: readonly string[],
  invalid: new (...args: never[]) => Error,
  unsupported: new (...args: never[]) => Error,
): Promise<Outcome> {
  const before = urls.length
  try {
    await run()
  } catch (error) {
    if (error instanceof invalid) return { kind: 'invalid' }
    if (error instanceof unsupported) return { kind: 'unsupported' }
  }
  const url = urls.slice(before).findLast((u) => !u.startsWith('https://data.iana.org/'))
  if (url) seen.add(new URL(url).host)
  return { kind: 'queried', url }
}

const ourDomain = (name: string) =>
  outcome(
    () => Rdap.domain(name, { fetch: ours.fetch, follow: false }),
    ours.urls,
    Rdap.InvalidInputError,
    Rdap.UnsupportedError,
  )
const theirDomain = (name: string) =>
  outcome(
    () => NodeRdap.domain(name),
    theirs.urls,
    NodeRdap.RdapValidationError,
    NodeRdap.RdapServerNotFoundError,
  )
const ourIp = (address: string) =>
  outcome(
    () => Rdap.ip(address, { fetch: ours.fetch }),
    ours.urls,
    Rdap.InvalidInputError,
    Rdap.UnsupportedError,
  )
const theirIp = (address: string) =>
  outcome(
    () => NodeRdap.ip(address),
    theirs.urls,
    NodeRdap.RdapValidationError,
    NodeRdap.RdapServerNotFoundError,
  )
const ourAsn = (number: number) =>
  outcome(
    () => Rdap.asn(number, { fetch: ours.fetch }),
    ours.urls,
    Rdap.InvalidInputError,
    Rdap.UnsupportedError,
  )
const theirAsn = (number: number) =>
  outcome(
    () => NodeRdap.autnum(number),
    theirs.urls,
    NodeRdap.RdapValidationError,
    NodeRdap.RdapServerNotFoundError,
  )

describe('routing matches node-rdap', () => {
  test('random domains under every TLD in the bootstrap file', async () => {
    const next = random(1)
    const tlds = dns.services.flatMap(([keys]) => keys)
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
    const label = () => {
      const length = 1 + Math.floor(next() * 20)
      let text = ''
      for (let i = 0; i < length; i++) text += alphabet[Math.floor(next() * alphabet.length)]
      if (length > 2 && next() < 0.3) text = `${text.slice(0, 1)}-${text.slice(2)}`
      return next() < 0.2 ? text.toUpperCase() : text
    }
    for (const tld of tlds) {
      const name = next() < 0.3 ? `${label()}.${label()}.${tld}` : `${label()}.${tld}`
      expect({ name, outcome: await ourDomain(name) }).toEqual({
        name,
        outcome: await theirDomain(name),
      })
    }
    for (const name of ['example.badger', 'example.eggs', 'example.de', 'google.com', 'bbc.co.uk'])
      expect({ name, outcome: await ourDomain(name) }).toEqual({
        name,
        outcome: await theirDomain(name),
      })
  })

  test('node-rdap test names: valid and invalid alike', async () => {
    const names = [
      'example.com',
      'example.co.uk',
      'example.badger',
      'example',
      'https://www.example.com',
      'https://www.example.com/news',
      ' ',
      '\t',
      '\n',
      '12345',
      `www.${'a'.repeat(64)}.co.uk`,
      `${'w'.repeat(64)}.domain.co.uk`,
      `${'w'.repeat(63)}.domain.co.uk`,
      'www.sub.domain.of.really.long.domain.that.is.not.over.the.two.hundred.and.fifty.five.character.limit.for.domains.com',
      'mydomain！.co.uk',
      'mydomain～.co.uk',
      'my-hyphenated-domain.com',
      '-hyphenated-domain.com',
      'hyphenated-domain-.com',
      'sub-domain.my-domain.com',
      'sub-domain-.my-domain.com',
      'deep-sub.sub-domain.-my-domain.com',
      'my_domain.com',
      'my-even_longer-domain.com',
    ]
    for (const name of names)
      expect({ name, outcome: await ourDomain(name) }).toEqual({
        name,
        outcome: await theirDomain(name),
      })
  })

  test('random IPv4 addresses', async () => {
    const next = random(2)
    for (let i = 0; i < 500; i++) {
      const address = Array.from({ length: 4 }, () => Math.floor(next() * 256)).join('.')
      expect({ address, outcome: await ourIp(address) }).toEqual({
        address,
        outcome: await theirIp(address),
      })
    }
  })

  test('random IPv6 addresses, inside and outside the bootstrap prefixes', async () => {
    const next = random(3)
    const word = () => (1 + Math.floor(next() * 0xffff)).toString(16)
    const prefixes = ipv6.services.flatMap(([keys]) => keys)
    for (let i = 0; i < 500; i++) {
      const words = Array.from({ length: 8 }, word)
      if (i % 2 === 0) {
        const [network] = prefixes[Math.floor(next() * prefixes.length)]!.split('/')
        const head = network!.split('::')[0]!.split(':').filter(Boolean)
        words.splice(0, head.length, ...head.map((part) => Number.parseInt(part, 16).toString(16)))
        if (words.includes('0')) continue
      }
      const address = words.join(':')
      expect({ address, outcome: await ourIp(address) }).toEqual({
        address,
        outcome: await theirIp(address),
      })
    }
  })

  test('random AS numbers, and the edges of each bootstrap range', async () => {
    const next = random(4)
    const numbers = [0, 1, 4294967295]
    for (let i = 0; i < 300; i++)
      numbers.push(Math.floor(next() * 2 ** 32), Math.floor(next() * 400_000))
    for (const number of numbers)
      expect({ number, outcome: await ourAsn(number) }).toEqual({
        number,
        outcome: await theirAsn(number),
      })
  })
})

test('the random inputs reached every RIR and many registries', () => {
  for (const host of [
    'rdap.arin.net',
    'rdap.db.ripe.net',
    'rdap.apnic.net',
    'rdap.lacnic.net',
    'rdap.afrinic.net',
  ])
    expect(seen).toContain(host)
  expect(seen.size).toBeGreaterThan(100)
})

describe('responses match node-rdap', () => {
  test('raw is the JSON node-rdap returns, for every recorded registry', async () => {
    const f = { fetch: ours.fetch }
    const lookups: [Promise<{ raw: unknown }>, Promise<unknown>][] = [
      [Rdap.domain('google.com', { ...f, follow: false }), NodeRdap.domain('google.com')],
      [Rdap.domain('wikipedia.org', { ...f, follow: false }), NodeRdap.domain('wikipedia.org')],
      [Rdap.domain('sidn.nl', f), NodeRdap.domain('sidn.nl')],
      [Rdap.domain('bbc.co.uk', f), NodeRdap.domain('bbc.co.uk')],
      [Rdap.domain('google.fr', { ...f, follow: false }), NodeRdap.domain('google.fr')],
      [Rdap.ip('8.8.8.8', f), NodeRdap.ip('8.8.8.8')],
      [Rdap.ip('193.0.6.139', f), NodeRdap.ip('193.0.6.139')],
      [Rdap.ip('2001:67c:2e8::1', f), NodeRdap.ip('2001:67c:2e8::1')],
      [Rdap.ip('1.1.1.1', f), NodeRdap.ip('1.1.1.1')],
      [Rdap.asn(15169, f), NodeRdap.autnum(15169)],
      [Rdap.asn(3333, f), NodeRdap.autnum(3333)],
    ]
    for (const [mine, upstream] of lookups) expect((await mine).raw).toEqual(await upstream)
  })

  test('an unregistered name is NotFoundError here and RdapRegistryError 404 in node-rdap', async () => {
    await expect(
      Rdap.domain('nonexistent-domain.com', { fetch: ours.fetch }),
    ).rejects.toBeInstanceOf(Rdap.NotFoundError)
    await expect(NodeRdap.domain('nonexistent-domain.com')).rejects.toMatchObject({ status: 404 })
  })
})

describe('deliberate differences', () => {
  test('a Unicode name is sent in A-labels; node-rdap converts only the TLD', async () => {
    expect(await ourDomain('münchen.com')).toEqual({
      kind: 'queried',
      url: 'https://rdap.verisign.com/com/v1/domain/xn--mnchen-3ya.com',
    })
    expect(await theirDomain('münchen.com')).toEqual({
      kind: 'queried',
      url: 'https://rdap.verisign.com/com/v1/domain/münchen.com',
    })
  })

  test('an IPv6 address is sent in RFC 5952 form; node-rdap sends it as typed', async () => {
    const address = '2001:067C:02E8:0:0:0:0:1'
    expect((await ourIp(address)).url).toBe('https://rdap.db.ripe.net/ip/2001:67c:2e8::1')
    expect((await theirIp(address)).url).toBe(`https://rdap.db.ripe.net/ip/${address}`)
  })

  test('a prefix is looked up; node-rdap rejects it', async () => {
    expect(await ourIp('8.8.8.0/24')).toEqual({
      kind: 'queried',
      url: 'https://rdap.arin.net/registry/ip/8.8.8.0/24',
    })
    expect(await theirIp('8.8.8.0/24')).toEqual({ kind: 'invalid' })
  })
})
