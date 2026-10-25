import * as Arc from '@portable/arc';
import { describe, expect, test } from 'vite-plus/test';
import {
  baseMessage,
  binary,
  check,
  dnsTxt,
  encode,
  fromBinary,
  makeAms,
  makeAs,
  randomChunks,
  records,
  relaxedHeader,
  resolverFrom,
  sealReference,
  signReference,
  singleSet,
  stream,
} from './utils.js';

const withSealTags = async (rawTags: string): Promise<string> =>
  (await singleSet({ rawTags })).message;

const withAmsTags = async (extraTags: string): Promise<string> =>
  (await singleSet({ amsOptions: { extraTags } })).message;

describe('verify', () => {
  test('a message without ARC fields is none', async () => {
    expect(await check(baseMessage)).toEqual({ result: 'none', instance: 0, sets: [] });
  });

  test('a single set passes and reports its sealer and results', async () => {
    const { message } = await singleSet();
    expect(await check(message)).toEqual({
      result: 'pass',
      instance: 1,
      sets: [
        {
          instance: 1,
          domain: 'one.example',
          selector: 's',
          authResults: 'one.example; spf=pass smtp.mailfrom=example.com',
        },
      ],
    });
  });

  test('reads a message from a stream in any chunks, as bytes or as text', async () => {
    const { message } = await singleSet();
    const bytes = fromBinary(message);
    for (const seed of [1, 2, 3]) {
      const result = await Arc.verify(stream(randomChunks(bytes, seed, 7)), {
        resolver: resolverFrom(records),
      });
      expect(result.result).toBe('pass');
    }
    expect((await Arc.verify(message, { resolver: resolverFrom(records) })).result).toBe('pass');
  });

  test('reads bare LF line ends as CRLF', async () => {
    const { message } = await singleSet();
    expect((await check(message.replaceAll('\r\n', '\n'))).result).toBe('pass');
  });

  test('a body changed after sealing fails the newest ARC-Message-Signature', async () => {
    const { message } = await singleSet();
    const result = await check(message.replace('Hello world', 'Hello there'));
    expect(result).toMatchObject({
      result: 'fail',
      instance: 1,
      reason: 'i=1 ams body hash did not verify',
      sets: [],
    });
  });

  test('a header field changed after sealing fails the newest ARC-Message-Signature', async () => {
    const { message } = await singleSet();
    const result = await check(message.replace('Subject: hello', 'Subject: changed'));
    expect(result.reason).toBe('i=1 ams signature did not verify');
  });

  test('validates a chain of three sets and lists them from the oldest', async () => {
    const keys = {
      ...records,
      's._domainkey.two.example': 'k2',
      's._domainkey.three.example': 'k1',
    };
    const a = await singleSet();
    const b = await sealReference(a.message, a.sets, {
      i: 2,
      cv: 'pass',
      d: 'two.example',
      s: 's',
      keyName: 'k2',
    });
    const c = await sealReference(b.message, b.sets, {
      i: 3,
      cv: 'pass',
      d: 'three.example',
      s: 's',
      keyName: 'k1',
    });
    const result = await check(c.message, keys);
    expect(result.result).toBe('pass');
    expect(result.sets.map((set) => [set.instance, set.domain])).toEqual([
      [1, 'one.example'],
      [2, 'two.example'],
      [3, 'three.example'],
    ]);
  });

  test('only the newest ARC-Message-Signature is checked; older ones may break', async () => {
    const keys = { ...records, 's._domainkey.two.example': 'k2' };
    const a = await singleSet();
    const changed = a.message.replace('Hello world', 'Hello list');
    const b = await sealReference(changed, a.sets, {
      i: 2,
      cv: 'pass',
      d: 'two.example',
      s: 's',
      keyName: 'k2',
    });
    expect((await check(b.message, keys)).result).toBe('pass');
  });

  test('looks up each key once', async () => {
    const keys = { ...records, 's._domainkey.two.example': 'k1' };
    const a = await singleSet();
    const b = await sealReference(a.message, a.sets, {
      i: 2,
      cv: 'pass',
      d: 'one.example',
      s: 's',
      keyName: 'k1',
    });
    const resolver = resolverFrom(keys);
    expect((await Arc.verify(fromBinary(b.message), { resolver })).result).toBe('pass');
    expect(resolver.log).toEqual(['s._domainkey.one.example']);
  });
});

