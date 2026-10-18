import * as Spf from '@portable/spf'
import { fc, fuzz, outcomeAsync } from '@portable/fuzz'
import { expect, test } from 'vite-plus/test'
import { type Query, zoneResolver } from './utils.js'

const codes = ['pass', 'fail', 'softfail', 'neutral', 'none', 'temperror', 'permerror']

const term = fc.oneof(
  fc.constantFrom(
    'all',
    'a',
    'mx',
    'ptr',
    'a:other.test',
    'mx:other.test/24',
    'a//64',
    'a/33',
    'ip4:192.0.2.0/24',
    'ip4:192.0.2.1',
    'ip4:300.1.1.1',
    'ip6:2001:db8::/32',
    'ip6:::ffff:192.0.2.1',
    'include:other.test',
    'include:%{d}',
    'include:loop.test',
    'exists:%{i}.%{l1r-}.%{d2}.e.test',
    'exists:%{ir}.%{v}._spf.%{h}',
    'exists:%{p}.%{s}.%{o}.%{c}.%{r}.%{t}',
    'exists:%%%_%-',
    'redirect=other.test',
    'redirect=%{d}',
    'exp=explain.test',
    'exp=',
    'unknown=%{x}',
    'ptr:%{d}',
    '%{',
  ),
  fc.string({
    unit: fc.constantFrom('a', ':', '/', '%', '{', '}', '.', '=', '-', '1'),
    maxLength: 12,
  }),
)
const record = fc
  .tuple(
    fc.constantFrom('v=spf1', 'v=spf1 ', 'V=SPF1', 'v=spf10', 'spf2.0/pra'),
    fc.array(fc.tuple(fc.constantFrom('', '+', '-', '~', '?'), term), { maxLength: 8 }),
  )
  .map(
    ([version, terms]) =>
      version + terms.map(([qualifier, term]) => ` ${qualifier}${term}`).join(''),
  )

const zone = fc.record({ main: fc.array(record, { minLength: 1, maxLength: 2 }), other: record })

test('check settles with an RFC 7208 result for any record, within the lookup limits', async () => {
  await fuzz(
    fc.asyncProperty(
      zone,
      fc.constantFrom('192.0.2.1', '2001:db8::1', '::ffff:192.0.2.9', '10.0.0.1'),
      fc.constantFrom('user@example.test', 'a.b+c@example.test', '', 'example.test', 'x@'),
      async ({ main, other }, ip, sender) => {
        const log: Query[] = []
        const resolver = zoneResolver(
          {
            'example.test': {
              TXT: main,
              A: ['192.0.2.1'],
              MX: [{ exchange: 'mx.test', priority: 1 }],
            },
            'mail.example.test': { TXT: main },
            'other.test': { TXT: [other], AAAA: ['2001:db8::1'] },
            'loop.test': { TXT: ['v=spf1 include:loop.test'] },
            'explain.test': { TXT: ['%{i} is not allowed for %{d}'] },
            'mx.test': { A: ['192.0.2.1'] },
          },
          log,
        )
        const result = await Spf.check(
          { ip, sender, helo: 'mail.example.test' },
          { resolver, receiver: 'mx.receiver.test' },
        )
        expect(codes).toContain(result.result)
        expect(result.lookups).toBeLessThanOrEqual(11)
        expect(result.voidLookups).toBeLessThanOrEqual(3)
        expect(log.length).toBeLessThanOrEqual(130)
      },
    ),
  )
})

test('check rejects only with TypeError, for an ip that is not an IP address', async () => {
  const text = fc.string({
    unit: fc.constantFrom('1', '9', '.', ':', 'a', 'f', ' ', '%'),
    maxLength: 20,
  })
  await fuzz(
    fc.asyncProperty(text, text, text, async (ip, sender, helo) => {
      const resolver = zoneResolver({})
      const settled = await outcomeAsync([TypeError], () =>
        Spf.check({ ip, sender, helo }, { resolver }),
      )
      expect(codes).toContain('value' in settled ? settled.value.result : 'none')
    }),
  )
})
