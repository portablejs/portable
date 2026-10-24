import * as Arc from '@portable/arc';
import { describe, expect, test } from 'vite-plus/test';
import {
  baseMessage,
  check,
  encode,
  keyPair,
  records,
  resolverFrom,
  sealReference,
  singleSet,
  stream,
} from './utils.js';

const options = async (extra: Partial<Arc.seal.Options> = {}): Promise<Arc.seal.Options> => ({
  domain: 'one.example',
  selector: 's',
  privateKey: (await keyPair('k1')).pem,
  authResults: 'mx.one.example; spf=pass smtp.mailfrom=example.com',
  now: new Date('2024-01-01T00:00:00Z'),
  ...extra,
});

const seal = async (message: string, extra: Partial<Arc.seal.Options> = {}): Promise<string> =>
  Arc.seal(message, await options(extra));

/** Seals a message and validates the result. */
async function sealAndCheck(
  message: string,
  extra: Partial<Arc.seal.Options> = {},
  keys: Record<string, string> = records,
): Promise<{ fields: string; result: Arc.Result }> {
  const fields = await seal(message, extra);
  return { fields, result: await check(fields + message, keys) };
}

const tagsOf = (fields: string, name: string): string =>
  new RegExp(`^${name}: ([^]*?)\\r\\n(?=\\S|$)`, 'm').exec(fields)![1]!.replace(/\r\n[ \t]/g, ' ');

describe('seal', () => {
  test('writes ARC-Seal, ARC-Message-Signature and ARC-Authentication-Results with i=1 and cv=none', async () => {
    const { fields, result } = await sealAndCheck(baseMessage);
    expect(fields).toMatch(
      /^ARC-Seal: i=1; a=rsa-sha256; t=1704067200; cv=none; d=one\.example; s=s; b=/,
    );
    expect(fields).toMatch(/\r\nARC-Message-Signature: i=1; a=rsa-sha256; c=relaxed\/relaxed;/);
    expect(fields).toMatch(
      /\r\nARC-Authentication-Results: i=1; mx\.one\.example; spf=pass smtp\.mailfrom=example\.com\r\n$/,
    );
    expect(result).toMatchObject({ result: 'pass', instance: 1 });
  });

  test('keeps every line within 76 characters', async () => {
    const fields = await seal(baseMessage);
    for (const line of fields.split('\r\n').slice(0, -2)) {
      expect(line.length).toBeLessThanOrEqual(76);
    }
  });

  test('extends a valid chain with cv=pass as the next instance', async () => {
    const a = await singleSet();
    const { fields, result } = await sealAndCheck(a.message, { chainValidation: 'pass' });
    expect(fields).toMatch(/^ARC-Seal: i=2;.* cv=pass;/);
    expect(result).toMatchObject({ result: 'pass', instance: 2 });
  });

  test('seals one message repeatedly, each set over the last', async () => {
    let message = baseMessage;
    for (let i = 1; i <= 4; i++) {
      const arc = await check(message);
      expect(arc.result).toBe(i === 1 ? 'none' : 'pass');
      message = (await seal(message, { chainValidation: arc.result })) + message;
    }
    expect((await check(message)).sets.map((set) => set.instance)).toEqual([1, 2, 3, 4]);
  });

  test('reads the message from a stream', async () => {
    const fields = await Arc.seal(stream([encode(baseMessage)]), await options());
    expect((await check(fields + baseMessage)).result).toBe('pass');
  });

  test('seals with an Ed25519 key', async () => {
    const keys = { 'ed._domainkey.one.example': 'ed1' };
    const { fields, result } = await sealAndCheck(
      baseMessage,
      { selector: 'ed', privateKey: (await keyPair('ed1')).pem },
      keys,
    );
    expect(fields).toMatch(/^ARC-Seal: i=1; a=ed25519-sha256;/);
    expect(fields).toMatch(/\r\nARC-Message-Signature: i=1; a=ed25519-sha256;/);
    expect(result.result).toBe('pass');
  });

  test('takes a CryptoKey', async () => {
    const { result } = await sealAndCheck(baseMessage, {
      privateKey: (await keyPair('k1')).privateKey,
    });
    expect(result.result).toBe('pass');
  });

  test('does not change the options object, so it can seal several messages at once', async () => {
    const shared = await options();
    const snapshot = { ...shared };
    const a =
      'From: a@example.com\r\nTo: b@example.net\r\nSubject: hi\r\n\r\nbody of message A\r\n';
    const b =
      'From: a@example.com\r\nTo: b@example.net\r\nSubject: hi\r\n\r\na different body for B\r\n';
    const [sealedA, sealedB] = await Promise.all([Arc.seal(a, shared), Arc.seal(b, shared)]);
    expect(tagsOf(sealedA, 'ARC-Message-Signature')).not.toBe(
      tagsOf(sealedB, 'ARC-Message-Signature'),
    );
    expect((await check(sealedA + a)).result).toBe('pass');
    expect((await check(sealedB + b)).result).toBe('pass');
    expect(shared).toEqual(snapshot);
  });
});

