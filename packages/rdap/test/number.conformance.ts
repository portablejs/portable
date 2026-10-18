import { describe, expect, test } from 'vite-plus/test'
import * as Rdap from '@portable/rdap'
import { rejection, server, services } from './utils.js'

const ipv4 = 'https://data.iana.org/rdap/ipv4.json'
const ipv6 = 'https://data.iana.org/rdap/ipv6.json'
const asn = 'https://data.iana.org/rdap/asn.json'

describe('ip', () => {
  test('ARIN: 8.8.8.8 with its CIDR and the nested abuse contact', async () => {
    const { fetch, urls } = server()
    const result = await Rdap.ip('8.8.8.8', { fetch })
    expect(urls).toEqual([ipv4, 'https://rdap.arin.net/registry/ip/8.8.8.8'])
    expect(result).toMatchObject({
      handle: 'NET-8-8-8-0-2',
      name: 'GOGL',
      version: 4,
      startAddress: '8.8.8.0',
      endAddress: '8.8.8.255',
      cidrs: ['8.8.8.0/24'],
      type: 'DIRECT ALLOCATION',
      parentHandle: 'NET-8-0-0-0-0',
      status: ['active'],
      events: {
        registration: new Date('2023-12-28T22:24:33Z'),
        expiration: undefined,
        lastChanged: new Date('2023-12-28T22:24:56Z'),
      },
    })
    expect(result.entities.map((entity) => entity.roles)).toEqual([
      ['registrant'],
      ['abuse'],
      ['technical', 'administrative'],
    ])
    expect(result.entities[1]).toEqual({
      handle: 'ABUSE5250-ARIN',
      roles: ['abuse'],
      name: 'Abuse',
      org: 'Google Inc.',
      email: 'network-abuse@google.com',
      phone: '+1-650-253-0000',
      address: '1600 Amphitheatre Parkway\nMountain View\nCA\n94043\nUnited States',
    })
    expect(result.raw.port43).toBe('whois.arin.net')
  })

  test('RIPE: IPv4 and IPv6', async () => {
    const { fetch, urls } = server()
    const v4 = await Rdap.ip('193.0.6.139', { fetch })
    const v6 = await Rdap.ip('2001:67c:2e8::1', { fetch })
    expect(urls).toEqual([
      ipv4,
      'https://rdap.db.ripe.net/ip/193.0.6.139',
      ipv6,
      'https://rdap.db.ripe.net/ip/2001:67c:2e8::1',
    ])
    expect(v4).toMatchObject({ name: 'RIPE-NCC', country: 'NL', version: 4 })
    expect(v6).toMatchObject({ name: 'RIPE-NCC-NET', version: 6, cidrs: ['2001:67c:2e8::/48'] })
    expect(v6.entities.find((entity) => entity.roles.includes('abuse'))?.email).toBe(
      'abuse@ripe.net',
    )
  })

  test('APNIC: 1.1.1.1', async () => {
    const { fetch, urls } = server()
    const result = await Rdap.ip('1.1.1.1', { fetch })
    expect(urls[1]).toBe('https://rdap.apnic.net/ip/1.1.1.1')
    expect(result).toMatchObject({ name: 'APNIC-LABS', country: 'AU', cidrs: ['1.1.1.0/24'] })
  })

  test('sends IPv6 as RFC 5952 recommends and an IPv4-mapped address as IPv4', async () => {
    const { fetch, urls } = server()
    for (const address of ['2001:067C:02E8:0:0:0:0:1', '2001:67c:2e8::0.0.0.1', '::ffff:8.8.8.8'])
      await Rdap.ip(address, { fetch })
    expect(urls.filter((url) => !url.startsWith('https://data.iana.org/'))).toEqual([
      'https://rdap.db.ripe.net/ip/2001:67c:2e8::1',
      'https://rdap.db.ripe.net/ip/2001:67c:2e8::1',
      'https://rdap.arin.net/registry/ip/8.8.8.8',
    ])
  })

  test('looks up a prefix', async () => {
    const { fetch, urls } = server()
    await rejection(Rdap.ip('8.8.8.0/24', { fetch }))
    await rejection(Rdap.ip('2001:67c:2e8::/48', { fetch }))
    expect(urls.filter((url) => !url.startsWith('https://data.iana.org/'))).toEqual([
      'https://rdap.arin.net/registry/ip/8.8.8.0/24',
      'https://rdap.db.ripe.net/ip/2001:67c:2e8::/48',
    ])
  })

  test('picks the registry by the longest matching prefix, whatever the order', async () => {
    const { fetch, urls } = server({
      [ipv4]: services(
        [['8.0.0.0/8'], ['https://wide.example/']],
        [['8.8.0.0/16'], ['https://narrow.example/']],
        [['8.8.8.128/25'], ['https://narrowest.example/']],
      ),
    })
    for (const address of ['8.8.8.8', '8.9.0.1', '8.8.8.200', '8.8.8.0/24', '8.8.8.128/26'])
      await rejection(Rdap.ip(address, { fetch }))
    expect(urls.slice(1)).toEqual([
      'https://narrow.example/ip/8.8.8.8',
      'https://wide.example/ip/8.9.0.1',
      'https://narrowest.example/ip/8.8.8.200',
      'https://narrow.example/ip/8.8.8.0/24',
      'https://narrowest.example/ip/8.8.8.128/26',
    ])
  })

  test('rejects malformed addresses with InvalidInputError, without a request', async () => {
    const { fetch, urls } = server()
    const addresses = [
      '',
      '.',
      ':',
      '1',
      '1.1.1',
      '1.1.1.1.1',
      '999.999.999.999',
      '256.1.1.1',
      '01.1.1.1',
      '1.1.1.1/33',
      '1.1.1.1/',
      '1.1.1.1/08',
      ' 1.1.1.1',
      'not.an.ip',
      '2001:db8::1::1',
      '2001:db8:0:0:0:0:0:0:1',
      '2001:db8::12345',
      '2001:db8::1%eth0',
      '2001:db8::/129',
      ':1:2:3:4:5:6:7',
      '1::2:3:4:5:6:7:8',
      '::1.2.3',
    ]
    for (const address of addresses)
      expect({ input: address, error: await rejection(Rdap.ip(address, { fetch })) }).toEqual({
        input: address,
        error: expect.any(Rdap.InvalidInputError),
      })
    expect(urls).toEqual([])
  })

  test('rejects an address no registry serves with UnsupportedError', async () => {
    const { fetch } = server()
    for (const address of ['127.0.0.1', '10.0.0.1', '::1', 'fe80::1'])
      expect({ input: address, error: await rejection(Rdap.ip(address, { fetch })) }).toEqual({
        input: address,
        error: expect.any(Rdap.UnsupportedError),
      })
  })

  test('rejects an address with no record with NotFoundError', async () => {
    const { fetch } = server()
    expect(await rejection(Rdap.ip('8.8.4.4', { fetch }))).toBeInstanceOf(Rdap.NotFoundError)
  })
})

