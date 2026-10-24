import * as internal from './internal.js'

/** The functions of `@portable/random`, drawing from a seeded generator instead of `crypto.getRandomValues`. */
export type Seeded = {
  /** Same as `Random.int`. */
  readonly int: (min: number, max: number) => number
  /** Same as `Random.float`. */
  readonly float: () => number
  /** Same as `Random.string`. */
  readonly string: (length: number, options?: { alphabet?: string | undefined }) => string
  /** Same as `Random.shuffle`. */
  readonly shuffle: <value>(array: readonly value[]) => value[]
  /** Same as `Random.pick`. */
  readonly pick: <value>(array: readonly value[]) => value
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
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError(`Expected a safe integer seed, got ${seed}.`)
  }
  const split = splitmix64(BigInt.asUintN(64, BigInt(seed)))
  const a = split()
  const b = split()
  const next = xoshiro128ss(
    Number(a & 0xffffffffn),
    Number(a >> 32n),
    Number(b & 0xffffffffn),
    Number(b >> 32n),
  )
  const fill = (bytes: Uint8Array<ArrayBuffer>) => {
    for (let i = 0; i < bytes.length; i += 4) {
      const word = next()
      bytes[i] = word
      bytes[i + 1] = word >>> 8
      bytes[i + 2] = word >>> 16
      bytes[i + 3] = word >>> 24
    }
  }
  return {
    int: (min, max) => internal.int(next, min, max),
    float: () => ((next() >>> 11) * 4294967296 + next()) / 9007199254740992,
    string(length, { alphabet = internal.urlAlphabet } = {}) {
      internal.assertLength(length)
      return internal.string(next, fill, length, internal.alphabet(alphabet))
    },
    shuffle: (array) => internal.shuffle(next, array),
    pick: (array) => internal.pick(next, array),
    bytes(length) {
      internal.assertLength(length)
      const result = new Uint8Array(length)
      fill(result)
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
