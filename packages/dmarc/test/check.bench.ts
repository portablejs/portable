import * as Dmarc from '@portable/dmarc';
import { dmarc } from 'mailauth/lib/dmarc/index.js';
import { expect, test } from 'vite-plus/test';
import { type Zone, zoneResolver } from './utils.js';

const zone = {
  '_dmarc.example.com': {
    TXT: ['v=DMARC1; p=reject; sp=quarantine; np=reject; rua=mailto:dmarc@example.com'],
  },
  'news.example.com': { A: ['192.0.2.1'] },
} satisfies Zone;

const input = {
  from: 'news.example.com',
  spf: { result: 'pass', domain: 'bounces.esp.example.net' },
  dkim: [
    { result: 'pass', domain: 'esp.example.net' },
    { result: 'pass', domain: 'mail.example.com' },
  ],
} as const;

const mailauthResolver = (resolver: Dmarc.Resolver) => (name: string, type: string) =>
  type === 'TXT'
    ? resolver.resolveTxt(name)
    : type === 'A'
      ? resolver.resolve4(name)
      : resolver.resolveCname(name);

test('checks a subdomain with relaxed alignment within 25% of mailauth', async ({ bench }) => {
  const resolver = zoneResolver(zone);
  const viaMailauth = mailauthResolver(resolver);
  expect((await Dmarc.check(input, { resolver })).result).toBe('pass');
  const result = await bench.compare(
    bench('@portable/dmarc', async () => {
      await Dmarc.check(input, { resolver });
    }),
    bench('mailauth strict', async () => {
      await dmarc({
        headerFrom: input.from,
        spfDomains: [input.spf.domain],
        dkimDomains: input.dkim.map((entry) => ({ domain: entry.domain })),
        resolver: viaMailauth,
        strict: true,
      });
    }),
  );
  expect(result.get('mailauth strict')).not.toBeFasterThan(result.get('@portable/dmarc'), {
    delta: 0.25,
  });
});