describe('asn', () => {
  test('ARIN: AS15169', async () => {
    const { fetch, urls } = server()
    const result = await Rdap.asn(15169, { fetch })
    expect(urls).toEqual([asn, 'https://rdap.arin.net/registry/autnum/15169'])
    expect(result).toMatchObject({
      handle: 'AS15169',
      name: 'GOOGLE',
      start: 15169,
      end: 15169,
      status: ['active'],
      events: { registration: new Date('2000-03-30T05:00:00Z') },
    })
    expect(result.entities.find((entity) => entity.roles.includes('abuse'))?.email).toBe(
      'network-abuse@google.com',
    )
  })

  test('RIPE: AS3333', async () => {
    const { fetch, urls } = server()
    const result = await Rdap.asn(3333, { fetch })
    expect(urls[1]).toBe('https://rdap.db.ripe.net/autnum/3333')
    expect(result).toMatchObject({ handle: 'AS3333', name: 'RIPE-NCC-AS', start: 3333, end: 3333 })
  })

  test('matches range ends inclusively, and single numbers', async () => {
    const { fetch, urls } = server({
      [asn]: services([['1-100'], ['https://a.example/']], [['200'], ['https://b.example']]),
    })
    for (const number of [1, 100, 200]) await rejection(Rdap.asn(number, { fetch }))
    for (const number of [0, 101, 199, 201])
      expect({ input: number, error: await rejection(Rdap.asn(number, { fetch })) }).toEqual({
        input: number,
        error: expect.any(Rdap.UnsupportedError),
      })
    expect(urls.slice(1)).toEqual([
      'https://a.example/autnum/1',
      'https://a.example/autnum/100',
      'https://b.example/autnum/200',
    ])
  })

  test('rejects a reserved number with UnsupportedError', async () => {
    const { fetch } = server()
    for (const number of [0, 23456, 4294967295])
      expect({ input: number, error: await rejection(Rdap.asn(number, { fetch })) }).toEqual({
        input: number,
        error: expect.any(Rdap.UnsupportedError),
      })
  })

  test('rejects what is not an AS number with InvalidInputError, without a request', async () => {
    const { fetch, urls } = server()
    for (const number of [-1, 1.5, 2 ** 32, Number.NaN, Infinity, '15169' as never])
      expect({ input: number, error: await rejection(Rdap.asn(number, { fetch })) }).toEqual({
        input: number,
        error: expect.any(Rdap.InvalidInputError),
      })
    expect(urls).toEqual([])
  })
})
