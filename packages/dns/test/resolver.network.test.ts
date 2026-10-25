import { describe, expect, test } from 'vite-plus/test';
import { create } from '@portable/dns';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } | undefined })
  .process?.env;

describe.skipIf(!env?.DNS_NETWORK)('live DNS-over-HTTPS (set DNS_NETWORK=1)', () => {
  for (const endpoint of ['https://cloudflare-dns.com/dns-query', 'https://dns.google/dns-query']) {
    describe(`${new URL(endpoint).host}`, () => {
      const resolver = create({ endpoints: [endpoint] });

      test('resolves the records SPF, DKIM, and DMARC read', async () => {
        const spf = await resolver.resolveTxt('gmail.com');
        expect(spf.map((chunks) => chunks.join('')).some((text) => text.startsWith('v=spf1'))).toBe(
          true,
        );
        const dmarc = await resolver.resolveTxt('_dmarc.gmail.com');
        expect(dmarc[0]!.join('')).toMatch(/^v=DMARC1/);
        expect((await resolver.resolveMx('gmail.com')).length).toBeGreaterThan(0);
        expect((await resolver.resolve4('example.com')).length).toBeGreaterThan(0);
        expect(await resolver.reverse('1.1.1.1')).toEqual(['one.one.one.one']);
      });

      test('reports NXDOMAIN and NODATA', async () => {
        await expect(resolver.resolveTxt('nxdomain.portable-test.invalid')).rejects.toMatchObject({
          code: 'ENOTFOUND',
        });
        await expect(resolver.resolveSrv('example.com')).rejects.toMatchObject({ code: 'ENODATA' });
      });

      test('returns the AD flag for a signed zone', async () => {
        expect((await resolver.query('cloudflare.com', 'A')).flags.ad).toBe(true);
      });
    });
  }
});
