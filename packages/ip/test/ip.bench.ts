import { BlockList, isIP } from 'node:net'
import ipaddr from 'ipaddr.js'
import { expect, test } from 'vite-plus/test'
import * as Ip from '@portable/ip'

const inputs = [
  '192.168.1.1',
  '8.8.8.8',
  '10.0.0.255',
  '203.0.113.42',
  '2001:db8::1',
  'fe80::1ff:fe23:4567:890a',
  '2a00:1450:4001:82a::200e',
  '::ffff:192.0.2.1',
]

test('parses addresses within 25% of ipaddr.js and node:net isIP', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/ip', () => {
      for (const text of inputs) Ip.parse(text)
    }),
    bench('ipaddr.js', () => {
      for (const text of inputs) ipaddr.parse(text)
    }),
    bench('node:net isIP', () => {
      for (const text of inputs) isIP(text)
    }),
  )
  expect(result.get('ipaddr.js')).not.toBeFasterThan(result.get('@portable/ip'), { delta: 0.25 })
  expect(result.get('node:net isIP')).not.toBeFasterThan(result.get('@portable/ip'), {
    delta: 0.25,
  })
})

test('checks addresses against a CIDR block within 25% of ipaddr.js and BlockList', async ({
  bench,
}) => {
  const v4 = Ip.parseCidr('10.0.0.0/8')
  const v6 = Ip.parseCidr('2001:db8::/32')
  const ipaddr4 = ipaddr.parseCIDR('10.0.0.0/8')
  const ipaddr6 = ipaddr.parseCIDR('2001:db8::/32')
  const list = new BlockList()
  list.addSubnet('10.0.0.0', 8, 'ipv4')
  list.addSubnet('2001:db8::', 32, 'ipv6')
  const result = await bench.compare(
    bench('@portable/ip', () => {
      for (const text of inputs) {
        const address = Ip.parse(text)
        Ip.contains(address.version === 4 ? v4 : v6, address)
      }
    }),
    bench('ipaddr.js', () => {
      for (const text of inputs) {
        const address = ipaddr.parse(text)
        if (address.kind() === 'ipv4') address.match(ipaddr4)
        else address.match(ipaddr6)
      }
    }),
    bench('node:net BlockList', () => {
      for (const text of inputs) list.check(text, text.includes(':') ? 'ipv6' : 'ipv4')
    }),
  )
  expect(result.get('ipaddr.js')).not.toBeFasterThan(result.get('@portable/ip'), { delta: 0.25 })
  expect(result.get('node:net BlockList')).not.toBeFasterThan(result.get('@portable/ip'), {
    delta: 0.25,
  })
})
