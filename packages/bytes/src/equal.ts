import { assertUint8Array } from './internal/uint8Array.js';

/**
 * Whether two byte arrays hold the same bytes. Returns at the first difference, so the time it
 * takes shows where the arrays differ. Compare secrets with `timingSafeEqual` instead.
 *
 * @example
 * ```ts
 * import * as Bytes from '@portable/bytes';
 *
 * Bytes.equal(new Uint8Array([1, 2]), new Uint8Array([1, 2])); // true
 * ```
 */
export function equal(a: Uint8Array, b: Uint8Array): boolean {
  assertUint8Array(a);
  assertUint8Array(b);
  if (a === b) {
    return true;
  }
  const length = a.length;
  if (length !== b.length) {
    return false;
  }
  let i = 0;
  const words = wordViews(a, b);
  if (words) {
    const [a32, b32] = words;
    for (let j = 0; j < a32.length; j++) {
      if (a32[j] !== b32[j]) {
        return false;
      }
    }
    i = a32.length * 4;
  }
  for (; i < length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Whether two byte arrays hold the same bytes, in time that depends only on their length. Use it
 * to compare a secret, such as a signature or a token, with a value an attacker sent.
 *
 * Arrays of different lengths return `false` at once, so the length itself isn't secret. That
 * holds for a signature or a hash, whose length is fixed by the algorithm.
 *
 * @example
 * ```ts
 * import * as Bytes from '@portable/bytes';
 *
 * const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, body));
 * if (!Bytes.timingSafeEqual(expected, Bytes.fromHex(signature))) {
 *   throw new Error('Bad signature');
 * }
 * ```
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  assertUint8Array(a);
  assertUint8Array(b);
  const length = a.length;
  if (length !== b.length) {
    return false;
  }
  let diff = 0;
  let i = 0;
  const words = wordViews(a, b);
  if (words) {
    const [a32, b32] = words;
    for (let j = 0; j < a32.length; j++) {
      diff |= a32[j]! ^ b32[j]!;
    }
    i = a32.length * 4;
  }
  for (; i < length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

// Comparing four bytes at a time is about 4× faster, but only aligned memory can be viewed as
// Uint32Array, and creating the views costs more than it saves on short input.
function wordViews(a: Uint8Array, b: Uint8Array): [Uint32Array, Uint32Array] | undefined {
  if (a.length < 64 || a.byteOffset % 4 !== 0 || b.byteOffset % 4 !== 0) {
    return undefined;
  }
  const words = a.length >>> 2;
  return [
    new Uint32Array(a.buffer, a.byteOffset, words),
    new Uint32Array(b.buffer, b.byteOffset, words),
  ];
}