describe('cv values (RFC 8617 section 3.9)', () => {
  const forgedRecords = {
    'sel._domainkey.att.example': 'att',
    'sel._domainkey.victim.example': 'victim',
  };

  test('validates every seal behind a cv=PASS seal that signed only its own set', async () => {
    const aar =
      'ARC-Authentication-Results: i=1; mx.victim.example; dkim=pass header.i=@victim.example; spf=pass smtp.mailfrom=victim.example';
    const ams =
      'ARC-Message-Signature: i=1; a=rsa-sha256; c=relaxed/relaxed; d=victim.example; s=sel; h=from:to:subject; bh=AAAA; b=AAAA';
    const as = 'ARC-Seal: i=1; a=rsa-sha256; cv=none; d=victim.example; s=sel; t=1; b=AAAAAAAA';
    const forged = await sealReference(
      `${as}\r\n${ams}\r\n${aar}\r\n${baseMessage}`,
      [{ aar, ams, as }],
      {
        i: 2,
        cv: 'PASS',
        d: 'att.example',
        s: 'sel',
        keyName: 'att',
        ownScope: true,
      },
    );
    const result = await check(forged.message, forgedRecords);
    expect(result.result).toBe('fail');
    expect(result.reason).toBe('i=2 as signature did not verify');
  });

  test('accepts a valid chain that writes cv=Pass and cv=None', async () => {
    const keys = { ...records, 's._domainkey.two.example': 'k2' };
    const a = await singleSet({ cv: 'None' });
    const b = await sealReference(a.message, a.sets, {
      i: 2,
      cv: 'Pass',
      d: 'two.example',
      s: 's',
      keyName: 'k2',
    });
    expect((await check(b.message, keys)).result).toBe('pass');
  });

  test('fails a chain whose newest seal is cv=fail without checking older seals', async () => {
    const a = await singleSet();
    const forged = a.message.replace(/(ARC-Seal: i=1;[\s\S]*?b=)[A-Za-z0-9+/]{10}/, '$1AAAAAAAAAA');
    const set = { ...a.set, as: forged.slice(0, forged.indexOf('\r\nARC-Message-Signature')) };
    const f = await sealReference(forged, [set], {
      i: 2,
      cv: 'fail',
      d: 'one.example',
      s: 's',
      keyName: 'k1',
    });
    expect(await check(f.message)).toMatchObject({ result: 'fail', reason: 'i=2 has cv=fail' });
  });

  test('fails when an older seal is invalid', async () => {
    const a = await singleSet();
    const b = await sealReference(a.message, a.sets, {
      i: 2,
      cv: 'pass',
      d: 'one.example',
      s: 's',
      keyName: 'k1',
    });
    const aar = a.set.aar.replace('spf=pass', 'spf=fail');
    const resealed = await makeAs([{ ...a.set, aar }], b.set, {
      i: 2,
      cv: 'pass',
      d: 'one.example',
      s: 's',
      keyName: 'k1',
    });
    const changed = b.message.replace(a.set.aar, aar).replace(b.set.as, resealed);
    expect((await check(changed)).reason).toBe('i=1 as signature did not verify');
  });

  test('fails i=1 with cv=pass and a later set with cv=none', async () => {
    const one = await singleSet({ cv: 'pass' });
    expect((await check(one.message)).reason).toBe('i=1 has cv=pass instead of cv=none');
    const a = await singleSet();
    const b = await sealReference(a.message, a.sets, {
      i: 2,
      cv: 'none',
      d: 'one.example',
      s: 's',
      keyName: 'k1',
    });
    expect((await check(b.message)).reason).toBe('i=2 has cv=none instead of cv=pass');
  });
});

