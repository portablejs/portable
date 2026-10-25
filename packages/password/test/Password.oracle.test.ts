import { pbkdf2Sync } from 'node:crypto';
import pbkdf2 from 'pbkdf2';
import createHasher from 'pbkdf2-password';
import { describe, expect, test } from 'vite-plus/test';
import * as Password from '@portable/password';
import { type Digest, parsePhc, phc, seededRandom, tamper } from './utils.js';

function randomPassword(random: () => number): string {
  const length = Math.floor(random() * 80);
  let text = '';
  for (let i = 0; i < length; i++) {
    const kind = random();
    const max = kind < 0.6 ? 0x80 : kind < 0.9 ? 0x800 : kind < 0.97 ? 0x10000 : 0x110000;
    text += String.fromCodePoint(Math.floor(random() * max));
  }
  return text;
}

describe('hash matches node:crypto pbkdf2Sync', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    test(`random passwords, seed ${seed}`, async () => {
      const random = seededRandom(seed);
      for (let i = 0; i < 20; i++) {
        const password = randomPassword(random);
        const iterations = 1 + Math.floor(random() * 2000);
        const stored = await Password.hash(password, { iterations });
        const { salt, hash } = parsePhc(stored);
        const expected = pbkdf2Sync(password.normalize('NFC'), salt, iterations, 32, 'sha256');
        expect(hash).toEqual(new Uint8Array(expected));
      }
    });
  }

  test('passwords around the HMAC block size, as bytes', async () => {
    for (const length of [0, 1, 63, 64, 65, 127, 128, 129, 1000, 4096]) {
      const password = new Uint8Array(length).fill(length % 256);
      const { salt, hash } = parsePhc(await Password.hash(password, { iterations: 3 }));
      expect(hash).toEqual(new Uint8Array(pbkdf2Sync(password, salt, 3, 32, 'sha256')));
    }
  });
});

describe('verify accepts what node:crypto and pbkdf2 compute', () => {
  const digests = ['sha1', 'sha256', 'sha512'] satisfies Digest[];
  for (const seed of [1, 2, 3]) {
    test(`random salts, lengths and digests, seed ${seed}`, async () => {
      const random = seededRandom(seed);
      for (let i = 0; i < 30; i++) {
        const password = randomPassword(random);
        const salt = crypto.getRandomValues(new Uint8Array(Math.floor(random() * 40)));
        const iterations = 1 + Math.floor(random() * 500);
        const length = 1 + Math.floor(random() * 100);
        const digest = digests[i % 3]!;
        const node = pbkdf2Sync(password.normalize('NFC'), salt, iterations, length, digest);
        const js = pbkdf2.pbkdf2Sync(password.normalize('NFC'), salt, iterations, length, digest);
        expect(new Uint8Array(js)).toEqual(new Uint8Array(node));
        const stored = phc(digest, iterations, salt, new Uint8Array(node));
        expect(await Password.verify(password, stored)).toBe(true);
        expect(await Password.verify(password, tamper(stored))).toBe(false);
      }
    });
  }
});

test('verify accepts a pbkdf2-password hash', async () => {
  const hasher = createHasher();
  const { salt, hash } = await new Promise<{ salt: string; hash: string }>((resolve, reject) =>
    hasher({ password: 'correct horse' }, (error, _password, salt, hash) =>
      error ? reject(error) : resolve({ salt, hash }),
    ),
  );
  const stored = `$pbkdf2$i=10000$${salt.replace(/=+$/, '')}$${hash.replace(/=+$/, '')}`;
  expect(await Password.verify('correct horse', stored)).toBe(true);
  expect(await Password.verify('correct horse ', stored)).toBe(false);
});