describe('chainValidation (RFC 8617 section 5.1)', () => {
  test('is required when the message has ARC fields', async () => {
    await expect(seal((await singleSet()).message)).rejects.toThrow(TypeError);
  });

  test('must be none, pass or fail, in lower case', async () => {
    for (const value of ['maybe', 'PASS']) {
      await expect(
        seal(baseMessage, { chainValidation: value as Arc.Result.Code }),
      ).rejects.toThrow(RangeError);
    }
  });

  test('must be none for a message without ARC fields and only for one', async () => {
    await expect(seal(baseMessage, { chainValidation: 'pass' })).rejects.toThrow(RangeError);
    await expect(seal(baseMessage, { chainValidation: 'fail' })).rejects.toThrow(RangeError);
    await expect(seal((await singleSet()).message, { chainValidation: 'none' })).rejects.toThrow(
      RangeError,
    );
  });

  test('seals a message whose only ARC fields are malformed as i=1 with cv=fail', async () => {
    for (const stray of ['ARC-Seal:', 'ARC-Seal: i=0; cv=none', 'ARC-Message-Signature: i=x']) {
      const message = `${stray}\r\n${baseMessage}`;
      const arc = await check(message);
      expect(arc).toMatchObject({ result: 'fail', instance: 0 });
      await expect(seal(message, { chainValidation: 'pass' })).rejects.toThrow(RangeError);
      await expect(seal(message)).rejects.toThrow(TypeError);
      const fields = await seal(message, { chainValidation: arc.result });
      expect(fields).toMatch(/^ARC-Seal: i=1;.* cv=fail;/);
      expect((await check(fields + message)).result).toBe('fail');
    }
  });

  test('refuses a chain whose newest seal is cv=fail', async () => {
    const a = await singleSet();
    const f = await sealReference(a.message, a.sets, {
      i: 2,
      cv: 'fail',
      d: 'one.example',
      s: 's',
      keyName: 'k1',
    });
    for (const chainValidation of ['fail', 'pass'] as const) {
      await expect(seal(f.message, { chainValidation })).rejects.toThrow(Arc.InvalidInputError);
    }
  });

  test('seals a broken chain with cv=fail as the next instance, covering only the new set', async () => {
    const broken = (await singleSet()).message.replace(
      '\r\nFrom:',
      '\r\nARC-Authentication-Results: i=1; dup.example; spf=fail\r\nFrom:',
    );
    const arc = await check(broken);
    expect(arc.result).toBe('fail');
    const fields = await seal(broken, { chainValidation: arc.result });
    expect(fields).toMatch(/^ARC-Seal: i=2;.* cv=fail;/);
    expect(fields).toMatch(/\r\nARC-Authentication-Results: i=2;/);
    expect((await check(fields + broken)).result).toBe('fail');
  });

  test('refuses cv=pass over a chain whose sets cannot be read', async () => {
    const broken = (await singleSet()).message.replace(
      '\r\nFrom:',
      '\r\nARC-Authentication-Results: i=1; dup.example; spf=fail\r\nFrom:',
    );
    await expect(seal(broken, { chainValidation: 'pass' })).rejects.toThrow(Arc.InvalidInputError);
  });

  test('refuses a 51st set', async () => {
    let message = baseMessage;
    let sets: Awaited<ReturnType<typeof sealReference>>['sets'] = [];
    for (let i = 1; i <= 50; i++) {
      const next = await sealReference(message, sets, {
        i,
        cv: i === 1 ? 'none' : 'pass',
        d: 'one.example',
        s: 's',
        keyName: 'k1',
      });
      message = next.message;
      sets = next.sets;
    }
    expect(await check(message)).toMatchObject({ result: 'pass', instance: 50 });
    await expect(seal(message, { chainValidation: 'pass' })).rejects.toThrow(
      'The message has 50 ARC sets, the most RFC 8617 allows.',
    );
  });

  const field = (name: string) => new RegExp(`^${name}.*\\r\\n(?:[ \\t].*\\r\\n)*`, 'm');
  const validChain = async (): Promise<string> => {
    const m1 = (await seal(baseMessage)) + baseMessage;
    return (await seal(m1, { chainValidation: 'pass' })) + m1;
  };
  const failures = [
    [
      'a missing ARC-Authentication-Results',
      (m) => m.replace(field('ARC-Authentication-Results: i=1;'), ''),
    ],
    ['a missing ARC-Seal of the newest set', (m) => m.replace(field('ARC-Seal: i=2;'), '')],
    ['a duplicate ARC field', (m) => m.match(field('ARC-Authentication-Results: i=1;'))![0] + m],
    ['a signature that does not verify', (m) => m.replace(/Hello world\r\n$/, 'changed\r\n')],
  ] satisfies [string, (message: string) => string][];
  for (const [title, change] of failures) {
    test(`seals a chain with ${title} with cv=fail as i=3`, async () => {
      const message = change(await validChain());
      const arc = await check(message);
      expect(arc.result).toBe('fail');
      const fields = await seal(message, { chainValidation: arc.result });
      expect(fields).toMatch(/^ARC-Seal: i=3;[^]*?cv=fail/);
      expect(fields).toMatch(/\r\nARC-Message-Signature: i=3;/);
      expect((await check(fields + message)).result).toBe('fail');
    });
  }
});