describe('Ed25519 seals (RFC 8463)', () => {
  const keys = { 'rsa._domainkey.one.example': 'k1', 'ed._domainkey.one.example': 'ed1' };

  const edSealed = async (prehash: boolean): Promise<string> => {
    const aar = 'ARC-Authentication-Results: i=1; one.example; spf=pass smtp.mailfrom=example.com';
    const ams = await makeAms(baseMessage, { i: 1, d: 'one.example', s: 'rsa', keyName: 'k1' });
    let as = await makeAs(
      [],
      { aar, ams },
      {
        i: 1,
        cv: 'none',
        d: 'one.example',
        s: 'ed',
        keyName: 'ed1',
        alg: 'ed25519-sha256',
      },
    );
    if (!prehash) {
      const field = as.slice(0, as.lastIndexOf('b=') + 2);
      const data = `${relaxedHeader(aar)}\r\n${relaxedHeader(ams)}\r\n${relaxedHeader(field)}`;
      as = field + (await signReference('ed25519-sha256', data, 'ed1', false));
    }
    return `${as}\r\n${ams}\r\n${aar}\r\n${baseMessage}`;
  };

  test('verifies an ed25519-sha256 ARC-Seal', async () => {
    expect((await check(await edSealed(true), keys)).result).toBe('pass');
  });

  test('rejects an ed25519 ARC-Seal made without the SHA-256 pre-hash', async () => {
    expect((await check(await edSealed(false), keys)).result).toBe('fail');
  });

  test('verifies an ed25519-sha256 ARC-Message-Signature', async () => {
    const { message } = await singleSet({
      alg: 'ed25519-sha256',
      keyName: 'ed1',
      s: 'ed',
      d: 'one.example',
    });
    expect((await check(message, keys)).result).toBe('pass');
  });
});

describe('ARC-Seal and ARC-Message-Signature tag syntax (RFC 6376 section 3.2)', () => {
  const invalid = [
    [
      'a duplicate tag',
      () => withSealTags('i=1; a=rsa-sha256; cv=none; d=one.example; s=s; s=s; b='),
      'i=1 as syntax error',
    ],
    [
      'a duplicate cv tag',
      () => withSealTags('i=1; a=rsa-sha256; cv=pass; d=one.example; s=s; cv=none; b='),
      'i=1 as syntax error',
    ],
    [
      'an upper case tag name',
      () => withSealTags('i=1; a=rsa-sha256; cv=none; d=one.example; S=s; b='),
      'i=1 as has no s=',
    ],
    [
      'an empty tag-spec',
      () => withSealTags('i=1; a=rsa-sha256; cv=none; d=one.example; s=s;; b='),
      'i=1 as syntax error',
    ],
    [
      'an invalid tag name',
      () => withSealTags('i=1; a=rsa-sha256; cv=none; d=one.example; s=s; _=; b='),
      'i=1 as syntax error',
    ],
    [
      'a t= that is not a number',
      () => withSealTags('i=1; a=rsa-sha256; cv=none; d=one.example; s=s; t=1 2; b='),
      'i=1 as has an invalid t=',
    ],
    [
      'an h= in the ARC-Seal',
      () => withSealTags('i=1; a=rsa-sha256; cv=none; d=one.example; s=s; h=from; b='),
      'i=1 as has h=',
    ],
    [
      'an rsa-sha1 ARC-Seal',
      () => withSealTags('i=1; a=rsa-sha1; cv=none; d=one.example; s=s; b='),
      'i=1 as has an unknown algorithm',
    ],
    ['a duplicate tag in the AMS', () => withAmsTags('s=s; '), 'i=1 ams signature syntax error'],
  ] satisfies [string, () => Promise<string>, string][];
  for (const [title, build, reason] of invalid) {
    test(`fails ${title}`, async () => {
      expect(await check(await build())).toMatchObject({ result: 'fail', reason });
    });
  }

  test.for(['x9=abc', 'H=from', 'c=relaxed', 'c=relaxed/relaxed', 'c=simple'])(
    'ignores %s on an ARC-Seal',
    async (tag) => {
      const message = await withSealTags(
        `i=1; a=rsa-sha256; cv=none; ${tag}; d=one.example; s=s; b=`,
      );
      expect((await check(message)).result).toBe('pass');
    },
  );

  test('reads an upper case BH= in the AMS as an unknown tag', async () => {
    expect((await check(await withAmsTags('BH=AAAA; '))).result).toBe('pass');
  });

  test('strips b= with FWS around the equals sign', async () => {
    const aar = 'ARC-Authentication-Results: i=1; one.example; spf=pass smtp.mailfrom=example.com';
    const ams = await makeAms(baseMessage, { i: 1, d: 'one.example', s: 's', keyName: 'k1' });
    const field = 'ARC-Seal: i=1; a=rsa-sha256; cv=none; d=one.example; s=s; t=1700000000; b =';
    const data = `${relaxedHeader(aar)}\r\n${relaxedHeader(ams)}\r\n${relaxedHeader(field)}`;
    const signature = await signReference('rsa-sha256', data, 'k1');
    expect(
      (await check(`${field} ${signature}\r\n${ams}\r\n${aar}\r\n${baseMessage}`)).result,
    ).toBe('pass');
  });
});

