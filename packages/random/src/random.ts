import * as internal from './internal.js'

const poolSize = 4096
let pool = new Uint32Array(0)
let index = 0

function next(): number {
  if (index === 0) {
    if (pool.length === 0) pool = new Uint32Array(poolSize)
    crypto.getRandomValues(pool)
    index = poolSize
  }
  return pool[--index]!
}

/**
 * Returns a random integer from `min` to `max`, both included. `min` and `max` must be safe integers,
 * and the range can hold up to 2^53 integers, such as `0` to `Number.MAX_SAFE_INTEGER`.
 *
 * Every integer in the range is equally likely: values that would favor part of the range are
 * rejected and drawn again, instead of being reduced with a modulo.
 *
 * @example
 * ```ts
 * import * as Random from '@portable/random'
 *
 * const die = Random.int(1, 6)
 * ```
 */
export function int(min: number, max: number): number {
  return internal.int(next, min, max)
}

/**
 * Returns a random number from 0 up to but not including 1, made from 53 random bits, so every
 * multiple of 2^-53 in that range is equally likely.
 *
 * @example
 * ```ts
 * import * as Random from '@portable/random'
 *
 * if (Random.float() < 0.1) console.log('sampled')
 * ```
 */
export function float(): number {
  return internal.float(next)
}

/**
 * Returns a random string of `length` characters, each picked with equal chance from `alphabet`.
 * The default alphabet is the 64 URL-safe characters `A-Z`, `a-z`, `0-9`, `-` and `_`, so 21
 * characters hold 126 random bits, as in a nanoid.
 *
 * `alphabet` is split into code points, so it can hold emoji. A character listed twice is picked
 * twice as often.
 *
 * @example
 * ```ts
 * import * as Random from '@portable/random'
 *
 * const id = Random.string(21)
 * const pin = Random.string(6, '0123456789')
 * ```
 */
export function string(length: number, alphabet: string = internal.urlAlphabet): string {
  return internal.string(next, length, alphabet)
}

/**
 * Returns a shuffled copy of `array`, made with a Fisher-Yates shuffle, so every order is equally
 * likely. `array` is not changed.
 *
 * @example
 * ```ts
 * import * as Random from '@portable/random'
 *
 * const deck = Random.shuffle(['A', 'K', 'Q', 'J'])
 * ```
 */
export function shuffle<T>(array: readonly T[]): T[] {
  return internal.shuffle(next, array)
}

/**
 * Returns a random element of `array`. Throws a `RangeError` if `array` is empty.
 *
 * @example
 * ```ts
 * import * as Random from '@portable/random'
 *
 * const color = Random.pick(['red', 'green', 'blue'])
 * ```
 */
export function pick<T>(array: readonly T[]): T {
  return internal.pick(next, array)
}

/**
 * Returns `length` random bytes. Unlike `crypto.getRandomValues`, it allocates the array and has
 * no 65,536-byte limit.
 *
 * @example
 * ```ts
 * import * as Random from '@portable/random'
 *
 * const key = Random.bytes(32)
 * ```
 */
export function bytes(length: number): Uint8Array<ArrayBuffer> {
  internal.checkLength(length)
  const result = new Uint8Array(length)
  for (let offset = 0; offset < length; offset += 65536)
    crypto.getRandomValues(result.subarray(offset, offset + 65536))
  return result
}
