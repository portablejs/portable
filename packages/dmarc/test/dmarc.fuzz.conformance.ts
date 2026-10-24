import { fc, fuzz } from '@portable/fuzz';
import { expect, test } from 'vite-plus/test';
import { check, withRecord } from './utils.js';

const tag = fc.oneof(
  fc.constantFrom(
    'v=DMARC1',
    'v=dmarc1',
    'p=none',
    'p=quarantine',
    'p=reject',
    'p=bogus',
    'sp=reject',
    'np=quarantine',
    'adkim=s',
    'aspf=r',
    'pct=50',
    't=y',
    'psd=y',
    'fo=1:d',
    'rua=mailto:d@example.com',
    'ruf=mailto:a@example.com!10m',
    'ri=86400',
    '',
    '=',
    'x',
  ),
  fc.string({ maxLength: 6 }),
);

const recordText = fc
  .tuple(fc.array(tag, { maxLength: 8 }), fc.constantFrom(';', '; ', ' ;', ';;'))
  .map(([tags, separator]) => tags.join(separator));

const fromDomain = fc.oneof(
  fc.constantFrom(
    'example.com',
    'mail.example.com',
    'EXAMPLE.COM.',
    'ｅｘａｍｐｌｅ.com',
    'bücher.example',
  ),
  fc.string({ maxLength: 20 }),
);

const identifier = fc.record({
  result: fc.constantFrom('pass', 'fail', 'none', 'softfail'),
  domain: fc.constantFrom('example.com', 'mail.example.com', 'other.test', 'EXAMPLE.com', ''),
});

test('any record and identifiers give a result, never an exception', async () => {
  await fuzz(
    fc.asyncProperty(
      recordText,
      fromDomain,
      fc.option(identifier, { nil: undefined }),
      fc.array(identifier, { maxLength: 3 }),
      async (record, from, spf, dkim) => {
        const result = await check(withRecord(record), { from, spf, dkim });
        expect(['pass', 'fail', 'none', 'temperror', 'permerror']).toContain(result.result);
        expect(result.disposition).toBe(result.result === 'fail' ? result.policy : 'none');
        expect(result.dkim).toHaveLength(dkim.length);
        expect(result.record?.text ?? record.trimEnd()).toBe(record.trimEnd());
      },
    ),
  );
});

test('the result passes exactly when an aligned identifier passes', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.option(identifier, { nil: undefined }),
      fc.array(identifier, { maxLength: 3 }),
      fc.constantFrom('r', 's'),
      async (spf, dkim, mode) => {
        const record = `v=DMARC1; p=reject; adkim=${mode}; aspf=${mode}`;
        const result = await check(withRecord(record), { from: 'example.com', spf, dkim });
        const aligned = [...(spf ? [result.spf!] : []), ...result.dkim].some(
          (alignment) => alignment.aligned,
        );
        expect(result.result).toBe(aligned ? 'pass' : 'fail');
      },
    ),
  );
});