describe('the newest ARC-Message-Signature (RFC 8617 section 4.1.2)', () => {
  test('fails one whose h= does not include From', async () => {
    const { message } = await singleSet({ amsOptions: { h: ['to', 'subject'] } });
    const spoofed = message.replace(
      'From: Alice <alice@example.com>',
      'From: CEO <ceo@bank.example>',
    );
    expect((await check(spoofed)).reason).toBe('i=1 ams From field not signed');
  });

  test('fails one that signs ARC-Seal', async () => {
    const a = await singleSet();
    const b = await sealReference(a.message, a.sets, {
      i: 2,
      cv: 'pass',
      d: 'one.example',
      s: 's',
      keyName: 'k1',
      amsOptions: { h: ['from', 'arc-seal'] },
    });
    expect((await check(b.message)).reason).toBe('i=2 ams signs ARC-Seal');
  });

  const base =
    'From:   Alice <alice@example.com>\r\nTo: bob@example.net\r\nSubject: hello  there\r\nDate: Thu, 1 Jan 2024 00:00:00 +0000\r\nMessage-ID: <1@example.com>\r\n\r\nHello   world  \r\n\r\n';
  const withoutC = async (signedWith: string): Promise<string> =>
    (
      await sealReference(base, [], {
        i: 1,
        cv: 'none',
        d: 'one.example',
        s: 's',
        keyName: 'k1',
        amsOptions: { c: null, signedWith },
      })
    ).message;

  test('reads an AMS without c= as simple/simple', async () => {
    expect((await check(await withoutC('simple/simple'))).result).toBe('pass');
  });

  test('fails an AMS without c= that was signed relaxed/relaxed, as the drafts did', async () => {
    expect((await check(await withoutC('relaxed/relaxed'))).result).toBe('fail');
  });

  test('fails an expired ARC-Message-Signature', async () => {
    const { message } = await singleSet({ amsOptions: { extraTags: 't=1000; x=2000; ' } });
    expect((await check(message)).reason).toBe('i=1 ams signature expired');
    expect((await check(message, records, { now: new Date(1_500_000) })).result).toBe('pass');
  });

  test('checks x= against an object with epochMilliseconds, such as a Temporal.Instant', async () => {
    const { message } = await singleSet({ amsOptions: { extraTags: 't=1000; x=2000; ' } });
    const instant = await check(message, records, { now: { epochMilliseconds: 1_500_000 } });
    expect(instant).toEqual(await check(message, records, { now: new Date(1_500_000) }));
    expect(instant.result).toBe('pass');
  });

  test('rejects an invalid now without reading the message', async () => {
    const message = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encode('From: a@example.com\r\n\r\n'));
        c.close();
      },
    });
    const now = 'yesterday' as unknown as Date;
    await expect(Arc.verify(message, { resolver: resolverFrom(records), now })).rejects.toThrow(
      TypeError,
    );
    expect(message.locked).toBe(false);
  });
});

