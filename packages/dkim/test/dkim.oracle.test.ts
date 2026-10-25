import { Buffer } from 'node:buffer';
import * as Dkim from '@portable/dkim';
import { dkimSign } from 'mailauth/lib/dkim/sign.js';
import { dkimVerify as mailauthVerify } from 'mailauth/lib/dkim/verify.js';
import DKIM from 'nodemailer/lib/dkim';
import { beforeAll, describe, expect, test } from 'vite-plus/test';
import {
  binary,
  ed25519Record,
  fixture,
  fromBinary,
  privatePem,
  prng,
  randomChunks,
  resolverFrom,
  rsaRecord,
  stream,
  tagsOf,
} from './utils.js';

let rsaPem: string;
let edPem: string;
let resolver: Dkim.Resolver;

beforeAll(async () => {
  rsaPem = await privatePem('rsa');
  edPem = await privatePem('ed25519');
  resolver = resolverFrom({
    'rsa._domainkey.example.com': [await rsaRecord()],
    'ed._domainkey.example.com': [await ed25519Record()],
  });
});

const mailauthResolver = (name: string) => resolver.resolveTxt(name);

/** mailauth's strict-mode result codes, one per signature. */
async function upstreamResults(message: Uint8Array): Promise<string[]> {
  const { results } = await mailauthVerify(Buffer.from(message), {
    resolver: mailauthResolver,
    strict: true,
  });
  return results.map((r) => r.status?.result ?? 'none').filter((r) => r !== 'none');
}

async function ourResults(message: Uint8Array, seed: number): Promise<string[]> {
  const results = await Dkim.verify(stream(randomChunks(message, seed, 256)), { resolver });
  return results.map((r) => r.result);
}

const concat = (...parts: (string | Uint8Array)[]): Uint8Array =>
  new Uint8Array(
    parts.flatMap((part) => [...(typeof part === 'string' ? fromBinary(part) : part)]),
  );

/** Messages built from random header and body pieces, as binary text. */
function generated(seed: number): string {
  const random = prng(seed);
  const pick = <value>(items: readonly value[]): value =>
    items[Math.floor(random() * items.length)]!;
  const values = [
    'a',
    'b c',
    ' x\t y ',
    'j\xf5geva',
    '\xe6\x97\xa5\xe6\x9c\xac',
    '',
    '  ',
    'a;b=c',
    '"q"',
  ];
  const names = ['Subject', 'To', 'Cc', 'X-Custom', 'subject', 'Reply-To', 'Message-ID', 'Date'];
  const lines = ['line', 'two  words', ' lead', 'trail \t', '', '\t', 'a\rb', '.', '-- '];
  let header = `From: ${pick(['a@example.com', 'Joe <joe@example.com>', '"x" <x@example.com>'])}\r\n`;
  for (let i = Math.floor(random() * 6); i > 0; i--) {
    let value = pick(values);
    if (random() < 0.3) {
      value += `\r\n${pick([' ', '\t', '  '])}${pick(values)}`;
    }
    header += `${pick(names)}${pick([':', ': ', ' :', '\t: '])}${value}\r\n`;
  }
  let body = '';
  for (let i = Math.floor(random() * 8); i > 0; i--) {
    body += pick(lines) + pick(['\r\n', '\r\n', '\n']);
  }
  if (random() < 0.3) {
    body += pick(lines);
  }
  if (random() < 0.2) {
    body += '\r\n\r\n\r\n';
  }
  return `${header}\r\n${body}`;
}

const corpus = async (): Promise<[string, Uint8Array][]> => [
  ['mailauth message1.eml', await fixture('message1.eml')],
  ['nodemailer message1.eml', await fixture('nodemailer-message1.eml')],
  ['LF line endings', fromBinary('From: a@example.com\nSubject: x\n\nline 1\nline 2\n')],
  ['no body', fromBinary('From: a@example.com\r\nSubject: x')],
  ...Array.from({ length: 60 }, (_, i): [string, Uint8Array] => [
    `generated ${i}`,
    fromBinary(generated(i + 1)),
  ]),
];

describe('signatures made here verify in mailauth strict mode', () => {
  for (const canonicalization of [
    'relaxed/relaxed',
    'simple/simple',
    'relaxed/simple',
    'simple/relaxed',
  ] as const) {
    test(`${canonicalization}`, async () => {
      for (const [name, message] of await corpus()) {
        for (const [selector, privateKey] of [
          ['rsa', rsaPem],
          ['ed', edPem],
        ] as const) {
          const field = await Dkim.sign(stream(randomChunks(message, name.length, 64)), {
            domain: 'example.com',
            selector,
            privateKey,
            canonicalization,
          });
          expect({ name, results: await upstreamResults(concat(field, message)) }).toEqual({
            name,
            results: ['pass'],
          });
        }
      }
    });
  }
});

