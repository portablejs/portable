import * as internal from './internal.js'

/** The functions of `@portable/random`, drawing from a seeded generator instead of `crypto.getRandomValues`. */
export type Seeded = {
  /** Same as `Random.int`. */
  readonly int: (min: number, max: number) => number
  /** Same as `Random.float`. */
  readonly float: () => number
  /** Same as `Random.string`. */
  readonly string: (length: number, alphabet?: string) => string
  /** Same as `Random.shuffle`. */
  readonly shuffle: <T>(array: readonly T[]) => T[]
  /** Same as `Random.pick`. */
  readonly pick: <T>(array: readonly T[]) => T
  /** Same as `Random.bytes`. Each group of four bytes is one 32-bit output, least significant byte first. */
  readonly bytes: (length: number) => Uint8Array<ArrayBuffer>
}

/**
 * Returns the package's functions backed by a deterministic generator, so the same `seed` gives the
 * same results in every runtime. Use it for tests and reproducible simulations. It is not for
 * secrets: anyone who sees a few outputs can predict the rest.
 *
 * The generator is xoshiro128** 1.1, seeded with two SplitMix64 outputs as its authors recommend.
 * Its first 32-bit outputs match Rust's `Xoshiro128StarStar::seed_from_u64(seed)` from
 * `rand_xoshiro`. `seed` is a safe integer, and a negative seed is read as its 64-bit two's
 * complement.
 *
 * @example
 * ```ts
 * import * as Random from '@portable/random'
 *
 * const random = Random.seeded(42)
 * const sizes = Array.from({ length: 10 }, () => random.int(1, 64))
 * ```
 */
export function seeded(seed: number): Seeded {
  if (!Number.isSafeInteger(seed))
    throw new RangeError(`Expected a safe integer seed, got ${seed}.`)
  const split = splitmix64(BigInt.asUintN(64, BigInt(seed)))
  const a = split()
  const b = split()
  const next = xoshiro128ss(
    Number(a & 0xffffffffn),
    Number(a >> 32n),
    Number(b & 0xffffffffn),
    Number(b >> 32n),
  )
  return {
    int: (min, max) => internal.int(next, min, max),
    float: () => internal.float(next),
    string: (length, alphabet = internal.urlAlphabet) => internal.string(next, length, alphabet),
    shuffle: (array) => internal.shuffle(next, array),
    pick: (array) => internal.pick(next, array),
    bytes(length) {
      internal.checkLength(length)
      const result = new Uint8Array(length)
      for (let i = 0; i < length; i += 4) {
        const word = next()
        result[i] = word
        result[i + 1] = word >>> 8
        result[i + 2] = word >>> 16
        result[i + 3] = word >>> 24
      }
      return result
    },
  }
}

export function xoshiro128ss(s0: number, s1: number, s2: number, s3: number): internal.Next {
  return () => {
    const x = Math.imul(s1, 5)
    const result = Math.imul((x << 7) | (x >>> 25), 9) >>> 0
    const t = s1 << 9
    s2 ^= s0
    s3 ^= s1
    s1 ^= s2
    s0 ^= s3
    s2 ^= t
    s3 = (s3 << 11) | (s3 >>> 21)
    return result
  }
}

export function splitmix64(seed: bigint): () => bigint {
  let state = seed
  return () => {
    state = BigInt.asUintN(64, state + 0x9e3779b97f4a7c15n)
    let z = BigInt.asUintN(64, (state ^ (state >> 30n)) * 0xbf58476d1ce4e5b9n)
    z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn)
    return z ^ (z >> 31n)
  }
}
