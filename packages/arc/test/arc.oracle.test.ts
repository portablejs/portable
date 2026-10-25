import { Buffer } from 'node:buffer';
import * as Arc from '@portable/arc';
import { authenticate, sealMessage } from 'mailauth';
import { describe, expect, test } from 'vite-plus/test';
import validationSuite from './fixtures/arc-draft-validation-tests.json' with { type: 'json' };
import {
  baseMessage,
  binary,
  encode,
  fromBinary,
  keyPair,
  prng,
  randomChunks,
  resolverFrom,
  sealReference,
  stream,
} from './utils.js';

type Records = Record<string, string>;

/** mailauth's resolver shape: one function of the name and type. */
const mailauthResolver = (records: Records) => {
  const resolver = resolverFrom(records);
  return async (name: string, type: string) => {
    if (type !== 'TXT') {
      throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    }
    return resolver.resolveTxt(name);
  };
};

/** mailauth's strict-mode ARC result. */
async function upstream(message: Uint8Array, records: Records): Promise<string> {
  const result = await authenticate(Buffer.from(message), {
    resolver: mailauthResolver(records),
    strict: true,
    disableDmarc: true,
    disableBimi: true,
    ip: '192.0.2.1',
    helo: 'mx.example',
    sender: 'alice@example.com',
    mta: 'mx.test',
  });
  return (result.arc as { status: { result: string } }).status.result;
}

async function ours(message: Uint8Array, records: Records, seed: number): Promise<string> {
  const result = await Arc.verify(stream(randomChunks(message, seed, 256)), {
    resolver: resolverFrom(records),
  });
  return result.result;
}

const records = {
  's._domainkey.one.example': 'k1',
  's._domainkey.two.example': 'k2',
  'ed._domainkey.one.example': 'ed1',
} satisfies Records;

/** Messages built from random header and body pieces. */
function generated(seed: number): string {
  const random = prng(seed);
  const pick = <value>(items: readonly value[]): value =>
    items[Math.floor(random() * items.length)]!;
  const values = ['a', 'b c', ' x\t y ', 'folded\r\n continued', 'ünïcode', 'end '];
  const fields = [
    `From: ${pick(['Alice <alice@example.com>', 'bob@example.net', '"A, B" <ab@example.org>'])}`,
    `To: ${pick(values)}`,
    `Subject: ${pick(values)}`,
    `Date: Thu, 1 Jan 2024 00:00:0${Math.floor(random() * 10)} +0000`,
  ];
  if (random() < 0.5) {
    fields.push(`DKIM-Signature: v=1; d=example.com; b=${pick(values)}`);
  }
  if (random() < 0.5) {
    fields.push(`Received: from ${pick(values)}`);
  }
  const lines: string[] = [];
  const count = Math.floor(random() * 12);
  for (let i = 0; i < count; i++) {
    lines.push(pick(['', ' ', 'text', 'two  spaces', 'tab\t', '.']));
  }
  return binary(
    encode(`${fields.join('\r\n')}\r\n\r\n${lines.join('\r\n')}${pick(['', '\r\n', '\r\n\r\n'])}`),
  );
}

const changes = [
  ['nothing', (m) => m],
  ['a body line added', (m) => `${m}added\r\n`],
  ['trailing empty lines added', (m) => `${m}\r\n\r\n`],
  ['From changed', (m) => m.replace(/^From: .*$/m, 'From: mallory@evil.example')],
  ['a header folded', (m) => m.replace(/^Subject: /m, 'Subject:\r\n ')],
  ['a field added above', (m) => `X-Added: yes\r\n${m}`],
  [
    'the newest AAR changed',
    (m) => m.replace(/^(ARC-Authentication-Results: i=2; [^;]*;)/m, '$1 x=y;'),
  ],
  [
    'the oldest AAR changed',
    (m) => m.replace(/^(ARC-Authentication-Results: i=1; [^;]*;)/m, '$1 x=y;'),
  ],
  ['the newest cv changed', (m) => m.replace(/(ARC-Seal: i=2;[^]*?)cv=pass/, '$1cv=fail')],
  ['the oldest seal removed', (m) => m.replace(/^ARC-Seal: i=1;.*\r\n(?:[ \t].*\r\n)*/m, '')],
  [
    'the sets swapped',
    (m) => m.replaceAll('i=1;', 'i=9;').replaceAll('i=2;', 'i=1;').replaceAll('i=9;', 'i=2;'),
  ],
] satisfies [string, (message: string) => string][];

