import { pbkdf2 as nodePbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import pbkdf2 from 'pbkdf2';
import createHasher from 'pbkdf2-password';
import { expect, test } from 'vite-plus/test';
import * as Password from '@portable/password';

const pbkdf2Async = promisify(nodePbkdf2);
const password = 'correct horse battery staple';
const iterations = 600_000;
const run = { time: 0, iterations: 10, warmupIterations: 1 };
const hasher = createHasher({ iterations, digest: 'sha256', keyLength: 32, saltLength: 16 });

test('hashes a password at 600,000 iterations within 25% of node:crypto pbkdf2', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/password', async () => {
      await Password.hash(password);
    }),
    bench('node:crypto pbkdf2', async () => {
      await pbkdf2Async(password, randomBytes(16), iterations, 32, 'sha256');
    }),
    bench('pbkdf2', async () => {
      await new Promise((resolve, reject) =>
        pbkdf2.pbkdf2(password, randomBytes(16), iterations, 32, 'sha256', (error, key) =>
          error ? reject(error) : resolve(key),
        ),
      );
    }),
    bench('pbkdf2-password', async () => {
      await new Promise((resolve, reject) =>
        hasher({ password }, (error, _password, _salt, hash) =>
          error ? reject(error) : resolve(hash),
        ),
      );
    }),
    bench('crypto.subtle.deriveBits', async () => {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits'],
      );
      const salt = crypto.getRandomValues(new Uint8Array(16));
      await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        key,
        256,
      );
    }),
    run,
  );
  expect(result.get('node:crypto pbkdf2')).not.toBeFasterThan(result.get('@portable/password'), {
    delta: 0.25,
  });
});

test('checks whether a stored hash needs a rehash', async ({ bench }) => {
  const current = await Password.hash(password, { iterations: 1 });
  const passlib =
    '$pbkdf2-sha256$29000$4vjV83LKPjQzk31VI4E0Vw$hsYF68OiOUPdDZ1Fg.fJPeq1h/gXXY7acBp9/6c.tmQ';
  expect(Password.needsRehash(current, { iterations: 1 })).toBe(false);
  expect(Password.needsRehash(passlib)).toBe(true);
  await bench.compare(
    bench('@portable/password, PHC', () => {
      Password.needsRehash(current, { iterations: 1 });
    }),
    bench('@portable/password, passlib', () => {
      Password.needsRehash(passlib);
    }),
  );
});

test('verifies a password at 600,000 iterations within 25% of node:crypto pbkdf2', async ({
  bench,
}) => {
  const stored = await Password.hash(password);
  const salt = randomBytes(16);
  const expected = await pbkdf2Async(password, salt, iterations, 32, 'sha256');
  const result = await bench.compare(
    bench('@portable/password', async () => {
      await Password.verify(password, stored);
    }),
    bench('node:crypto pbkdf2 and timingSafeEqual', async () => {
      timingSafeEqual(await pbkdf2Async(password, salt, iterations, 32, 'sha256'), expected);
    }),
    run,
  );
  expect(result.get('node:crypto pbkdf2 and timingSafeEqual')).not.toBeFasterThan(
    result.get('@portable/password'),
    { delta: 0.25 },
  );
});