describe('instance values (RFC 8617 section 3.9)', () => {
  for (const value of ['0x1', '1.0', '+1', '1e0']) {
    test(`fails i=${value}`, async () => {
      const result = await check((await singleSet({ i: value })).message);
      expect(result.result).toBe('fail');
      expect(result.reason).toMatch(/^invalid (as|ams|aar) instance$/);
    });
  }

  test('accepts i=01', async () => {
    expect((await check((await singleSet({ i: '01' })).message)).result).toBe('pass');
  });

  test('accepts an ARC-Seal whose i= is not the first tag', async () => {
    const message = await withSealTags('a=rsa-sha256; cv=none; d=one.example; i=1; s=s; b=');
    expect((await check(message)).result).toBe('pass');
  });

  test('fails an ARC-Authentication-Results whose i= is not first', async () => {
    const { message } = await singleSet({
      aar: 'ARC-Authentication-Results: one.example; i=1; spf=pass smtp.mailfrom=example.com',
    });
    expect(await check(message)).toMatchObject({ result: 'fail', reason: 'invalid aar instance' });
  });

  test('accepts comments around the instance of an ARC-Authentication-Results', async () => {
    const { message } = await singleSet({
      aar: 'ARC-Authentication-Results: (first) i = 1 (one) ; one.example; spf=pass',
    });
    const result = await check(message);
    expect(result.result).toBe('pass');
    expect(result.sets[0]!.authResults).toBe('one.example; spf=pass');
  });

  for (const stray of ['i=0', 'i=abc', 'i=51']) {
    test(`fails a chain with a stray ARC-Seal with ${stray}`, async () => {
      const { message } = await singleSet();
      const changed = message.replace(
        '\r\nFrom:',
        `\r\nARC-Seal: ${stray}; a=rsa-sha256; cv=pass; d=x.example; s=s; b=AAAA\r\nFrom:`,
      );
      expect((await check(changed)).result).toBe('fail');
    });
  }

  test('fails a message whose only ARC field is malformed', async () => {
    const message = `ARC-Seal: i=0; a=rsa-sha256; cv=none; d=x.example; s=s; b=AAAA\r\n${baseMessage}`;
    expect(await check(message)).toMatchObject({ result: 'fail', reason: 'invalid as instance' });
  });

  test('fails a gap, a duplicate field, and a missing field', async () => {
    const a = await singleSet();
    const gap = a.message.replaceAll('i=1;', 'i=2;');
    expect((await check(gap)).reason).toBe('i=1 is missing');
    const duplicate = `${a.set.aar}\r\n${a.message}`;
    expect((await check(duplicate)).reason).toBe('i=1 has more than one aar');
    const missing = a.message.replace(`${a.set.ams}\r\n`, '');
    expect((await check(missing)).reason).toBe('i=1 has no ams');
  });

  test('reports the highest instance of a failed chain', async () => {
    const a = await singleSet();
    const b = await sealReference(a.message, a.sets, {
      i: 2,
      cv: 'pass',
      d: 'one.example',
      s: 's',
      keyName: 'k1',
    });
    const result = await check(b.message.replace('Hello world', 'changed'));
    expect(result).toMatchObject({ result: 'fail', instance: 2 });
  });
});

describe('keys', () => {
  test('fails a seal whose a= does not match the key type', async () => {
    const aar = 'ARC-Authentication-Results: i=1; one.example; spf=pass smtp.mailfrom=example.com';
    const ams = await makeAms(baseMessage, { i: 1, d: 'one.example', s: 's', keyName: 'k1' });
    const field = 'ARC-Seal: i=1; a=ed25519-sha256; cv=none; d=one.example; s=s; t=1700000000; b=';
    const data = `${relaxedHeader(aar)}\r\n${relaxedHeader(ams)}\r\n${relaxedHeader(field)}`;
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', fromBinary(data)));
    const signature = await signReference('rsa-sha256', binary(hash), 'k1');
    const result = await check(`${field}${signature}\r\n${ams}\r\n${aar}\r\n${baseMessage}`);
    expect(result.reason).toBe('i=1 as inappropriate key algorithm');
  });

  test('applies the key record h=, s= and v= to ARC keys', async () => {
    const { message } = await singleSet();
    const cases = [
      [await dnsTxt('k1', 'h=sha1; '), 'i=1 ams inappropriate hash algorithm'],
      [await dnsTxt('k1', 's=other; '), 'i=1 ams key not for email'],
      [(await dnsTxt('k1')).replace('v=DKIM1', 'v=DKIM2'), 'i=1 ams unknown key version'],
    ] satisfies [string, string][];
    for (const [record, reason] of cases) {
      expect((await check(message, { 's._domainkey.one.example': record })).reason).toBe(reason);
    }
  });

  test('applies the key record to an ARC-Seal whose key differs from the AMS key', async () => {
    const { message } = await singleSet({ amsOptions: { s: 'ams' } });
    const keys = {
      'ams._domainkey.one.example': 'k1',
      's._domainkey.one.example': await dnsTxt('k1', 'h=sha1; '),
    };
    expect((await check(message, keys)).reason).toBe('i=1 as inappropriate hash algorithm');
  });

  test('reports a weak, a missing, and an unusable key', async () => {
    const weak = await singleSet({ keyName: 'small' });
    expect((await check(weak.message, { 's._domainkey.one.example': 'small' })).reason).toBe(
      'i=1 ams weak key',
    );
    const { message } = await singleSet();
    expect((await check(message, {})).reason).toBe('i=1 ams no key');
    const unusable = { 's._domainkey.one.example': 'v=DKIM1; k=rsa; p=bm90LWEta2V5' };
    expect((await check(message, unusable)).reason).toBe('i=1 ams invalid public key');
  });

  test('lowers minKeyBits on request', async () => {
    const weak = await singleSet({ keyName: 'small' });
    const keys = { 's._domainkey.one.example': 'small' };
    expect((await check(weak.message, keys, { minKeyBits: 512 })).result).toBe('pass');
  });

  test('fails on a DNS error other than no records', async () => {
    const { message } = await singleSet();
    const resolver = {
      resolveTxt: () => Promise.reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })),
    } satisfies Arc.Resolver;
    const result = await Arc.verify(fromBinary(message), { resolver });
    expect(result).toMatchObject({ result: 'fail', reason: 'i=1 ams key lookup failed: ETIMEOUT' });
  });
});