describe('mailauth agrees with verify', () => {
  test('on every message of the ValiMail suite', async () => {
    let compared = 0;
    for (const file of validationSuite) {
      const suiteRecords = file['txt-records'] as Records;
      const resolver = {
        async resolveTxt(name) {
          const record = suiteRecords[name.toLowerCase()];
          if (record === undefined) {
            throw Object.assign(new Error(name), { code: 'ENOTFOUND' });
          }
          return [[record]];
        },
      } satisfies Arc.Resolver;
      const upstreamResolver = async (name: string) => resolver.resolveTxt(name);
      for (const [name, data] of Object.entries(
        file.tests as Record<string, { message?: string | undefined }>,
      )) {
        const message = encode((data.message ?? '').replace(/\r?\n/g, '\r\n'));
        const theirs = await authenticate(Buffer.from(message), {
          resolver: upstreamResolver,
          strict: true,
          disableDmarc: true,
          disableBimi: true,
        });
        const mine = await Arc.verify(message, { resolver });
        expect(mine.result, `${name}`).toBe(
          (theirs.arc as { status: { result: string } }).status.result,
        );
        compared++;
      }
    }
    expect(compared).toBe(171);
  });

  test('on two-set chains, after each of 11 changes', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const message = generated(seed);
      const first = await Arc.seal(fromBinary(message), {
        domain: 'one.example',
        selector: 's',
        privateKey: (await keyPair('k1')).pem,
        authResults: 'mx.one.example; spf=pass smtp.mailfrom=example.com',
      });
      const once = binary(encode(first)) + message;
      const second = await Arc.seal(fromBinary(once), {
        domain: 'two.example',
        selector: 's',
        privateKey: (await keyPair('k2')).pem,
        authResults: 'mx.two.example; arc=pass',
        chainValidation: 'pass',
      });
      const twice = binary(encode(second)) + once;
      expect(await upstream(fromBinary(twice), records)).toBe('pass');
      for (const [title, change] of changes) {
        const changed = fromBinary(change(twice));
        expect(await ours(changed, records, seed), `${seed}: ${title}`).toBe(
          await upstream(changed, records),
        );
      }
    }
  });
});

describe('mailauth and seal interoperate', () => {
  test("mailauth's strict mode passes sets made by seal, with RSA and Ed25519 keys", async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const message = generated(seed);
      const ed = seed % 2 === 0;
      const fields = await Arc.seal(fromBinary(message), {
        domain: 'one.example',
        selector: ed ? 'ed' : 's',
        privateKey: (await keyPair(ed ? 'ed1' : 'k1')).pem,
        authResults: 'mx.one.example; spf=pass smtp.mailfrom=example.com',
      });
      expect(await upstream(fromBinary(binary(encode(fields)) + message), records), `${seed}`).toBe(
        'pass',
      );
    }
  });

  test("verify passes sets made by mailauth's sealMessage, and the chains extend each other", async () => {
    for (let seed = 1; seed <= 10; seed++) {
      let message = fromBinary(generated(seed));
      for (let hop = 1; hop <= 4; hop++) {
        const arc = await Arc.verify(message, { resolver: resolverFrom(records) });
        expect(arc.result, `${seed} hop ${hop}`).toBe(hop === 1 ? 'none' : 'pass');
        const authResults = `mx${hop}.example; arc=${arc.result}`;
        const fields =
          hop % 2 === 1
            ? new Uint8Array(
                await sealMessage(Buffer.from(message), {
                  signingDomain: 'one.example',
                  selector: 's',
                  privateKey: (await keyPair('k1')).pem,
                  authResults,
                  cv: arc.result,
                }),
              )
            : encode(
                await Arc.seal(message, {
                  domain: 'two.example',
                  selector: 's',
                  privateKey: (await keyPair('k2')).pem,
                  authResults,
                  chainValidation: arc.result,
                }),
              );
        message = new Uint8Array([...fields, ...message]);
      }
      expect(await ours(message, records, seed)).toBe('pass');
      expect(await upstream(message, records)).toBe('pass');
    }
  });

  test("mailauth's strict mode and verify agree on chains from the reference sealer", async () => {
    const a = await sealReference(baseMessage, [], {
      i: 1,
      cv: 'none',
      d: 'one.example',
      s: 's',
      keyName: 'k1',
    });
    const b = await sealReference(a.message, a.sets, {
      i: 2,
      cv: 'pass',
      d: 'two.example',
      s: 's',
      keyName: 'k2',
    });
    expect(await upstream(fromBinary(b.message), records)).toBe('pass');
    for (const [title, change] of changes) {
      const changed = fromBinary(change(b.message));
      expect(await ours(changed, records, 1), `${title}`).toBe(await upstream(changed, records));
    }
  });
});