describe('the ARC-Message-Signature header list (RFC 8617 section 4.1.2)', () => {
  const message = baseMessage.replace(
    '\r\n\r\n',
    '\r\nDKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=x; h=from; bh=AAAA; b=AAAA\r\n\r\n',
  );
  const signed = (fields: string): string =>
    /h=([^;]*)/
      .exec(tagsOf(fields, 'ARC-Message-Signature'))![1]!
      .replace(/\s+/g, '')
      .toLowerCase();

  test('signs DKIM-Signature by default', async () => {
    expect(signed(await seal(message))).toBe('dkim-signature:message-id:date:subject:to:from');
  });

  test('takes the list as an array', async () => {
    expect(signed(await seal(message, { headers: ['from', 'subject'] }))).toBe('subject:from');
  });

  test('never signs ARC fields or Authentication-Results', async () => {
    const headers = [
      'from',
      'subject',
      'arc-seal',
      'authentication-results',
      'arc-authentication-results',
      'arc-message-signature',
    ];
    const withResults = `Authentication-Results: mx.example; spf=pass\r\n${message}`;
    expect(signed(await seal(withResults, { headers }))).toBe('subject:from');
  });

  test('requires From in the list and in the message', async () => {
    await expect(seal(message, { headers: ['subject'] })).rejects.toThrow(RangeError);
    await expect(seal('Subject: hi\r\n\r\nbody\r\n')).rejects.toThrow(Arc.InvalidInputError);
  });
});