describe('a d= that is not a host name (RFC 6376 section 3.5)', () => {
  const aar = 'ARC-Authentication-Results: i=1; one.example; spf=pass smtp.mailfrom=example.com';
  for (const separator of ['/', '?', '#', '\\', '@', ':']) {
    const d = `one.example${separator}x.attacker.test`;
    const variants = [
      ['the ARC-Seal and the AMS', { d, aar }, 'i=1 as has an invalid d='],
      ['the ARC-Seal', { d, aar, amsOptions: { d: 'one.example' } }, 'i=1 as has an invalid d='],
      ['the AMS', { d: 'one.example', aar, amsOptions: { d } }, 'i=1 ams signature syntax error'],
    ] satisfies [string, Parameters<typeof singleSet>[0], string][];
    for (const [title, options, reason] of variants) {
      test(`fails d=${d} in ${title} without a key query`, async () => {
        const resolver = resolverFrom({
          [`s._domainkey.${d}`]: 'k1',
          's._domainkey.one.example': 'k1',
        });
        const result = await Arc.verify(fromBinary((await singleSet(options)).message), {
          resolver,
        });
        expect(result).toMatchObject({ result: 'fail', reason });
        expect(resolver.log).toEqual([]);
      });
    }
  }

  test('fails an older ARC-Seal with such a d=', async () => {
    const d = 'one.example/x.attacker.test';
    const first = await singleSet({ d, aar, amsOptions: { d: 'one.example' } });
    const second = await sealReference(first.message, first.sets, {
      i: 2,
      cv: 'pass',
      d: 'one.example',
      s: 's',
      keyName: 'k1',
      aar: 'ARC-Authentication-Results: i=2; one.example; arc=pass',
    });
    const resolver = resolverFrom({
      [`s._domainkey.${d}`]: 'k1',
      's._domainkey.one.example': 'k1',
    });
    const result = await Arc.verify(fromBinary(second.message), { resolver });
    expect(result.reason).toBe('i=1 as has an invalid d=');
    expect(resolver.log).toEqual([]);
  });

  test('accepts a U-label d= and looks up its A-label', async () => {
    const d = binary(encode('bücher.example'));
    const { message } = await singleSet({ d, aar });
    const result = await check(message, { 's._domainkey.xn--bcher-kva.example': 'k1' });
    expect(result.result).toBe('pass');
    expect(result.sets[0]!.domain).toBe('xn--bcher-kva.example');
  });
});

describe('cancellation', () => {
  test('rejects with the reason of an aborted signal', async () => {
    const { message } = await singleSet();
    const reason = new Error('stop');
    await expect(
      Arc.verify(fromBinary(message), {
        resolver: resolverFrom(records),
        signal: AbortSignal.abort(reason),
      }),
    ).rejects.toBe(reason);
  });

  test('rejects with the reason and cancels the message when the signal aborts the header read', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const message = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encode('From: a@example.com\r\n'));
      },
      pull: () => new Promise<void>(() => {}),
      cancel() {
        cancelled = true;
      },
    });
    const pending = Arc.verify(message, {
      resolver: resolverFrom(records),
      signal: controller.signal,
    });
    const reason = new Error('stop');
    setTimeout(() => controller.abort(reason), 10);
    await expect(pending).rejects.toBe(reason);
    expect(cancelled).toBe(true);
  });

  test('stops a pending key lookup', async () => {
    const { message } = await singleSet();
    const controller = new AbortController();
    const reason = new Error('stop');
    const resolver = {
      resolveTxt: () => {
        controller.abort(reason);
        return new Promise(() => {});
      },
    } satisfies Arc.Resolver;
    await expect(
      Arc.verify(fromBinary(message), { resolver, signal: controller.signal }),
    ).rejects.toBe(reason);
  });

  test('rejects an invalid resolver', async () => {
    await expect(Arc.verify(baseMessage, { resolver: {} as Arc.Resolver })).rejects.toThrow(
      TypeError,
    );
  });
});