describe('signatures made by mailauth verify here', () => {
  for (const canonicalization of ['relaxed/relaxed', 'simple/simple'] as const) {
    test(`${canonicalization}, with the same h= and bh= as ours`, async () => {
      for (const [name, message] of await corpus()) {
        const { signatures } = await dkimSign(Buffer.from(message), {
          canonicalization,
          strict: true,
          signatureData: [
            { signingDomain: 'example.com', selector: 'rsa', privateKey: rsaPem },
            {
              signingDomain: 'example.com',
              selector: 'ed',
              privateKey: edPem,
              algorithm: 'ed25519-sha256',
            },
          ],
        });
        const signed = concat(signatures, message);
        expect({ name, results: await ourResults(signed, name.length) }).toEqual({
          name,
          results: ['pass', 'pass'],
        });

        const ours = tagsOf(
          await Dkim.sign(message, {
            domain: 'example.com',
            selector: 'rsa',
            privateKey: rsaPem,
            canonicalization,
          }),
        );
        const upstream = tagsOf(signatures.slice(0, signatures.indexOf('\r\nDKIM-Signature:')));
        expect({ name, h: ours.h, bh: ours.bh }).toEqual({ name, h: upstream.h, bh: upstream.bh });
      }
    });
  }
});

describe('signatures made by nodemailer verify here', () => {
  test('with the same bh= as ours', async () => {
    for (const [name, message] of await corpus()) {
      const signed = await new Promise<Uint8Array>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const output = new DKIM({
          domainName: 'example.com',
          keySelector: 'rsa',
          privateKey: rsaPem,
        }).sign(Buffer.from(message));
        output.on('data', (chunk: Buffer) => chunks.push(chunk));
        output.on('error', reject);
        output.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
      });
      expect({ name, results: await ourResults(signed, name.length) }).toEqual({
        name,
        results: ['pass'],
      });
      const text = binary(signed);
      const upstream = tagsOf(text.slice(0, text.search(/\r\n(?![ \t])/)));
      const ours = tagsOf(
        await Dkim.sign(message, { domain: 'example.com', selector: 'rsa', privateKey: rsaPem }),
      );
      expect({ name, bh: ours.bh }).toEqual({ name, bh: upstream.bh });
    }
  });
});

describe('agrees with mailauth strict mode on changed messages', () => {
  // Each change is applied to a message signed by mailauth. Where the two verifiers disagree on
  // pass or fail, one of them is wrong.
  const changes = [
    ['add a space to a header value', (t) => t.replace('\r\nFrom: ', '\r\nFrom:  ')],
    ['fold a header', (t) => t.replace(/\r\nSubject: ?/i, '\r\nSubject:\r\n ')],
    ['upper-case a header name', (t) => t.replace('\r\nFrom:', '\r\nFROM:')],
    ['add a header field', (t) => t.replace('\r\nFrom:', '\r\nX-New: 1\r\nFrom:')],
    ['add a second From', (t) => t.replace('\r\nFrom:', '\r\nFrom: evil@attacker.test\r\nFrom:')],
    ['add an empty line at the end', (t) => t + '\r\n'],
    ['add text at the end', (t) => t + 'more\r\n'],
    ['add trailing whitespace to the body', (t) => t.replace(/\r\n$/, ' \t\r\n')],
    ['turn CRLF into LF', (t) => t.replaceAll('\r\n', '\n')],
    [
      'change one body byte',
      (t, random) => {
        const start = t.indexOf('\r\n\r\n') + 4;
        if (start < 4 || start >= t.length) {
          return t;
        }
        const at = start + Math.floor(random() * (t.length - start));
        return t.slice(0, at) + (t[at] === 'x' ? 'y' : 'x') + t.slice(at + 1);
      },
    ],
    [
      'insert a space in a body line',
      (t, random) => {
        const start = t.indexOf('\r\n\r\n') + 4;
        if (start < 4 || start >= t.length) {
          return t;
        }
        const at = start + Math.floor(random() * (t.length - start));
        return t.slice(0, at) + ' ' + t.slice(at);
      },
    ],
    [
      'smuggle a line after From',
      (t) => t.replace(/\r\nFrom:([^\r]*)\r\n/, '\r\nFrom:$1\r\n\xc2\xa0, evil@attacker.test\r\n'),
    ],
  ] satisfies [string, (text: string, random: () => number) => string][];

  for (const [title, change] of changes) {
    test(`${title}`, async () => {
      const random = prng(title.length);
      for (const [name, message] of await corpus()) {
        for (const canonicalization of ['relaxed/relaxed', 'simple/simple']) {
          const { signatures } = await dkimSign(Buffer.from(message), {
            canonicalization,
            strict: true,
            signatureData: [{ signingDomain: 'example.com', selector: 'rsa', privateKey: rsaPem }],
          });
          const changed = fromBinary(change(signatures + binary(message), random));
          const upstream = await upstreamResults(changed);
          const ours = await ourResults(changed, name.length);
          expect({ name, canonicalization, ours: ours.map(passed) }).toEqual({
            name,
            canonicalization,
            ours: upstream.map(passed),
          });
        }
      }
    });
  }
});

const passed = (result: string) => result === 'pass';