describe('authResults', () => {
  const invalid = [
    ['a CRLF that starts a new header field', 'mx.example; spf=pass\r\nX-Injected: yes'],
    ['an empty line that ends the header block', 'mx.example; spf=pass\r\n\r\nInjected body'],
    ['a bare LF', 'mx.example; spf=pass\nX-Injected: yes'],
    ['a bare LF before whitespace', 'mx.example;\n spf=pass'],
    ['a bare CR', 'mx.example; spf=pass\rX-Injected: yes'],
    ['a trailing CRLF', 'mx.example; spf=pass\r\n'],
    ['a folded line with only whitespace', 'mx.example;\r\n \r\n spf=pass'],
    ['a missing value', undefined],
    ['an empty value', ''],
    ['a whitespace only value', ' \t '],
  ] satisfies [string, unknown][];
  for (const [title, value] of invalid) {
    test(`refuses ${title}`, async () => {
      await expect(seal(baseMessage, { authResults: value as string })).rejects.toThrow(
        value === undefined ? TypeError : RangeError,
      );
    });
  }

  test('accepts a value folded with CRLF and whitespace, and writes it as given', async () => {
    const authResults = 'mx.example;\r\n spf=pass smtp.mailfrom=example.com;\r\n\tdkim=none';
    const { fields, result } = await sealAndCheck(baseMessage, { authResults });
    expect(fields).toMatch(
      /\r\nARC-Authentication-Results: i=1; mx\.example;\r\n spf=pass smtp\.mailfrom=example\.com;\r\n\tdkim=none\r\n$/,
    );
    expect(result.sets[0]!.authResults).toBe(
      'mx.example; spf=pass smtp.mailfrom=example.com;\tdkim=none',
    );
  });

  test('checks a large value without running out of stack', async () => {
    const large = 'mx.example; dkim=pass ' + 'x'.repeat(10 * 1024 * 1024);
    for (const value of [large + '\nX-Injected: yes', large + '\r\n \r\n x', '\r' + large]) {
      await expect(seal(baseMessage, { authResults: value })).rejects.toThrow(RangeError);
    }
    expect(await seal(baseMessage, { authResults: large + '\r\n\tspf=none' })).toMatch(/^ARC-Seal/);
  });

  test('signs UTF-8 results as UTF-8 bytes', async () => {
    const authResults = 'mx.example; dmarc=pass header.from=bücher.example';
    const fields = await seal(baseMessage, { authResults });
    const result = await Arc.verify(encode(fields + baseMessage), {
      resolver: resolverFrom(records),
    });
    expect(result.sets[0]!.authResults).toBe(authResults);
  });
});

describe('options', () => {
  test('refuses a short RSA key, a bad domain or selector and a bad date', async () => {
    await expect(seal(baseMessage, { privateKey: (await keyPair('small')).pem })).rejects.toThrow(
      RangeError,
    );
    await expect(seal(baseMessage, { domain: 'one.example; x=y' })).rejects.toThrow(RangeError);
    await expect(seal(baseMessage, { selector: '-s' })).rejects.toThrow(RangeError);
    await expect(seal(baseMessage, { now: new Date(Number.NaN) })).rejects.toThrow(RangeError);
    await expect(seal(baseMessage, { privateKey: 'not a key' })).rejects.toThrow(RangeError);
  });

  test('writes a U-label domain as its A-label', async () => {
    const { fields, result } = await sealAndCheck(
      baseMessage,
      { domain: 'bücher.example' },
      { 's._domainkey.xn--bcher-kva.example': 'k1' },
    );
    expect(tagsOf(fields, 'ARC-Seal')).toContain('d=xn--bcher-kva.example;');
    expect(result.result).toBe('pass');
  });

  test('rejects with the reason of an aborted signal', async () => {
    const reason = new Error('stop');
    await expect(seal(baseMessage, { signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
  });

  test('the result verifies with a resolver for the published key', async () => {
    const fields = await seal(baseMessage);
    const resolver = resolverFrom(records);
    expect((await Arc.verify(fields + baseMessage, { resolver })).result).toBe('pass');
  });
});
