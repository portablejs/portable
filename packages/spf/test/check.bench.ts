import * as Spf from '@portable/spf'
import { spf } from 'mailauth/lib/spf/index.js'
import { expect, test } from 'vite-plus/test'
import { mailauthResolver, type Zone, zoneResolver } from './utils.js'

// A record shaped like a large provider's: nested includes, ip4 and ip6 ranges, a, mx and exists.
const zone: Zone = {
  'example.test': {
    TXT: ['v=spf1 include:_spf.provider.test include:_spf.esp.test mx a:relay.example.test ~all'],
    MX: [{ priority: 10, exchange: 'mx.example.test' }],
  },
  'mx.example.test': { A: ['203.0.113.10'] },
  'relay.example.test': { A: ['203.0.113.20'] },
  '_spf.provider.test': {
    TXT: ['v=spf1 include:_netblocks.provider.test include:_netblocks2.provider.test ~all'],
  },
  '_netblocks.provider.test': {
    TXT: [
      `v=spf1 ${Array.from({ length: 12 }, (_, i) => `ip4:${10 + i}.0.0.0/16`).join(' ')} ~all`,
    ],
  },
  '_netblocks2.provider.test': {
    TXT: [`v=spf1 ${Array.from({ length: 8 }, (_, i) => `ip6:2001:db8:${i}::/48`).join(' ')} ~all`],
  },
  '_spf.esp.test': { TXT: ['v=spf1 exists:%{ir}._ip.%{d}.esp.test ip4:198.51.100.0/24 -all'] },
  '7.100.51.198._ip._spf.esp.test.esp.test': { A: ['127.0.0.2'] },
}

const input = { ip: '198.51.100.7', sender: 'user@example.test', helo: 'mail.example.test' }

test('evaluates a nested record within 25% of mailauth', async ({ bench }) => {
  const resolver = zoneResolver(zone)
  const viaMailauth = mailauthResolver(resolver)
  expect((await Spf.check(input, { resolver })).result).toBe('pass')
  const result = await bench.compare(
    bench('@portable/spf', async () => {
      await Spf.check(input, { resolver })
    }),
    bench('mailauth strict', async () => {
      await spf({ ...input, mta: 'mx.test', strict: true, resolver: viaMailauth })
    }),
    bench('mailauth', async () => {
      await spf({ ...input, mta: 'mx.test', resolver: viaMailauth })
    }),
  )
  expect(result.get('mailauth strict')).not.toBeFasterThan(result.get('@portable/spf'), {
    delta: 0.25,
  })
  expect(result.get('mailauth')).not.toBeFasterThan(result.get('@portable/spf'), { delta: 0.25 })
})
