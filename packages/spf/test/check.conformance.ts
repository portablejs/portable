import * as Spf from '@portable/spf';
import { describe, expect, test } from 'vite-plus/test';
import { check, type Query, withRecord, type Zone, zoneResolver } from './utils.js';

const resultOf = async (...args: Parameters<typeof check>) => (await check(...args)).result;

describe('Spf.check', () => {
  test('returns the result with the matching term, the record and the lookup counts', async () => {
    const zone = withRecord('v=spf1 a:mail.example.test ip4:192.0.2.0/24 -all', {
      'mail.example.test': { A: ['198.51.100.1'] },
    });
    expect(await check(zone)).toEqual({
      result: 'pass',
      domain: 'example.test',
      identity: 'mailfrom',
      mechanism: 'ip4:192.0.2.0/24',
      record: 'v=spf1 a:mail.example.test ip4:192.0.2.0/24 -all',
      lookups: 1,
      voidLookups: 0,
    });
  });

  test('reports why the result is none, temperror or permerror', async () => {
    expect(await check({})).toMatchObject({ result: 'none', reason: expect.any(String) });
    expect(await check({ 'example.test': { TXT: 'ESERVFAIL' } })).toMatchObject({
      result: 'temperror',
      reason: expect.stringContaining('ESERVFAIL'),
      cause: expect.objectContaining({ code: 'ESERVFAIL' }),
    });
    expect(await check(withRecord('v=spf1 foo:bar -all'))).toMatchObject({
      result: 'permerror',
      reason: expect.stringContaining('foo'),
    });
  });

  test('gives neutral with no mechanism when nothing matches', async () => {
    const result = await check(withRecord('v=spf1 ip4:198.51.100.1'));
    expect(result).toMatchObject({ result: 'neutral', record: 'v=spf1 ip4:198.51.100.1' });
    expect(result.mechanism).toBeUndefined();
  });

  test('maps each qualifier to its result', async () => {
    for (const [qualifier, result] of [
      ['', 'pass'],
      ['+', 'pass'],
      ['-', 'fail'],
      ['~', 'softfail'],
      ['?', 'neutral'],
    ]) {
      expect(await resultOf(withRecord(`v=spf1 ${qualifier}all`))).toBe(result);
    }
  });

  test('checks the HELO name when the sender is empty', async () => {
    const zone = {
      'mail.example.test': { TXT: ['v=spf1 exists:%{l}.%{o}.allow.example.test -all'] },
    };
    const log: Query[] = [];
    const allowed = { 'postmaster.mail.example.test.allow.example.test': { A: ['127.0.0.2'] } };
    for (const sender of ['', undefined]) {
      expect(await check({ ...zone, ...allowed }, { sender }, { log })).toMatchObject({
        result: 'pass',
        domain: 'mail.example.test',
        identity: 'helo',
      });
    }
    expect(log[0]).toBe('TXT mail.example.test');
  });

  test('takes a sender without "@" as a domain with the local-part postmaster', async () => {
    const zone = withRecord('v=spf1 exists:%{l}.allow.example.test -all', {
      'postmaster.allow.example.test': { A: ['127.0.0.2'] },
    });
    expect(await resultOf(zone, { sender: 'example.test' })).toBe('pass');
  });

  test('throws a RangeError for an ip that is not an IP address', async () => {
    for (const ip of ['', 'not-an-ip', '192.0.2', '127.1', '192.0.2.256', '1::2::3']) {
      await expect(
        Spf.check({ ip: ip, sender: 'user@example.test' }, { resolver: zoneResolver({}) }),
      ).rejects.toThrow(RangeError);
    }
    await expect(
      Spf.check(
        { ip: undefined as unknown as string, sender: 'user@example.test' },
        { resolver: zoneResolver({}) },
      ),
    ).rejects.toThrow(TypeError);
  });

  test('expands %{r} to the receiver, or "unknown"', async () => {
    const zone = withRecord('v=spf1 -all exp=explain.example.test', {
      'explain.example.test': { TXT: ['checked by %{r}'] },
    });
    expect((await check(zone)).explanation).toBe('checked by mx.receiver.test');
    expect((await check(zone, {}, { receiver: undefined })).explanation).toBe('checked by unknown');
  });

  test('rejects with the reason and aborts the lookup when the signal aborts before the DNS answers', async () => {
    const controller = new AbortController();
    let lookupSignal: AbortSignal | undefined;
    const resolver = {
      ...zoneResolver({}),
      resolveTxt: (_name: string, options?: { signal?: AbortSignal | undefined }) => {
        lookupSignal = options?.signal;
        return new Promise<string[][]>(() => {});
      },
    };
    const pending = Spf.check(
      { ip: '192.0.2.1', sender: 'user@example.test' },
      { resolver, signal: controller.signal },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const reason = new Error('stop');
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(lookupSignal?.aborted).toBe(true);
  });

  test('rejects with the reason for a signal that has already aborted', async () => {
    const reason = new Error('stop');
    await expect(
      check(withRecord('v=spf1 +all'), {}, { signal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason);
  });

  test('gives temperror for a resolver that throws synchronously or rejects with a non-error', async () => {
    const throwing = {
      ...zoneResolver({}),
      resolveTxt: () => {
        throw new Error('boom');
      },
    };
    const rejecting = { ...zoneResolver({}), resolveTxt: () => Promise.reject('boom') };
    for (const resolver of [throwing, rejecting]) {
      const result = await Spf.check({ ip: '192.0.2.1', sender: 'a@example.test' }, { resolver });
      expect(result.result).toBe('temperror');
    }
  });

  test('rejects a resolver without a lookup method, instead of giving temperror', async () => {
    const { resolveMx: _, ...partial } = zoneResolver(withRecord('v=spf1 +all'));
    for (const resolver of [undefined, {}, partial]) {
      await expect(
        Spf.check(
          { ip: '192.0.2.1', sender: 'a@example.test' },
          { resolver: resolver as unknown as Spf.Resolver },
        ),
      ).rejects.toThrow(TypeError);
    }
  });

  test('accepts node:dns-shaped records split into several strings', async () => {
    const zone = { 'example.test': { TXT: [['v=spf1 ip4:192.0.2.1', ' -all']] } };
    expect(await resultOf(zone)).toBe('pass');
  });
});

describe('spf-verify-test.js', () => {
  test('passes all IPs', async () => {
    expect(await resultOf(withRecord('v=spf1 +all'), { ip: '1.2.3.4' })).toBe('pass');
  });

  test('fails all IPs', async () => {
    expect(await resultOf(withRecord('v=spf1 -all'), { ip: '1.2.3.4' })).toBe('fail');
  });

  test('passes A records', async () => {
    const zone = withRecord('v=spf1 a -all', {
      'example.test': { TXT: ['v=spf1 a -all'], A: ['192.0.2.10', '192.0.2.11'] },
    });
    expect(await resultOf(zone, { ip: '1.2.3.4' })).toBe('fail');
    expect(await resultOf(zone, { ip: '192.0.2.10' })).toBe('pass');
    expect(await resultOf(zone, { ip: '192.0.2.11' })).toBe('pass');
  });

  test('passes MX records', async () => {
    const zone = {
      'example.test': {
        TXT: ['v=spf1 mx -all'],
        MX: [{ priority: 1, exchange: 'example.test' }],
        A: ['192.0.2.10', '192.0.2.11'],
      },
    } satisfies Zone;
    expect(await resultOf(zone, { ip: '1.2.3.4' })).toBe('fail');
    expect(await resultOf(zone, { ip: '192.0.2.10' })).toBe('pass');
    expect(await resultOf(zone, { ip: '192.0.2.11' })).toBe('pass');
  });

  test('passes MX records with a CIDR length', async () => {
    const zone = {
      'example.test': {
        TXT: ['v=spf1 mx/24 -all'],
        MX: [{ priority: 1, exchange: 'example.test' }],
        A: ['192.0.2.10', '192.0.2.11'],
      },
    } satisfies Zone;
    expect(await resultOf(zone, { ip: '1.2.3.4' })).toBe('fail');
    expect(await resultOf(zone, { ip: '192.0.2.10' })).toBe('pass');
    expect(await resultOf(zone, { ip: '192.0.2.56' })).toBe('pass');
  });

  test('passes an exists rule with macros', async () => {
    const zone = withRecord('v=spf1 exists:%{ir}.%{l1r+-}._spf.%{d} -all', {
      '4.3.2.1.some._spf.example.test': { A: ['127.0.0.1'] },
    });
    expect(await resultOf(zone, { ip: '1.2.3.4', sender: 'some+user@example.test' })).toBe('pass');
    expect(await resultOf(zone, { ip: '1.2.2.4', sender: 'some+user@example.test' })).toBe('fail');
  });

  test('expands macros in the mx mechanism', async () => {
    const zone = {
      'skinanalytics.test': {
        TXT: ['v=spf1 include:spf.lcn.test -all'],
        MX: [{ priority: 10, exchange: 'mail.skinanalytics.test' }],
      },
      'spf.lcn.test': { TXT: ['v=spf1 mx:%{o} -all'] },
      'mail.skinanalytics.test': { A: ['209.85.208.173'] },
    } satisfies Zone;
    const input = { sender: 'test@skinanalytics.test' };
    expect(await resultOf(zone, { ...input, ip: '209.85.208.173' })).toBe('pass');
    expect(await resultOf(zone, { ...input, ip: '192.0.2.20' })).toBe('fail');
  });

  const mxZone = (hosts: Zone): Zone => ({
    'example.test': {
      TXT: ['v=spf1 mx -all'],
      MX: Object.keys(hosts).map((exchange) => ({ priority: 10, exchange })),
    },
    ...hosts,
  });

  test('does not count IPv4-only MX hosts as void lookups for an IPv6 client', async () => {
    const zone = mxZone({
      'mx1.example.test': { A: ['192.0.2.10'] },
      'mx2.example.test': { A: ['192.0.2.11'] },
      'mx3.example.test': { A: ['192.0.2.12'] },
    });
    expect(await check(zone, { ip: '2001:db8::1' })).toMatchObject({
      result: 'fail',
      voidLookups: 0,
    });
  });

  test('does not count IPv6-only MX hosts as void lookups for an IPv4 client', async () => {
    const zone = mxZone({
      'mx1.example.test': { AAAA: ['2001:db8::10'] },
      'mx2.example.test': { AAAA: ['2001:db8::11'] },
      'mx3.example.test': { AAAA: ['2001:db8::12'] },
    });
    expect(await check(zone, { ip: '192.0.2.50' })).toMatchObject({
      result: 'fail',
      voidLookups: 0,
    });
  });

  test('counts an a term with no record of the client family as a void lookup', async () => {
    const zone = withRecord(
      'v=spf1 a:host1.example.test a:host2.example.test a:host3.example.test -all',
      {
        'host1.example.test': { A: ['192.0.2.10'] },
        'host2.example.test': { A: ['192.0.2.11'] },
        'host3.example.test': { A: ['192.0.2.12'] },
      },
    );
    expect(await check(zone, { ip: '2001:db8::1' })).toMatchObject({
      result: 'permerror',
      voidLookups: 3,
    });
  });

  test('matches a client of either family with a dual-stack MX host', async () => {
    const zone = mxZone({ 'mx.example.test': { A: ['192.0.2.10'], AAAA: ['2001:db8::10'] } });
    expect(await resultOf(zone, { ip: '2001:db8::10' })).toBe('pass');
    expect(await resultOf(zone, { ip: '192.0.2.10' })).toBe('pass');
  });

  test('matches a host with an AAAA record after a host with only an A record', async () => {
    const zone = withRecord(
      'v=spf1 a:host1.example.test a:host2.example.test a:none.example.test -all',
      {
        'host1.example.test': { A: ['192.0.2.10'] },
        'host2.example.test': { AAAA: ['2001:db8::11'] },
      },
    );
    expect(await resultOf(zone, { ip: '2001:db8::11' })).toBe('pass');
  });

  test('gives temperror when the lookup for the client family times out', async () => {
    const zone = withRecord('v=spf1 a:timeout.example.test -all', {
      'timeout.example.test': { A: 'ETIMEOUT', AAAA: 'ENODATA' },
    });
    expect(await resultOf(zone, { ip: '192.0.2.10' })).toBe('temperror');
    const v6 = withRecord('v=spf1 a:timeout.example.test -all', {
      'timeout.example.test': { A: 'ENODATA', AAAA: 'ETIMEOUT' },
    });
    expect(await resultOf(v6, { ip: '2001:db8::1' })).toBe('temperror');
  });

  test('ignores an error for the other address family of an MX host', async () => {
    const v6 = mxZone({ 'refused.example.test': { A: 'EREFUSED', AAAA: ['2001:db8::1'] } });
    expect(await resultOf(v6, { ip: '2001:db8::1' })).toBe('pass');
    const v4 = mxZone({ 'refused.example.test': { A: ['192.0.2.10'], AAAA: 'EREFUSED' } });
    expect(await resultOf(v4, { ip: '192.0.2.10' })).toBe('pass');
  });

  test('gives temperror when both families time out', async () => {
    const zone = withRecord('v=spf1 a:timeout.example.test -all', {
      'timeout.example.test': { A: 'ETIMEOUT', AAAA: 'ETIMEOUT' },
    });
    expect(await resultOf(zone, { ip: '192.0.2.10' })).toBe('temperror');
  });

  test('expands %{d} to the included domain in nested includes', async () => {
    const log: Query[] = [];
    const zone = {
      'sender.test': { TXT: ['v=spf1 include:mid.test ~all'] },
      'mid.test': { TXT: ['v=spf1 include:policy.test ~all'] },
      'policy.test': { TXT: ['v=spf1 include:%{ir}.%{v}.%{d}.spf.provider.test ~all'] },
      '3.2.0.192.in-addr.policy.test.spf.provider.test': { TXT: ['v=spf1 ip4:192.0.2.3 -all'] },
    } satisfies Zone;
    expect(await resultOf(zone, { ip: '192.0.2.3', sender: 'user@sender.test' }, { log })).toBe(
      'pass',
    );
    expect(log).toContain('TXT 3.2.0.192.in-addr.policy.test.spf.provider.test');
    expect(log.filter((query) => query.includes('sender.test.spf'))).toEqual([]);
  });

  test('keeps %{o} on the sender domain in nested includes', async () => {
    const zone = {
      'sender.test': { TXT: ['v=spf1 include:policy.test -all'] },
      'policy.test': { TXT: ['v=spf1 include:%{o}.spf.provider.test -all'] },
      'sender.test.spf.provider.test': { TXT: ['v=spf1 ip4:192.0.2.3 -all'] },
    } satisfies Zone;
    expect(await resultOf(zone, { ip: '192.0.2.3', sender: 'user@sender.test' })).toBe('pass');
  });

  test('expands %{d} to the redirect target', async () => {
    const zone = {
      'sender.test': { TXT: ['v=spf1 redirect=redirected.test'] },
      'redirected.test': { TXT: ['v=spf1 exists:%{ir}.%{d}.spf.provider.test -all'] },
      '3.2.0.192.redirected.test.spf.provider.test': { A: ['127.0.0.2'] },
    } satisfies Zone;
    expect(await resultOf(zone, { ip: '192.0.2.3', sender: 'user@sender.test' })).toBe('pass');
  });
});

describe('macro-test.js', () => {
  const expansion = async (macro: string, input: Partial<Spf.check.Input> = {}) => {
    const log: Query[] = [];
    await check(withRecord(`v=spf1 exists:${macro}.x.test -all`), input, { log });
    return log[1]?.replace(/^A /, '').replace(/\.x\.test$/, '');
  };
  const sender = 'strong-bad@email.example.com';

  test('renders macro values', async () => {
    const cases = [
      ['%{s}', 'strong-bad@email.example.com'],
      ['%{o}', 'email.example.com'],
      ['%{d}', 'email.example.com'],
      ['%{d4}', 'email.example.com'],
      ['%{d3}', 'email.example.com'],
      ['%{d2}', 'example.com'],
      ['%{d1}', 'com'],
      ['%{dr}', 'com.example.email'],
      ['%{d2r}', 'example.email'],
      ['%{l}', 'strong-bad'],
      ['%{l-}', 'strong.bad'],
      ['%{lr}', 'strong-bad'],
      ['%{lr-}', 'bad.strong'],
      ['%{l1r-}', 'strong'],
      ['%{ir}.%{v}._spf.%{d2}', '3.2.0.192.in-addr._spf.example.com'],
      ['%{lr-}.lp._spf.%{d2}', 'bad.strong.lp._spf.example.com'],
      ['%{lr-}.lp.%{ir}.%{v}._spf.%{d2}', 'bad.strong.lp.3.2.0.192.in-addr._spf.example.com'],
      ['%{ir}.%{v}.%{l1r-}.lp._spf.%{d2}', '3.2.0.192.in-addr.strong.lp._spf.example.com'],
      ['%{d2}.trusted-domains.example.net', 'example.com.trusted-domains.example.net'],
    ] satisfies [string, string][];
    for (const [macro, expected] of cases) {
      const log: Query[] = [];
      await check(
        { 'email.example.com': { TXT: [`v=spf1 exists:${macro}.x.test -all`] } },
        { sender, ip: '192.0.2.3' },
        { log },
      );
      expect(log[1]).toBe(`A ${expected}.x.test`);
    }
  });

  test('renders %{i} of an IPv6 client as nibbles', async () => {
    const log: Query[] = [];
    await check(
      { 'email.example.com': { TXT: ['v=spf1 exists:%{ir}.%{v}._spf.%{d2} -all'] } },
      { sender, ip: '2001:db8::cb01' },
      { log },
    );
    expect(log[1]).toBe(
      'A 1.0.b.c.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6._spf.example.com',
    );
  });

  test('expands %{d} to the domain being evaluated and %{o} to the sender domain', async () => {
    const log: Query[] = [];
    const zone = {
      'email.example.com': { TXT: ['v=spf1 include:included.example.net -all'] },
      'included.example.net': {
        TXT: [
          'v=spf1 exists:%{d}.%{d2}.%{o}.%{s}.x.test exists:%{ir}.%{v}.%{d}.spf.example.org -all',
        ],
      },
    } satisfies Zone;
    await check(zone, { sender, ip: '192.0.2.3' }, { log });
    expect(log).toContain(
      'A included.example.net.example.net.email.example.com.strong-bad@email.example.com.x.test',
    );
    expect(log).toContain('A 3.2.0.192.in-addr.included.example.net.spf.example.org');
  });

  test('splits on exactly the listed delimiters, in any order', async () => {
    const input = { sender: 'a.b-c+d,e/f=g_h@example.test' };
    expect(await expansion('%{l.-+}', input)).toBe('a.b.c.d,e/f=g_h');
    expect(await expansion('%{l+-.}', input)).toBe('a.b.c.d,e/f=g_h');
    expect(await expansion('%{l,-/}', input)).toBe('a.b.c+d.e.f=g_h');
    expect(await expansion('%{lr,-/}', input)).toBe('f=g_h.e.c+d.a.b');
    expect(await expansion('%{l=-_/,.+}', input)).toBe('a.b.c.d.e.f.g.h');
  });

  test('evaluates a record with "-" between two other delimiters', async () => {
    const zone = withRecord('v=spf1 exists:%{l.-+}._spf.example.test -all', {
      'a.b.c._spf.example.test': { A: ['127.0.0.2'] },
    });
    expect(await resultOf(zone, { sender: 'a-b+c@example.test' })).toBe('pass');
  });

  test('reads every digit of the transformer', async () => {
    const digits = async (macro: string, domain: string) => {
      const log: Query[] = [];
      await check(
        { [domain]: { TXT: [`v=spf1 exists:${macro}.x.test -all`] } },
        { sender: `a@${domain}` },
        { log },
      );
      return log[1];
    };
    expect(await digits('%{d10}', 'a.b.c.example.test')).toBe('A a.b.c.example.test.x.test');
    expect(await digits('%{d9r}', '1.2.3.4.5.6.7.8.9.10.test')).toBe('A 9.8.7.6.5.4.3.2.1.x.test');
  });

  test('URL-escapes a byte below 0x10 with two hex digits', async () => {
    expect(await expansion('%{L}', { sender: 'a\tb@example.test' })).toBe('a%09b');
  });

  test('takes the domain of a sender with an empty local-part, and postmaster as its local-part', async () => {
    expect(await expansion('%{o}', { sender: '@example.test' })).toBe('example.test');
    expect(await expansion('%{l}', { sender: '@example.test' })).toBe('postmaster');
  });

  test('expands %{t} to the current time in seconds', async () => {
    const zone = withRecord('v=spf1 -all exp=explain.example.test', {
      'explain.example.test': { TXT: ['%{t}'] },
    });
    const seconds = Number((await check(zone)).explanation);
    expect(Math.abs(seconds - Date.now() / 1000)).toBeLessThan(5);
  });

  test('expands %{t} from the now option', async () => {
    const zone = withRecord('v=spf1 -all exp=explain.example.test', {
      'explain.example.test': { TXT: ['%{t}'] },
    });
    const now = new Date(1_700_000_000_900);
    expect((await check(zone, {}, { now })).explanation).toBe('1700000000');
  });

  test('expands %{t} from a now that is an object with epochMilliseconds, such as a Temporal.Instant', async () => {
    const zone = withRecord('v=spf1 -all exp=explain.example.test', {
      'explain.example.test': { TXT: ['%{t}'] },
    });
    const now = { epochMilliseconds: 1_700_000_000_900 };
    expect((await check(zone, {}, { now })).explanation).toBe('1700000000');
  });

  test('rejects an invalid now, even for a sender whose domain is not a domain name', async () => {
    const now = 'yesterday' as unknown as Date;
    for (const sender of ['user@example.test', 'user@invalid']) {
      await expect(check(withRecord('v=spf1 +all'), { sender }, { now })).rejects.toThrow(
        TypeError,
      );
    }
  });
});

describe('limited-resolver-test.js', () => {
  const includes = (count: number, prefix = 's') =>
    Array.from({ length: count }, (_, i) => `include:${prefix}${i + 1}.example.test`).join(' ');
  const included = (count: number, record: string, prefix = 's'): Zone =>
    Object.fromEntries(
      Array.from({ length: count }, (_, i) => [
        `${prefix}${i + 1}.example.test`,
        { TXT: [record] },
      ]),
    );

  test('allows 10 DNS-querying terms, not counting the first TXT lookup', async () => {
    const zone = withRecord(`v=spf1 ${includes(10)} -all`, included(10, 'v=spf1 -all'));
    expect(await check(zone)).toMatchObject({ result: 'fail', lookups: 10 });
  });

  test('gives permerror for the 11th DNS-querying term', async () => {
    const zone = withRecord('v=spf1 include:level0.example.test -all', {
      'level0.example.test': { TXT: [`v=spf1 ${includes(10, 'level')} -all`] },
      ...included(10, 'v=spf1 -all', 'level'),
    });
    expect(await check(zone, { ip: '192.0.2.99' })).toMatchObject({
      result: 'permerror',
      lookups: 11,
    });
  });

  test('reports the lookup count', async () => {
    const zone = {
      'example.test': {
        TXT: ['v=spf1 a mx -all'],
        MX: [{ priority: 10, exchange: 'mx.example.test' }],
        A: ['192.0.2.9'],
      },
      'mx.example.test': { A: ['192.0.2.1'] },
    } satisfies Zone;
    expect(await check(zone)).toMatchObject({ result: 'pass', lookups: 2 });
  });

  test('counts ENOTFOUND and ENODATA as void lookups', async () => {
    const zone = withRecord('v=spf1 a:nonexistent.example.test a:norecord.example.test -all', {
      'norecord.example.test': { AAAA: ['2001:db8::1'] },
    });
    expect(await check(zone)).toMatchObject({ result: 'fail', voidLookups: 2 });
  });

  test('gives permerror for the third void lookup', async () => {
    const zone = withRecord(
      'v=spf1 exists:void1.example.test exists:void2.example.test exists:void3.example.test -all',
    );
    expect(await check(zone)).toMatchObject({ result: 'permerror', voidLookups: 3 });
  });

  test('gives temperror for ETIMEOUT and EREFUSED in an include', async () => {
    for (const code of ['ETIMEOUT', 'EREFUSED']) {
      const zone = withRecord('v=spf1 include:bad.example.test -all', {
        'bad.example.test': { TXT: code },
      });
      expect(await resultOf(zone)).toBe('temperror');
    }
  });

  test('gives none for an invalid sender domain', async () => {
    expect(
      await check(withRecord('v=spf1 -all'), { sender: 'user@invalid..domain' }),
    ).toMatchObject({
      result: 'none',
      lookups: 0,
    });
  });
});

describe('dual-stack-resolver-test.js', () => {
  const dual = (record: string, records: Zone[string]): Zone => ({
    'example.test': { TXT: [record], ...records },
  });

  test('matches an IPv4 client against A records only', async () => {
    expect(
      await resultOf(dual('v=spf1 a -all', { A: ['192.0.2.10'], AAAA: ['2001:db8::10'] }), {
        ip: '192.0.2.10',
      }),
    ).toBe('pass');
    expect(
      await resultOf(dual('v=spf1 a -all', { A: ['192.0.2.20'], AAAA: ['2001:db8::10'] }), {
        ip: '192.0.2.10',
      }),
    ).toBe('fail');
  });

  test('matches an IPv6 client against AAAA records only', async () => {
    expect(
      await resultOf(dual('v=spf1 a -all', { A: ['192.0.2.10'], AAAA: ['2001:db8::10'] }), {
        ip: '2001:db8::10',
      }),
    ).toBe('pass');
    expect(
      await resultOf(dual('v=spf1 a -all', { A: ['192.0.2.10'], AAAA: ['2001:db8::20'] }), {
        ip: '2001:db8::10',
      }),
    ).toBe('fail');
  });

  test('ignores errors and empty answers for the other family', async () => {
    for (const AAAA of ['ETIMEOUT', 'ENODATA']) {
      expect(
        await resultOf(dual('v=spf1 a -all', { A: ['192.0.2.10'], AAAA }), { ip: '192.0.2.10' }),
      ).toBe('pass');
    }
    for (const A of ['ETIMEOUT', 'ENODATA']) {
      expect(
        await resultOf(dual('v=spf1 a -all', { A, AAAA: ['2001:db8::10'] }), {
          ip: '2001:db8::10',
        }),
      ).toBe('pass');
    }
  });

  test('fails for a host with no addresses', async () => {
    expect(await resultOf(dual('v=spf1 a -all', { A: [], AAAA: [] }), { ip: '192.0.2.10' })).toBe(
      'fail',
    );
  });

  test('gives temperror for an error in the client family even when the other is void', async () => {
    expect(
      await resultOf(dual('v=spf1 a -all', { A: 'ETIMEOUT', AAAA: 'ENODATA' }), {
        ip: '192.0.2.10',
      }),
    ).toBe('temperror');
    expect(
      await resultOf(dual('v=spf1 a -all', { A: 'ENODATA', AAAA: 'ETIMEOUT' }), {
        ip: '2001:db8::1',
      }),
    ).toBe('temperror');
  });

  test('handles MX hosts of one family', async () => {
    const zone = (host: Zone[string]): Zone => ({
      'example.test': {
        TXT: ['v=spf1 mx -all'],
        MX: [{ priority: 10, exchange: 'mx.example.test' }],
      },
      'mx.example.test': host,
    });
    expect(await resultOf(zone({ A: ['192.0.2.10'] }), { ip: '192.0.2.10' })).toBe('pass');
    expect(await resultOf(zone({ AAAA: ['2001:db8::10'] }), { ip: '2001:db8::10' })).toBe('pass');
    expect(await resultOf(zone({ A: ['192.0.2.1'], AAAA: [] }), { ip: '2001:db8::99' })).toBe(
      'fail',
    );
  });
});

describe('rfc-compliance-test.js', () => {
  describe('DNS errors inside include and redirect (RFC 7208 5.2, 6.1)', () => {
    test('gives permerror for an include target the resolver rejects as a bad name', async () => {
      const zone = withRecord('v=spf1 -include:_block.provider.test +all', {
        '_block.provider.test': { TXT: 'EBADNAME' },
      });
      expect(await resultOf(zone)).toBe('permerror');
    });

    test('gives permerror for an include target with a label over 63 characters', async () => {
      const local = 'a'.repeat(64);
      const zone = withRecord('v=spf1 -include:%{l}.block.example.test +all');
      expect(await resultOf(zone, { sender: `${local}@example.test` })).toBe('permerror');
    });

    for (const code of ['ESERVFAIL', 'ECONNREFUSED', 'EBADRESP', 'ENOTIMP', 'ECANCELLED']) {
      test(`gives temperror for ${code} on an include target`, async () => {
        const zone = withRecord('v=spf1 include:_spf.provider.test -all', {
          '_spf.provider.test': { TXT: code },
        });
        expect(await resultOf(zone)).toBe('temperror');
      });

      test(`does not turn a blocklist include with ${code} into pass`, async () => {
        const zone = withRecord('v=spf1 -include:_block.provider.test +all', {
          '_block.provider.test': { TXT: code },
        });
        expect(await resultOf(zone)).toBe('temperror');
      });

      test(`gives temperror for ${code} on a redirect target`, async () => {
        const zone = withRecord('v=spf1 redirect=_spf.example.test', {
          '_spf.example.test': { TXT: code },
        });
        expect(await resultOf(zone)).toBe('temperror');
      });

      test(`gives temperror for ${code} in a mechanism of an included record`, async () => {
        const zone = withRecord('v=spf1 -include:inc.example.test +all', {
          'inc.example.test': { TXT: ['v=spf1 a:host.example.test -all'] },
          'host.example.test': { A: code, AAAA: code },
        });
        expect(await resultOf(zone)).toBe('temperror');
      });
    }

    test('names the failed lookup for a top-level DNS error', async () => {
      const result = await check({ 'example.test': { TXT: 'ESERVFAIL' } });
      expect(result).toMatchObject({
        result: 'temperror',
        reason: 'TXT lookup of example.test failed: ESERVFAIL',
      });
    });
  });

  describe('ptr lookup counting (RFC 7208 4.6.4)', () => {
    const rdns = {
      '1.2.0.192.in-addr.arpa': { PTR: ['mail.other.test'] },
      'mail.other.test': { A: ['192.0.2.1'] },
    } satisfies Zone;

    test('counts every ptr term toward the lookup limit', async () => {
      const terms = Array.from({ length: 11 }, (_, i) => `ptr:d${i}.example.test`).join(' ');
      expect(await check(withRecord(`v=spf1 ${terms} -all`, rdns))).toMatchObject({
        result: 'permerror',
        reason: 'More than 10 DNS-querying terms',
      });
    });

    test('counts ptr terms together with other DNS terms', async () => {
      const terms = Array.from({ length: 9 }, (_, i) => `ptr:d${i}.example.test`).join(' ');
      const zone = withRecord(`v=spf1 ${terms} exists:x.example.test exists:y.example.test -all`, {
        ...rdns,
        'x.example.test': { AAAA: ['2001:db8::1'] },
        'y.example.test': { A: ['127.0.0.2'] },
      });
      expect(await resultOf(zone)).toBe('permerror');
    });

    test('bounds the DNS queries of a record with many ptr terms', async () => {
      const ptrNames = Array.from({ length: 10 }, (_, i) => `h${i}.attacker.test`);
      const zone = {
        'attacker.test': { TXT: [['v=spf1', ...Array<string>(1000).fill(' ptr'), ' -all']] },
        '1.2.0.192.in-addr.arpa': { PTR: ptrNames },
        ...Object.fromEntries(ptrNames.map((name) => [name, { A: ['198.51.100.9'] }])),
      } satisfies Zone;
      const log: Query[] = [];
      const result = await check(zone, { sender: 'user@attacker.test' }, { log });
      expect(result).toMatchObject({ result: 'permerror', lookups: 11 });
      expect(log.length).toBeLessThanOrEqual(1 + 1 + 10);
    });

    test('counts the PTR lookup of a %{p} expansion', async () => {
      const terms = Array.from({ length: 6 }, (_, i) => `a:%{p}.e${i}.example.test`);
      const zone = {
        '1.2.0.192.in-addr.arpa': { PTR: ['mx.example.test'] },
        'mx.example.test': { A: ['192.0.2.1'] },
        ...Object.fromEntries(
          terms.map((_, i) => [`mx.example.test.e${i}.example.test`, { A: ['198.51.100.1'] }]),
        ),
      } satisfies Zone;
      const over = await check({ ...zone, ...withRecord(`v=spf1 ${terms.join(' ')} -all`) });
      expect(over).toMatchObject({
        result: 'permerror',
        reason: 'More than 10 DNS-querying terms',
      });
      const under = await check({
        ...zone,
        ...withRecord(`v=spf1 ${terms.slice(0, 5).join(' ')} -all`),
      });
      expect(under).toMatchObject({ result: 'fail', lookups: 10 });
    });

    test('does not count the PTR lookup of a %{p} expansion as a void lookup', async () => {
      const zone = withRecord('v=spf1 exists:%{p}.a.example.test exists:%{i}.b.example.test -all');
      expect(await check(zone)).toMatchObject({ result: 'fail', lookups: 3, voidLookups: 2 });
    });

    test('counts an empty PTR answer of a ptr term as a void lookup', async () => {
      const zone = withRecord(
        'v=spf1 ptr exists:%{i}.b.example.test exists:%{i}.c.example.test -all',
      );
      expect(await check(zone)).toMatchObject({
        result: 'permerror',
        reason: 'More than 2 void lookups',
      });
    });
  });

  describe('%{p} macro (RFC 7208 7.3)', () => {
    test('expands to "unknown" when there is no validated name', async () => {
      const zone = {
        'partner.test': { TXT: ['v=spf1 include:example.test -all'] },
        'example.test': { TXT: ['v=spf1 exists:%{p}.trusted.example.test -all'] },
        'partner.test.trusted.example.test': { A: ['127.0.0.2'] },
        'unknown.trusted.example.test': { AAAA: ['2001:db8::1'] },
      } satisfies Zone;
      const log: Query[] = [];
      expect(await resultOf(zone, { sender: 'user@partner.test' }, { log })).toBe('fail');
      expect(log).toContain('A unknown.trusted.example.test');
    });

    test('expands to a validated name, preferring a subdomain of <domain>', async () => {
      const log: Query[] = [];
      const zone = withRecord('v=spf1 exists:%{p}.allow.example.test -all', {
        '1.2.0.192.in-addr.arpa': { PTR: ['mx.other.test', 'mx.example.test'] },
        'mx.other.test': { A: ['192.0.2.1'] },
        'mx.example.test': { A: ['192.0.2.1'] },
        'mx.example.test.allow.example.test': { A: ['127.0.0.2'] },
      });
      expect(await resultOf(zone, {}, { log })).toBe('pass');
      expect(log).toContain('A mx.example.test.allow.example.test');
    });

    test('does not use a PTR name that does not validate', async () => {
      const zone = withRecord('v=spf1 exists:%{p}.allow.example.test -all', {
        '1.2.0.192.in-addr.arpa': { PTR: ['mx.example.test'] },
        'mx.example.test': { A: ['192.0.2.99'] },
        'mx.example.test.allow.example.test': { A: ['127.0.0.2'] },
      });
      expect(await resultOf(zone)).toBe('fail');
    });
  });

  describe('Syntax validation (RFC 7208 4.6)', () => {
    for (const record of [
      'v=spf1 -all ip6',
      'v=spf1 -all ip4:999.0.0.1',
      'v=spf1 ip4:192.0.2.1 ip4:192.0.2.300 -all',
      'v=spf1 ip4:192.0.2.1 a:example.test/99 -all',
      'v=spf1 ip4:192.0.2.1 exists:%{z}.example.test -all',
      'v=spf1 ip4:192.0.2.1 include: -all',
      'v=spf1 ip4:192.0.2.1 ptr/24 -all',
      'v=spf1 ip4:192.0.2.1 all:foo',
      'v=spf1 ip4:192.0.2.1 exists:%{d0}.example.test -all',
      'v=spf1 ip4:192.0.2.1 exists:%{d2x}.example.test -all',
      'v=spf1 ip4:192.0.2.1 exists:%{dr2}.example.test -all',
      'v=spf1 ip4:192.0.2.1 exists:%{c}.example.test -all',
      'v=spf1 ip4:192.0.2.1 a:%{t} -all',
      'v=spf1 ip4:192.0.2.1 a:localhost -all',
      'v=spf1 ip4:192.0.2.1 a$b=c -all',
      'v=spf1 ip4:192.0.2.1 exp=a.example.test exp=b.example.test',
      'v=spf1 ip4:192.0.2.1 redirect=a.example.test redirect=b.example.test',
      'v=spf1 ip4:192.0.2.1 exists:50%.example.test -all',
    ]) {
      test(`gives permerror for "${record}", even after the matching term`, async () => {
        expect(await resultOf(withRecord(record))).toBe('permerror');
      });
    }

    test('accepts a valid record that uses every kind of term', async () => {
      const zone = withRecord(
        'v=spf1 ip4:192.0.2.0/24 a:%{d} mx/24//64 exists:%{ir}.%{l1r+-}._spf.%{d} ptr:example.test -all exp=exp.%{d}',
      );
      expect(await resultOf(zone)).toBe('pass');
    });
  });

  describe('Modifiers (RFC 7208 6)', () => {
    test('accepts an unknown modifier with an empty value', async () => {
      expect(await resultOf(withRecord('v=spf1 foo= -all'))).toBe('fail');
    });

    test('rejects an empty redirect or exp value', async () => {
      expect(await resultOf(withRecord('v=spf1 ?all redirect='))).toBe('permerror');
      expect(await resultOf(withRecord('v=spf1 exp= -all'))).toBe('permerror');
    });

    test('treats the redirect target case-insensitively', async () => {
      const zone = withRecord('v=spf1 redirect=_spf.Example.TEST', {
        '_spf.example.test': { TXT: ['v=spf1 -all'] },
      });
      expect(await resultOf(zone)).toBe('fail');
    });

    test('accepts an uppercase sender domain in a redirect target', async () => {
      const zone = withRecord('v=spf1 redirect=_spf.%{o}', {
        '_spf.example.test': { TXT: ['v=spf1 ip4:192.0.2.1 -all'] },
      });
      expect(await resultOf(zone, { sender: 'user@EXAMPLE.TEST' })).toBe('pass');
    });

    test('ignores redirect when the record has an all term', async () => {
      const log: Query[] = [];
      const zone = withRecord('v=spf1 ?all redirect=_spf.example.test', {
        '_spf.example.test': { TXT: ['v=spf1 -all'] },
      });
      expect(await resultOf(zone, {}, { log })).toBe('neutral');
      expect(log).toEqual(['TXT example.test']);
    });

    test('gives permerror for a redirect target with no SPF record', async () => {
      const zone = withRecord('v=spf1 redirect=_spf.example.test', {
        '_spf.example.test': { TXT: ['not spf'] },
      });
      expect(await resultOf(zone)).toBe('permerror');
    });
  });

  describe('Trailing dots (RFC 7208 7.3)', () => {
    const zone = (record: string) =>
      withRecord(record, {
        'host.example.test': { A: ['192.0.2.1'] },
        'mxd.example.test': { MX: [{ priority: 10, exchange: 'host.example.test.' }] },
        '_spf.example.test': { TXT: ['v=spf1 ip4:192.0.2.1 -all'] },
        '1.2.0.192.in-addr.arpa': { PTR: ['host.example.test'] },
      });

    for (const record of [
      'v=spf1 a:host.example.test. -all',
      'v=spf1 a:host.example.test./24 -all',
      'v=spf1 mx:mxd.example.test. -all',
      'v=spf1 exists:host.example.test. -all',
      'v=spf1 ptr:example.test. -all',
      'v=spf1 include:_spf.example.test. -all',
      'v=spf1 redirect=_spf.example.test.',
    ]) {
      test(`accepts "${record}"`, async () => {
        expect(await resultOf(zone(record))).toBe('pass');
      });
    }

    test('skips a null MX', async () => {
      const nullMx = {
        'example.test': {
          TXT: ['v=spf1 mx ip4:192.0.2.1 -all'],
          MX: [{ priority: 0, exchange: '' }],
        },
      } satisfies Zone;
      expect(await resultOf(nullMx)).toBe('pass');
      const dotted = {
        'example.test': {
          TXT: ['v=spf1 mx ip4:192.0.2.1 -all'],
          MX: [{ priority: 0, exchange: '.' }],
        },
      } satisfies Zone;
      expect(await resultOf(dotted)).toBe('pass');
    });
  });

  describe('Fully qualified identities (RFC 7208 4.3)', () => {
    const zone = withRecord('v=spf1 exists:%{o}.%{h}.allow.example.test -all');

    test('evaluates a MAIL FROM domain with a trailing dot', async () => {
      const log: Query[] = [];
      const result = await check(
        zone,
        { sender: 'user@example.test.', helo: 'mail.example.test.' },
        { log },
      );
      expect(result).toMatchObject({ result: 'fail', domain: 'example.test' });
      expect(log).toEqual([
        'TXT example.test',
        'A example.test.mail.example.test.allow.example.test',
      ]);
    });

    test('evaluates a HELO name with a trailing dot for a null sender', async () => {
      const log: Query[] = [];
      const result = await check(zone, { sender: '', helo: 'example.test.' }, { log });
      expect(result).toMatchObject({ result: 'fail', domain: 'example.test', identity: 'helo' });
      expect(log).toEqual(['TXT example.test', 'A example.test.example.test.allow.example.test']);
    });

    for (const sender of ['user@example.test..', 'user@example..test', 'user@.']) {
      test(`gives none without a lookup for "${sender}"`, async () => {
        const log: Query[] = [];
        expect(await resultOf(zone, { sender }, { log })).toBe('none');
        expect(log).toEqual([]);
      });
    }
  });

  describe('PTR DNS errors (RFC 7208 5.5)', () => {
    for (const code of ['ESERVFAIL', 'ETIMEOUT', 'EREFUSED']) {
      test(`does not match ptr on ${code} and continues`, async () => {
        const zone = withRecord('v=spf1 ptr ip4:192.0.2.1 -all', {
          '1.2.0.192.in-addr.arpa': { PTR: code },
        });
        expect(await resultOf(zone)).toBe('pass');
      });
    }

    test('skips a PTR name whose address lookup fails', async () => {
      const zone = withRecord('v=spf1 ptr -all', {
        '1.2.0.192.in-addr.arpa': { PTR: ['bad.example.test', 'mail.example.test'] },
        'bad.example.test': { A: 'ESERVFAIL' },
        'mail.example.test': { A: ['192.0.2.1'] },
      });
      expect(await resultOf(zone)).toBe('pass');
    });
  });

  describe('Internationalized sender (RFC 8616 4)', () => {
    test('converts a U-label MAIL FROM domain to A-labels', async () => {
      const log: Query[] = [];
      const zone = { 'xn--bcher-kva.example': { TXT: ['v=spf1 ip4:192.0.2.1 -all'] } };
      const result = await check(zone, { sender: 'user@bücher.example' }, { log });
      expect(result).toMatchObject({ result: 'pass', domain: 'xn--bcher-kva.example' });
      expect(log[0]).toBe('TXT xn--bcher-kva.example');
    });

    test('uses the A-label domain in %{o}', async () => {
      const zone = {
        'xn--bcher-kva.example': { TXT: ['v=spf1 exists:%{o}.allow.example.test -all'] },
        'xn--bcher-kva.example.allow.example.test': { A: ['127.0.0.2'] },
      } satisfies Zone;
      expect(await resultOf(zone, { sender: 'user@BÜCHER.example' })).toBe('pass');
    });

    test('does not match a %{l} term with a non-ASCII local-part', async () => {
      const zone = withRecord('v=spf1 exists:%{l}.users.example.test -all', {
        'xn--ser-goa.users.example.test': { A: ['127.0.0.2'] },
      });
      expect(await resultOf(zone, { sender: 'üser@example.test' })).toBe('fail');
    });

    test('does not match an include with %{s} and a non-ASCII local-part', async () => {
      const zone = withRecord('v=spf1 include:%{s}.users.example.test ip4:192.0.2.1 -all');
      expect(await resultOf(zone, { sender: 'üser@example.test' })).toBe('pass');
    });
  });

  describe('Long names (RFC 7208 7.3)', () => {
    test('truncates names over 253 characters from the left', async () => {
      const local = Array.from({ length: 5 }, (_, i) => String(i).repeat(60)).join('.');
      const log: Query[] = [];
      const zone = withRecord('v=spf1 exists:%{l}._spf.example.test -all');
      expect(await resultOf(zone, { sender: `${local}@example.test` }, { log })).toBe('fail');
      expect(log[1]).toBe(
        `A ${'2'.repeat(60)}.${'3'.repeat(60)}.${'4'.repeat(60)}._spf.example.test`,
      );
    });
  });

  describe('Invalid names after macro expansion (RFC 7208 4.8)', () => {
    test('does not query a name with a label over 63 characters', async () => {
      const log: Query[] = [];
      const zone = withRecord('v=spf1 exists:%{l}.users.example.test -all');
      expect(await resultOf(zone, { sender: `${'a'.repeat(64)}@example.test` }, { log })).toBe(
        'fail',
      );
      expect(log).toEqual(['TXT example.test']);
    });

    test('does not match a term whose name the resolver rejects as EBADNAME', async () => {
      const zone = withRecord('v=spf1 exists:bad.example.test -all', {
        'bad.example.test': { A: 'EBADNAME' },
      });
      expect(await resultOf(zone)).toBe('fail');
    });
  });

  describe('Uppercase macros (RFC 7208 7.3)', () => {
    const explanation = async (text: string, sender: string) => {
      const zone = withRecord('v=spf1 -all exp=explain.example.test', {
        'explain.example.test': { TXT: [text] },
      });
      return (await check(zone, { sender, helo: 'mx.example.org' })).explanation;
    };

    test('URL-escapes uppercase macros', async () => {
      expect(await explanation('%{L}', 'foo+bar@example.test')).toBe('foo%2Bbar');
      expect(await explanation('%{S}', 'foo+bar@example.test')).toBe('foo%2Bbar%40example.test');
      expect(await explanation('%{l}', 'foo+bar@example.test')).toBe('foo+bar');
      expect(await explanation('%{L}', '~jack&jill=up-a_b3.c@example.test')).toBe(
        '~jack%26jill%3Dup-a_b3.c',
      );
    });

    test('reads "R" as the reverse transformer', async () => {
      expect(await explanation('%{dR} %{d1R}', 'user@example.test')).toBe('test.example example');
    });

    test('queries the escaped name', async () => {
      const log: Query[] = [];
      const zone = withRecord('v=spf1 exists:%{L}.users.example.test -all', {
        'foo%2bbar.users.example.test': { A: ['127.0.0.2'] },
      });
      expect(await resultOf(zone, { sender: 'foo+bar@example.test' }, { log })).toBe('pass');
      expect(log).toContain('A foo%2Bbar.users.example.test');
    });
  });

  describe('Quoted local-part with "@" (RFC 5321 4.1.2)', () => {
    test('splits the sender at the last "@"', async () => {
      const log: Query[] = [];
      const zone = withRecord('v=spf1 exists:%{o}.chk.example.test -all', {
        'example.test.chk.example.test': { A: ['127.0.0.2'] },
      });
      expect(await check(zone, { sender: '"a@b"@example.test' }, { log })).toMatchObject({
        result: 'pass',
        domain: 'example.test',
      });
    });
  });

  describe('Client IP address (RFC 7208 4.1, 5)', () => {
    for (const ip of ['::ffff:c000:201', '::FFFF:192.0.2.1', '::ffff:192.0.2.1']) {
      test(`treats the IPv4-mapped address ${ip} as IPv4`, async () => {
        expect(await resultOf(withRecord('v=spf1 ip4:192.0.2.1 -all'), { ip })).toBe('pass');
      });
    }

    for (const ip of ['fdaa:bbcc::dd:192.0.2.1', '::abcd:192.0.2.1', '::192.0.2.1']) {
      test(`does not treat the non-mapped address ${ip} as IPv4`, async () => {
        expect(await resultOf(withRecord('v=spf1 ip4:192.0.2.1 -all'), { ip })).toBe('fail');
      });
    }

    test('matches an IPv4-compatible network in ip6 exactly', async () => {
      expect(await resultOf(withRecord('v=spf1 ip6:::192.0.2.1 -all'), { ip: '::c000:201' })).toBe(
        'pass',
      );
    });

    test('expands %{c} and %{i} of an IPv4-mapped client as IPv4', async () => {
      const zone = withRecord('v=spf1 -all exp=explain.example.test', {
        'explain.example.test': { TXT: ['%{c} %{i} %{v}'] },
      });
      expect((await check(zone, { ip: '::ffff:192.0.2.1' })).explanation).toBe(
        '192.0.2.1 192.0.2.1 in-addr',
      );
    });

    test('writes %{c} of an IPv6 client as RFC 5952 recommends', async () => {
      const zone = withRecord('v=spf1 -all exp=explain.example.test', {
        'explain.example.test': { TXT: ['%{c}'] },
      });
      const cases = [
        ['2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
        ['2001:db8:0:1:1:1:1:1', '2001:db8:0:1:1:1:1:1'],
        ['2001:db8:0:0:1:0:0:1', '2001:db8::1:0:0:1'],
        ['::', '::'],
      ] satisfies [string, string][];
      for (const [ip, expected] of cases) {
        expect((await check(zone, { ip })).explanation).toBe(expected);
      }
    });
  });

  describe('ip4 and ip6 mechanisms (RFC 7208 5.6)', () => {
    test('does not match an IPv4 client with an IPv4-mapped ip6 network', async () => {
      expect(await resultOf(withRecord('v=spf1 ip6:::ffff:192.0.2.0/120 -all'))).toBe('fail');
    });

    test('matches IPv6 clients with an embedded IPv4 ip6 network', async () => {
      expect(
        await resultOf(withRecord('v=spf1 ip6:2001:db8::1.2.3.4 -all'), {
          ip: '2001:db8::102:304',
        }),
      ).toBe('pass');
    });

    test('matches every IPv6 client with a /0 ip6 network and never an IPv4 client', async () => {
      const zone = withRecord('v=spf1 ip6:::1.1.1.1/0 -all');
      expect(await resultOf(zone, { ip: '2001:db8::1' })).toBe('pass');
      expect(await resultOf(zone, { ip: '192.0.2.1' })).toBe('fail');
    });

    for (const [record, ip] of [
      ['v=spf1 ip4:2001:db8::1 -all', '192.0.2.1'],
      ['v=spf1 ip6:192.0.2.1 -all', '192.0.2.1'],
      ['v=spf1 ip6:2001:db8::/32//64 -all', '2001:db8::1'],
      ['v=spf1 ip4:192.0.2.0/00 +all', '192.0.2.1'],
    ] as const) {
      test(`gives permerror for "${record}"`, async () => {
        expect(await resultOf(withRecord(record), { ip })).toBe('permerror');
      });
    }

    test('matches CIDR ranges at bit boundaries', async () => {
      const zone = withRecord('v=spf1 ip4:192.0.2.128/25 ip6:2001:db8:8000::/33 -all');
      expect(await resultOf(zone, { ip: '192.0.2.128' })).toBe('pass');
      expect(await resultOf(zone, { ip: '192.0.2.127' })).toBe('fail');
      expect(await resultOf(zone, { ip: '2001:db8:8000::1' })).toBe('pass');
      expect(await resultOf(zone, { ip: '2001:db8:7fff::1' })).toBe('fail');
    });
  });

  describe('Void lookups (RFC 7208 4.6.4)', () => {
    test('does not count address lookups of MX hosts as void lookups', async () => {
      const zone = {
        'example.test': {
          TXT: ['v=spf1 mx -all'],
          MX: [1, 2, 3]
            .map((priority) => ({ priority, exchange: `dead${priority}.example.test` }))
            .concat({
              priority: 4,
              exchange: 'live.example.test',
            }),
        },
        'live.example.test': { A: ['192.0.2.1'] },
      } satisfies Zone;
      expect(await check(zone)).toMatchObject({ result: 'pass', voidLookups: 0 });
    });

    test('counts an empty answer for the client address family as void', async () => {
      const zone = withRecord(
        'v=spf1 a:v6only1.example.test a:v6only2.example.test a:v6only3.example.test -all',
        {
          'v6only1.example.test': { AAAA: ['2001:db8::1'] },
          'v6only2.example.test': { AAAA: ['2001:db8::2'] },
          'v6only3.example.test': { AAAA: ['2001:db8::3'] },
        },
      );
      expect(await check(zone)).toMatchObject({
        result: 'permerror',
        reason: 'More than 2 void lookups',
      });
    });

    test('sends a repeated query once but counts it every time', async () => {
      const log: Query[] = [];
      const zone = withRecord(
        'v=spf1 a:gone.example.test a:gone.example.test a:gone.example.test -all',
        {
          'gone.example.test': { MX: [] },
        },
      );
      expect(await check(zone, {}, { log })).toMatchObject({
        result: 'permerror',
        lookups: 3,
        voidLookups: 3,
      });
      expect(log.filter((query) => query === 'A gone.example.test')).toHaveLength(1);
    });

    test('stays within the limit with two void lookups', async () => {
      const zone = withRecord('v=spf1 a:v6only1.example.test a:v6only2.example.test -all', {
        'v6only1.example.test': { AAAA: ['2001:db8::1'] },
        'v6only2.example.test': { AAAA: ['2001:db8::2'] },
      });
      expect(await check(zone)).toMatchObject({ result: 'fail', voidLookups: 2 });
    });
  });

  describe('Record selection (RFC 7208 4.5)', () => {
    test('discards a record with leading whitespace', async () => {
      expect(await resultOf(withRecord(' v=spf1 -all'))).toBe('none');
    });

    test('discards a record whose version is not followed by SP', async () => {
      expect(await resultOf(withRecord('v=spf1\t-all'))).toBe('none');
      expect(await resultOf(withRecord('v=spf10 -all'))).toBe('none');
    });

    test('accepts several spaces between terms and trailing spaces', async () => {
      expect(await resultOf(withRecord('v=spf1  ip4:192.0.2.9   -all  '))).toBe('fail');
    });

    test('reads the version and mechanism names in any case', async () => {
      expect(await resultOf(withRecord('V=SPF1 IP4:192.0.2.1 -ALL'))).toBe('pass');
    });

    test('gives permerror for two SPF records', async () => {
      expect(await check(withRecord(['v=spf1 +all', 'v=spf1 -all']))).toMatchObject({
        result: 'permerror',
        reason: 'example.test has 2 SPF records',
      });
    });

    test('ignores TXT records that are not SPF', async () => {
      const zone = withRecord(['google-site-verification=abc\n', 'v=spf1 ip4:192.0.2.1 -all']);
      expect(await resultOf(zone)).toBe('pass');
    });
  });

  describe('Explanation (RFC 7208 6.2)', () => {
    test('expands the explanation for a fail result', async () => {
      const zone = withRecord('v=spf1 -all exp=explain._spf.%{d}', {
        'explain._spf.example.test': {
          TXT: ["%{i} is not one of %{d}'s designated mail servers."],
        },
      });
      expect(await check(zone)).toMatchObject({
        result: 'fail',
        explanation: "192.0.2.1 is not one of example.test's designated mail servers.",
      });
    });

    test('allows c, r and t in the explanation text', async () => {
      const zone = withRecord('v=spf1 -all exp=explain.example.test', {
        'explain.example.test': { TXT: ['%{c} rejected by %{r}'] },
      });
      expect((await check(zone)).explanation).toBe('192.0.2.1 rejected by mx.receiver.test');
    });

    test('sets no explanation for other results', async () => {
      const zone = withRecord('v=spf1 ~all exp=explain.example.test', {
        'explain.example.test': { TXT: ['nope'] },
      });
      const result = await check(zone);
      expect(result.result).toBe('softfail');
      expect(result.explanation).toBeUndefined();
    });

    test('ignores the explanation of an included record and uses the one of a redirect target', async () => {
      const texts = {
        'outer.example.test': { TXT: ['outer'] },
        'inner.example.test': { TXT: ['inner'] },
      } satisfies Zone;
      const included = withRecord('v=spf1 include:inc.example.test -all exp=outer.example.test', {
        ...texts,
        'inc.example.test': { TXT: ['v=spf1 -all exp=inner.example.test'] },
      });
      expect((await check(included)).explanation).toBe('outer');
      const redirected = withRecord('v=spf1 exp=outer.example.test redirect=r.example.test', {
        ...texts,
        'r.example.test': { TXT: ['v=spf1 -all exp=inner.example.test'] },
      });
      expect((await check(redirected)).explanation).toBe('inner');
    });

    for (const [label, extra] of [
      ['a DNS error', { 'explain.example.test': { TXT: 'ETIMEOUT' } }],
      ['no TXT record', {}],
      ['two TXT records', { 'explain.example.test': { TXT: ['one', 'two'] } }],
      ['a syntax error', { 'explain.example.test': { TXT: ['The %{x}-files.'] } }],
      ['non-ASCII text', { 'explain.example.test': { TXT: ['ï»¿Explanation'] } }],
    ] as const) {
      test(`ignores the explanation on ${label}`, async () => {
        const result = await check(withRecord('v=spf1 -all exp=explain.example.test', extra));
        expect(result).toMatchObject({ result: 'fail', voidLookups: 0 });
        expect(result.explanation).toBeUndefined();
      });
    }

    for (const [label, input] of [
      ['a non-ASCII local-part', { sender: 'jõgi@example.test' }],
      ['line breaks in the local-part', { sender: 'a\r\n550 x@example.test' }],
      ['a non-ASCII HELO name', { helo: 'jõgi.example.test' }],
    ] as const) {
      test(`ignores an explanation that is not US-ASCII after expanding ${label}`, async () => {
        const zone = withRecord('v=spf1 -all exp=explain.example.test', {
          'explain.example.test': { TXT: ['%{s} via %{h} is not allowed'] },
        });
        const result = await check(zone, input);
        expect(result.result).toBe('fail');
        expect(result.explanation).toBeUndefined();
      });
    }

    test('keeps an explanation that is US-ASCII after expansion', async () => {
      const zone = withRecord('v=spf1 -all exp=explain.example.test', {
        'explain.example.test': { TXT: ['%{s} via %{h} is not allowed'] },
      });
      expect((await check(zone)).explanation).toBe(
        'user@example.test via mail.example.test is not allowed',
      );
    });

    test('does not count the explanation lookups toward the limits', async () => {
      const zone = withRecord('v=spf1 -all exp=%{p}.explain.example.test', {
        'unknown.explain.example.test': { TXT: ['no'] },
      });
      expect(await check(zone)).toMatchObject({ explanation: 'no', lookups: 0, voidLookups: 0 });
    });
  });
});

describe('known upstream issues', () => {
  test('mailauth #104: MX hosts of the other family do not use up the void limit', async () => {
    const zone = {
      'example.test': { TXT: ['v=spf1 include:res.example.test ip6:2001:db8::/32 -all'] },
      'res.example.test': {
        TXT: ['v=spf1 mx:res.example.test -all'],
        MX: [1, 2, 3, 4].map((n) => ({ priority: n, exchange: `esa${n}.example.test` })),
      },
      ...Object.fromEntries(
        [1, 2, 3, 4].map((n) => [`esa${n}.example.test`, { A: [`192.0.2.${n}`] }]),
      ),
    } satisfies Zone;
    expect(await resultOf(zone, { ip: '2001:db8::1' })).toBe('pass');
  });

  test('mailauth #100: expands macros before an mx lookup', async () => {
    const zone = {
      'example.test': {
        TXT: ['v=spf1 mx:%{o} -all'],
        MX: [{ priority: 10, exchange: 'mail.example.test' }],
      },
      'mail.example.test': { A: ['192.0.2.1'] },
    } satisfies Zone;
    expect(await resultOf(zone)).toBe('pass');
  });

  test('mailauth #33: accepts MX host names in upper case', async () => {
    const zone = {
      'example.test': {
        TXT: ['v=spf1 mx -all'],
        MX: [{ priority: 1, exchange: 'ASPMX.EXAMPLE.TEST' }],
      },
      'aspmx.example.test': { A: ['192.0.2.1'] },
    } satisfies Zone;
    expect(await resultOf(zone)).toBe('pass');
  });

  test('mailauth #7: a non-SPF TXT record with a line break does not break the check', async () => {
    const zone = withRecord(['verification=abc\n', 'v=spf1 ip4:192.0.2.1 -all']);
    expect(await resultOf(zone)).toBe('pass');
  });

  test('mailauth #125: %{d} in a nested include is the included domain', async () => {
    const zone = {
      'example.test': { TXT: ['v=spf1 include:policy.test -all'] },
      'policy.test': { TXT: ['v=spf1 exists:%{d}.allow.test -all'] },
      'policy.test.allow.test': { A: ['127.0.0.2'] },
    } satisfies Zone;
    expect(await resultOf(zone)).toBe('pass');
  });

  test('mailauth #154: a %{p} expansion uses one lookup and no void lookup', async () => {
    const zone = withRecord('v=spf1 exists:%{p}.a.example.test -all');
    expect(await check(zone)).toMatchObject({ lookups: 2, voidLookups: 1 });
  });

  test('mailauth #155: checks the explanation for US-ASCII after expansion', async () => {
    const zone = withRecord('v=spf1 -all exp=explain.example.test', {
      'explain.example.test': { TXT: ['%{l} is not allowed'] },
    });
    expect((await check(zone, { sender: 'a\r\nb@example.test' })).explanation).toBeUndefined();
  });

  test('mailauth #87: joins the strings of one TXT record with nothing between them', async () => {
    const zone = { 'example.test': { TXT: [['v=spf1 ip4:192.0.2.1 i', 'p4:192.0.2.2 -all']] } };
    expect(await resultOf(zone, { ip: '192.0.2.2' })).toBe('pass');
  });

  test('after the mailauth #104 fix, an a term for an IPv6 client counts its empty AAAA answer', async () => {
    const zone = withRecord('v=spf1 a:v4.example.test -all', {
      'v4.example.test': { A: ['192.0.2.1'] },
    });
    expect(await check(zone, { ip: '2001:db8::1' })).toMatchObject({
      result: 'fail',
      voidLookups: 1,
    });
  });

  test('counts an empty array from the resolver as a void lookup', async () => {
    const resolver = {
      ...zoneResolver(withRecord('v=spf1 exists:x.example.test -all')),
      resolve4: () => Promise.resolve([]),
    };
    const result = await Spf.check({ ip: '192.0.2.1', sender: 'u@example.test' }, { resolver });
    expect(result).toMatchObject({ result: 'fail', voidLookups: 1 });
  });
});
