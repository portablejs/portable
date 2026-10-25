import * as Dkim from '@portable/dkim';
import { cuts, fc, fuzz, mutated, split } from '@portable/fuzz';
import { beforeAll, expect, test } from 'vite-plus/test';
import { ed25519Record, encode, privatePem, resolverFrom, stream } from './utils.js';

const domain = 'example.com';
const selector = 'sel';
let privateKey: string;
let resolver: Dkim.Resolver;

beforeAll(async () => {
  privateKey = await privatePem('ed25519');
  resolver = resolverFrom({ [`${selector}._domainkey.${domain}`]: [await ed25519Record()] });
});

const line = fc
  .array(fc.constantFrom('a', ' ', '\t', 'tere', '.', ':', 'õ', '=', ';'), { maxLength: 12 })
  .map((pieces) => pieces.join(''));

const message = fc
  .record({
    subject: line,
    extra: fc.array(fc.tuple(fc.constantFrom('X-A', 'subject', 'To', 'Cc'), line), {
      maxLength: 3,
    }),
    body: fc.array(fc.oneof(line, fc.constantFrom('', ' ', '\t')), { maxLength: 8 }),
    newline: fc.constantFrom('\r\n', '\n'),
  })
  .map(({ subject, extra, body, newline }) =>
    [
      'From: Mari <mari@example.com>',
      `Subject:${subject}`,
      ...extra.map(([name, value]) => `${name}: ${value}`),
      '',
      ...body,
    ].join(newline),
  );

const canonicalization = fc.constantFrom<Dkim.sign.Options['canonicalization']>(
  'simple/simple',
  'simple/relaxed',
  'relaxed/simple',
  'relaxed/relaxed',
);

const now = new Date(1_700_000_000_000);

test('verifies what sign signs, however the message is chunked', async () => {
  await fuzz(
    fc.asyncProperty(message, canonicalization, cuts, async (text, canonicalization, at) => {
      const field = await Dkim.sign(text, { domain, selector, privateKey, canonicalization, now });
      const signed = encode(field + text);
      const results = await Dkim.verify(stream(split(signed, at)), { resolver, now });
      expect(results.map((result) => result.result)).toEqual(['pass']);
    }),
    { scale: 0.5 },
  );
});

test('a changed signed message verifies to a result and never throws', async () => {
  const text = 'From: mari@example.com\r\nSubject: tere\r\n\r\nTere, Jaan!\r\n';
  const field = await Dkim.sign(text, { domain, selector, privateKey, now });
  const signed = encode(field + text);
  await fuzz(
    fc.asyncProperty(mutated(signed), cuts, async (bytes, at) => {
      const whole = await Dkim.verify(bytes, { resolver, now });
      const chunked = await Dkim.verify(stream(split(bytes, at)), { resolver, now });
      expect(chunked).toEqual(whole);
      for (const result of whole) {
        expect(['pass', 'fail', 'neutral', 'policy', 'permerror', 'temperror']).toContain(
          result.result,
        );
      }
    }),
  );
});

const tagValue = fc
  .array(
    fc.constantFrom(
      'v=1',
      'a=ed25519-sha256',
      'a=rsa-sha256',
      'd=example.com',
      's=sel',
      'h=from',
      'bh=',
      'b=',
      'c=relaxed',
      'l=5',
      't=1',
      'x=0',
      'i=@example.com',
      '=',
      ';',
      ' ',
      '\r\n ',
      'q=dns/txt',
      'z=a|b',
    ),
    { maxLength: 14 },
  )
  .map((tags) => tags.join(';'));

test('any DKIM-Signature value verifies to a result and never throws', async () => {
  await fuzz(
    fc.asyncProperty(tagValue, async (value) => {
      const results = await Dkim.verify(
        `DKIM-Signature: ${value}\r\nFrom: mari@example.com\r\n\r\nbody\r\n`,
        { resolver, now },
      );
      expect(results).toHaveLength(1);
      expect(results[0]!.result).not.toBe('pass');
    }),
  );
});
