import { BlockList, isIP, SocketAddress } from 'node:net'
import ipaddr from 'ipaddr.js'
import { describe, expect, test } from 'vite-plus/test'
import * as Ip from '@portable/ip'

function random(seed: number) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

const next = random(42)
const int = (n: number) => Math.floor(next() * n)

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i += 2) {
    const zero = next() < 0.4
    bytes[i] = zero ? 0 : int(256)
    if (i + 1 < length) {
      bytes[i + 1] = zero ? 0 : int(256)
    }
  }
  if (length === 16 && next() < 0.15) {
    bytes.fill(0, 0, 10).fill(0xff, 10, 12)
  }
  return bytes
}

const addresses = Array.from({ length: 2000 }, (_, i) => Ip.fromBytes(randomBytes(i % 2 ? 16 : 4)))

function spellings(address: Ip.Address): string[] {
  const parsed = ipaddr.fromByteArray([...address.bytes])
  if (parsed.kind() === 'ipv4') {
    return [parsed.toString()]
  }
  const v6 = parsed as ipaddr.IPv6
  const b = address.bytes
  const fixed = v6.parts.map((part) => part.toString(16).padStart(4, '0')).join(':')
  return [
    v6.toNormalizedString(),
    fixed,
    fixed.toUpperCase(),
    v6.toRFC5952String(),
    `${v6.toNormalizedString().split(':').slice(0, 6).join(':')}:${b[12]}.${b[13]}.${b[14]}.${b[15]}`,
  ]
}

const garbage = Array.from({ length: 5000 }, () => {
  const alphabet = '0123456789abcdefABCDEF:.:%z'
  let text = ''
  for (let i = int(20); i > 0; i--) {
    text += alphabet[int(alphabet.length)]
  }
  return text
})

describe('matches node:net isIP', () => {
  test('on valid addresses in every spelling', () => {
    for (const address of addresses) {
      for (const text of spellings(address)) {
        expect([text, Ip.canParse(text)]).toEqual([text, isIP(text) !== 0])
      }
    }
  })

  test('on random text', () => {
    for (const text of garbage.filter((text) => !/%.*:/.test(text))) {
      expect([text, Ip.canParse(text)]).toEqual([text, isIP(text) !== 0])
    }
  })

  test('except that a zone may not contain a colon', () => {
    expect(isIP('fe80::1%a:b')).toBe(6)
    expect(Ip.canParse('fe80::1%a:b')).toBe(false)
  })

  test('on known edge cases', () => {
    const cases = [
      '01.2.3.4',
      '1.2.3.04',
      '::1.2.3.04',
      '0x7f.1',
      '127.1',
      '2130706433',
      '1::2:3:4:5:6:7',
      '0000:0:0:0:0:0:0:1',
      '::00001',
      '1:2:3:4:5:6:7:8::',
      '::1:2:3:4:5:6:7:8',
      'fe80::1%eth0',
      'fe80::1%',
      '::ffff:255.255.255.255',
      '::ffff:256.0.0.0',
    ]
    for (const text of cases) {
      expect([text, Ip.canParse(text)]).toEqual([text, isIP(text) !== 0])
    }
  })
})

