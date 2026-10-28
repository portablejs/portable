import * as internal from './internal.js';

const poolSize = 4096;
let pool = new Uint32Array(0);
let poolBytes = new Uint8Array(0);
let index = 0;

function refill(): void {
  if (pool.length === 0) {
    pool = new Uint32Array(poolSize);
    poolBytes = new Uint8Array(pool.buffer);
  }
  crypto.getRandomValues(pool);
  index = poolSize;
}

function next(): number {
  if (index === 0) {
    refill();
  }
  return pool[--index]!;
}

function fill(bytes: Uint8Array<ArrayBuffer>): void {
  const length = bytes.length;
  if (length <= 256) {
    const words = (length + 3) >>> 2;
    if (index < words) {
      refill();
    }
    index -= words;
    bytes.set(poolBytes.subarray(index * 4, index * 4 + length));
    return;
  }
  for (let offset = 0; offset < length; offset += 65536) {
    crypto.getRandomValues(bytes.subarray(offset, offset + 65536));
  }
}

const maxTextSize = 32768;
let textAlphabet = '';
let text = '';
let textOffset = 0;
let textNext = 0;

/**
 * Returns a random integer from `min` to `max`, both included. `min` and `max` must be safe integers,
 * and the range can include up to 2^53 integers, such as `0` to `Number.MAX_SAFE_INTEGER`.
 *
 * Every integer in the range is equally likely. When a random value is at or above the largest
 * multiple of the range size, `int` draws a new one instead of reducing it with a modulo.
 *
 * @example
 * ```ts
 * import * as Random from '@portable/random';
 *
 * const die = Random.int(1, 6);
 * ```
 */
export function int(min: number, max: number): number {
  return internal.int(next, min, max);
}

/**
 * Returns a random number from 0 up to but not including 1, made from 53 random bits, so every
 * multiple of 2^-53 in that range is equally likely.
 *
 * @example
 * ```ts
 * import * as Random from '@portable/random';
 *
 * if (Random.float() < 0.1) {
 *   console.log('sampled');
 * }
 * ```
 */
export function float(): number {
  return internal.float(next);
}

export declare namespace string {
  type Options = {
    /**
     * The characters to pick from, split into code points.
     * @default the 64 URL-safe characters `A-Z`, `a-z`, `0-9`, `-`, and `_`
     */
    alphabet?: string | undefined;
  };
}

/**
 * Returns a random string of `length` characters, each picked with equal chance from `alphabet`.
 * The default alphabet is the 64 URL-safe characters `A-Z`, `a-z`, `0-9`, `-`, and `_`, so 21
 * characters have 126 random bits, as in a nanoid.
 *
 * `alphabet` is split into code points, so a single-code-point emoji counts as one character. An
 * emoji made of several code points, such as a flag or a skin-tone variant, is split into those
 * code points. A character listed twice is picked twice as often.
 *
 * @example
 * ```ts
 * import * as Random from '@portable/random';
 *
 * const id = Random.string(21);
 * const pin = Random.string(6, { alphabet: '0123456789' });
 * ```
 */
export function string(length: number, options: string.Options = {}): string {
  const { alphabet = internal.urlAlphabet } = options;
  internal.assertLength(length);
  const parsed = internal.alphabet(alphabet);
  if (parsed.table === undefined) {
    return internal.string(next, fill, length, parsed);
  }
  if (alphabet !== textAlphabet) {
    textAlphabet = alphabet;
    text = '';
    textOffset = 0;
    textNext = 0;
  }
  if (textOffset + length > text.length) {
    const size = Math.max(textNext, length);
    textNext = Math.min(size * 16, maxTextSize);
    text = internal.string(next, fill, size, parsed);
    textOffset = 0;
  }
  textOffset += length;
  return text.slice(textOffset - length, textOffset);
}

/**
 * Returns a shuffled copy of `array`, made with a Fisher-Yates shuffle, so every order is equally
 * likely. `array` is not changed.
 *
 * @example
 * ```ts
 * import * as Random from '@portable/random';
 *
 * const deck = Random.shuffle(['A', 'K', 'Q', 'J']);
 * ```
 */
export function shuffle<value>(array: readonly value[]): value[] {
  return internal.shuffle(next, array);
}

/**
 * Returns a random element of `array`. Throws a `RangeError` if `array` is empty.
 *
 * @example
 * ```ts
 * import * as Random from '@portable/random';
 *
 * const color = Random.pick(['red', 'green', 'blue']);
 * ```
 */
export function pick<value>(array: readonly value[]): value {
  return internal.pick(next, array);
}

/**
 * Returns `length` random bytes. Unlike `crypto.getRandomValues`, it allocates the array and has
 * no 65,536-byte limit.
 *
 * @example
 * ```ts
 * import * as Random from '@portable/random';
 *
 * const key = Random.bytes(32);
 * ```
 */
export function bytes(length: number): Uint8Array<ArrayBuffer> {
  internal.assertLength(length);
  const result = new Uint8Array(length);
  fill(result);
  return result;
}
