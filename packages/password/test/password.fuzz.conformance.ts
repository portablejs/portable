import { fc, fuzz, mutated, outcome, outcomeAsync } from '@portable/fuzz';
import * as Password from '@portable/password';
import { expect, test } from 'vite-plus/test';

const errors = [Password.InvalidInputError, Password.UnsupportedError];
/**
 * Removes trailing zero bytes from the password. HMAC pads a short key with zero bytes, so every
 * PBKDF2 implementation treats `'a'` and `'a\0'` as the same password.
 */
function hmacKey(password: string | Uint8Array): string {
  const bytes =
    typeof password === 'string' ? new TextEncoder().encode(password.normalize('NFC')) : password;
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) {
    end--;
  }
  return bytes.subarray(0, end).join(',');
}

const password = fc.oneof(fc.string({ maxLength: 20 }), fc.uint8Array({ maxLength: 20 }));

test('verifies a password against its own hash and rejects any other', async () => {
  await fuzz(
    fc.asyncProperty(
      password,
      password,
      fc.integer({ min: 1, max: 3 }),
      async (a, b, iterations) => {
        const stored = await Password.hash(a, { iterations });
        expect(await Password.verify(a, stored)).toBe(true);
        expect(await Password.verify(b, stored)).toBe(hmacKey(a) === hmacKey(b));
        expect(Password.needsRehash(stored, { iterations })).toBe(false);
      },
    ),
    { scale: 0.3 },
  );
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const stored = encoder.encode(
  '$pbkdf2-sha256$i=2$c2FsdHNhbHRzYWx0$QmFzZTY0SGFzaEJhc2U2NEhhc2hCYXNlNjRIYXNoMDA',
);

test('a changed hash verifies to a boolean or throws a documented error', async () => {
  await fuzz(
    fc.asyncProperty(
      mutated(stored)
        .map((bytes) => decoder.decode(bytes))
        // `verify` runs as many iterations as the stored hash says, and a mutated hash can say
        // billions, so this drops counts of four or more digits to keep each run fast.
        .filter((text) => !/(?:i=|\$)\d{4}/.test(text)),
      async (text) => {
        const verified = await outcomeAsync(errors, () => Password.verify('password', text));
        const rehash = outcome(errors, () => Password.needsRehash(text));
        for (const result of [verified, rehash]) {
          expect('value' in result ? typeof result.value : 'error').toMatch(/^(?:boolean|error)$/);
        }
      },
    ),
  );
});