describe('matches ipaddr.js', () => {
  test('bytes of every spelling', () => {
    for (const address of addresses) {
      for (const text of spellings(address)) {
        expect([text, [...Ip.parse(text).bytes]]).toEqual([text, ipaddr.parse(text).toByteArray()])
      }
    }
  })

  test('RFC 5952 text, apart from mixed notation for IPv4-mapped addresses', () => {
    for (const address of addresses) {
      if (address.version === 4 || Ip.range(address) === 'ipv4Mapped') {
        continue
      }
      const text = Ip.format(address)
      expect(text).toBe((ipaddr.fromByteArray([...address.bytes]) as ipaddr.IPv6).toRFC5952String())
    }
  })

  test('contains', () => {
    for (const address of addresses) {
      const network = addresses[int(addresses.length)]!
      if (network.version !== address.version) {
        continue
      }
      const prefix = int(address.version === 4 ? 33 : 129)
      const ours = Ip.contains({ address: network, prefix }, address)
      const theirs = ipaddr
        .fromByteArray([...address.bytes])
        .match(ipaddr.fromByteArray([...network.bytes]), prefix)
      expect(ours).toBe(theirs)
      const near = Ip.fromBytes(
        address.bytes.map((byte, i) => (i === address.bytes.length - 1 ? byte ^ 1 : byte)),
      )
      expect(Ip.contains({ address, prefix }, near)).toBe(
        ipaddr
          .fromByteArray([...near.bytes])
          .match(ipaddr.fromByteArray([...address.bytes]), prefix),
      )
    }
  })

  const names: Record<string, Ip.Range> = {
    unspecified: 'unspecified',
    broadcast: 'broadcast',
    multicast: 'multicast',
    linkLocal: 'linkLocal',
    loopback: 'loopback',
    carrierGradeNat: 'sharedAddressSpace',
    private: 'private',
    as112: 'as112',
    as112v6: 'as112',
    amt: 'amt',
    uniqueLocal: 'uniqueLocal',
    ipv4Mapped: 'ipv4Mapped',
    deprecatedSiteLocal: 'deprecatedSiteLocal',
    discard: 'discard',
    rfc6145: 'ipv4Translated',
    rfc6052: 'ipv4Ipv6Translation',
    '6to4': '6to4',
    teredo: 'teredo',
    benchmarking: 'benchmarking',
    deprecatedOrchid: 'deprecatedOrchid',
    orchid2: 'orchidV2',
    droneRemoteIdProtocolEntityTags: 'droneRemoteIdProtocolEntityTags',
    segmentRouting: 'segmentRouting',
    unicast: 'unicast',
  }

  test('range, where the names map one to one', () => {
    const samples = [
      ...addresses,
      ...[
        '0.1.2.3',
        '100.64.1.1',
        '192.0.0.9',
        '192.0.2.1',
        '192.88.99.1',
        '198.18.0.1',
        '240.0.0.1',
        '2001:db8::1',
        '3fff::1',
        '2001:1::1',
        '100:0:0:1::1',
        '4000::1',
      ].map(Ip.parse),
    ]
    const renamed: Record<string, readonly Ip.Range[]> = {
      reserved: [
        'reserved',
        'documentation',
        'ietfProtocolAssignments',
        '6to4RelayAnycast',
        'benchmarking',
      ],
      unicast: ['unicast', 'reserved', 'dummy'],
    }
    let compared = 0
    for (const address of samples) {
      const theirs = ipaddr.fromByteArray([...address.bytes]).range()
      const ours = Ip.range(address)
      const allowed =
        theirs === 'unspecified' && address.version === 4
          ? ['thisNetwork']
          : (renamed[theirs] ?? [names[theirs]])
      expect([Ip.format(address), allowed]).toEqual([
        Ip.format(address),
        expect.arrayContaining([ours]),
      ])
      if (ours === names[theirs]) {
        compared++
      }
    }
    expect(compared).toBeGreaterThan(500)
  })
})

describe('matches node:net', () => {
  test('SocketAddress formatting, apart from IPv4-compatible addresses', () => {
    for (const address of addresses) {
      if (address.version === 4) {
        continue
      }
      const b = address.bytes
      const compatible = b.subarray(0, 12).every((byte) => byte === 0) && (b[12]! | b[13]!) !== 0
      const node = new SocketAddress({ address: Ip.format(address), family: 'ipv6' }).address
      const expected = compatible ? `::${b[12]}.${b[13]}.${b[14]}.${b[15]}` : Ip.format(address)
      expect(node).toBe(expected)
    }
  })

  test('BlockList.check, including IPv4-mapped addresses', () => {
    for (const address of addresses) {
      const network = addresses[int(addresses.length)]!
      const prefix = int(network.version === 4 ? 33 : 129)
      const list = new BlockList()
      list.addSubnet(Ip.format(network), prefix, network.version === 4 ? 'ipv4' : 'ipv6')
      const family = address.version === 4 ? 'ipv4' : 'ipv6'
      expect([Ip.format(address), Ip.contains({ address: network, prefix }, address)]).toEqual([
        Ip.format(address),
        list.check(Ip.format(address), family),
      ])
      const mapped = Ip.toIpv6(address)
      expect(Ip.contains({ address: network, prefix }, mapped)).toBe(
        list.check(Ip.format(mapped), 'ipv6'),
      )
    }
  })
})
