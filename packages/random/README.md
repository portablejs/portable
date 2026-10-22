# @portable/random

Unbiased random integers, floats, strings, shuffles and bytes from `crypto.getRandomValues`, plus a seeded generator with the same functions for tests. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [random-int](https://www.npmjs.com/package/random-int), [crypto-random-string](https://www.npmjs.com/package/crypto-random-string), [nanoid](https://www.npmjs.com/package/nanoid)'s `customAlphabet`, [seedrandom](https://www.npmjs.com/package/seedrandom), and [lodash](https://www.npmjs.com/package/lodash)'s `random`, `sample` and `shuffle`.

```sh
npm install @portable/random
```

```ts
import * as Random from '@portable/random'

Random.int(1, 6) // 1 to 6, both included
Random.float() // from 0 up to but not including 1
Random.string(21) // 'Uakgb_J5m9g-0JDMbcJqL'
Random.string(6, { alphabet: '0123456789' }) // '407519'
Random.shuffle(['A', 'K', 'Q', 'J']) // a new array
Random.pick(['red', 'green', 'blue'])
Random.bytes(32) // Uint8Array

const random = Random.seeded(42)
random.int(1, 6) // the same number on every run, in every runtime
```

## API

| Function | Returns |
| --- | --- |
| `int(min, max)` | An integer from `min` to `max`, both included. Both must be safe integers with `min <= max`, and the range can hold up to 2^53 integers, such as `0` to `Number.MAX_SAFE_INTEGER`. |
| `float()` | A number from 0 up to but not including 1, made from 53 random bits. |
| `string(length, { alphabet })` | `length` characters, each picked from `alphabet` with equal chance. The default alphabet is the 64 characters `A-Z`, `a-z`, `0-9`, `-` and `_`, so 21 characters hold 126 random bits, like a nanoid. `alphabet` is split into code points, so emoji work. A character listed twice is picked twice as often. |
| `shuffle(array)` | A shuffled copy of `array`. Every order is equally likely. |
| `pick(array)` | A random element of `array`. |
| `bytes(length)` | A new `Uint8Array` of random bytes, with no 65,536-byte limit. |
| `seeded(seed)` | A `Random.Seeded` object with all of the functions above, drawing from a deterministic generator. `seed` is a safe integer. |

Arguments outside these rules throw a `RangeError`: a fractional or unsafe bound, `min > max`, a negative or fractional length, an empty alphabet, an empty array for `pick`, or a fractional seed. Nothing is coerced or swapped.

### Unbiased results

`int`, `string`, `shuffle` and `pick` use rejection sampling. A random value at or above the largest multiple of the range size is discarded and drawn again, so every result comes from the same number of source values. Reducing the value with a modulo instead, as `Math.floor(Math.random() * n)` and `bytes[i] % n` do, makes some results more likely whenever `n` is not a power of two. The tests check every function with a chi-squared test over ranges that aren't powers of two.

`crypto.getRandomValues` is a system call, so the package draws 16 KiB at a time into a private pool and takes values from it. `string` also keeps up to 32,768 generated characters for the last alphabet it used, as nanoid does. Each value is handed out once. Pooled values stay in memory until they are used, as in nanoid.

### Seeded generator

`Random.seeded(seed)` is for tests and reproducible simulations. It is not for secrets: anyone who sees a few outputs can predict the rest.

The generator is xoshiro128** 1.1, seeded with two SplitMix64 outputs as its authors recommend. Its 32-bit outputs, which `seeded(seed).bytes(n)` returns least significant byte first, match Rust's `Xoshiro128StarStar::seed_from_u64(seed)` from `rand_xoshiro`, and a negative seed is read as its 64-bit two's complement. The generator uses 32-bit integer arithmetic only, so a seed gives the same values in every runtime. The values for a seed change only in a major version.

xoshiro128** has 128 bits of state, so `seeded(seed).shuffle` can reach at most 2^128 orders. That is fewer than the 35! orders of a 35-element array. `Random.shuffle` doesn't have that limit.

## Why use this over random-int, crypto-random-string, nanoid, seedrandom and lodash

These libraries each cover part of the job: random-int and lodash use `Math.random`, which is not a cryptographic generator, crypto-random-string and nanoid only make strings, and seedrandom only makes floats. This package has one set of functions with a cryptographic source, and the same functions with a seeded source for tests.

- `int` throws on fractional bounds. `randomInteger(1.5, 3.5)` can return 1 or 4.
- `int` throws when `min > max` or a bound is not a safe integer. random-int and lodash swap reversed bounds, and `_.random(2 ** 60, 2 ** 62)` returns integers that aren't safe.
- `pick([])` throws. `_.sample([])` returns `undefined`, so its return type has to include `undefined`.
- `string` picks whole code points. nanoid's `customAlphabet('😀🎉')` returns lone surrogates.
- `string` accepts an alphabet of any size. crypto-random-string rejects more than 65,536 characters.
- `string` throws for a length that is not a non-negative integer. nanoid truncates `2.1` to 2, and a size passed as a string once made it run out of memory ([nanoid#381](https://github.com/ai/nanoid/issues/381)).
- `seeded` takes integer seeds, and different seeds give different sequences. seedrandom gives `'sf'` and `'sfsf'` the same sequence.

Each benchmark makes 1,000 calls per sample.

<!-- bench:start -->
| | @portable/random | random-int | crypto-random-string | nanoid | seedrandom | lodash | `node:crypto` | `Math.random` or `crypto.getRandomValues` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 × `int(1, 100)` | 105,000 | 9,180 | – | – | – | 8,670 | 5,130 | – |
| 1,000 × `int` over 2^53 integers | 31,200 | 8,080 | – | – | – | – | – | – |
| 1,000 × `float()` | 54,400 | – | – | – | – | 2,480 | – | 70,000 |
| 1,000 × `string(21)` | 26,400 | – | 315 | 29,200 | – | – | – | – |
| 1,000 × `string(12)` from 36 characters | 29,200 | – | 344 | 26,900 | – | – | – | – |
| 1,000 × `shuffle` of 52 elements | 1,970 | – | – | – | – | 1,120 | – | – |
| 1,000 × `pick` | 85,000 | – | – | – | – | 8,740 | – | – |
| 1,000 × `bytes(32)` | 9,230 | – | – | 549 | – | – | – | 478 |
| 1,000 × `seeded(1).float()` | 57,700 | – | – | – | 20,100 | – | – | – |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/random | random-int | crypto-random-string | nanoid | seedrandom | lodash | `node:crypto` | `Math.random` or `crypto.getRandomValues` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Minified and gzipped | 1.6 kB | 0.3 kB | 1.3 kB | 0.3 kB | 2.9 kB | 26 kB | built in | built in |
| Runtime dependencies | 0 | 0 | 3 | 0 | 0 | 0 | – | – |
| Node built-ins used | none | none | none | none | `crypto` | `Buffer` | Node only | none |
| TypeScript types | included | included | included | included | `@types/seedrandom` | `@types/lodash` | – | – |
| Version compared | – | 3.1.0 | 6.0.0 | 6.0.2 | 3.0.5 | 4.18.1 | – | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

## Migrating

| Upstream | @portable/random |
| --- | --- |
| `randomInteger(min, max)` | `Random.int(min, max)` |
| `randomInteger(max)` | `Random.int(0, max)` |
| `_.random(min, max)` | `Random.int(min, max)` |
| `_.random(min, max, true)` | `min + Random.float() * (max - min)` |
| `cryptoRandomString({ length, characters })` | `Random.string(length, { alphabet: characters })` |
| `cryptoRandomString({ length, type: 'hex' })` | `Random.string(length, { alphabet: '0123456789abcdef' })` |
| `cryptoRandomString({ length, type: 'numeric' })` | `Random.string(length, { alphabet: '0123456789' })` |
| `cryptoRandomString({ length, type: 'alphanumeric' })` | `Random.string(length, { alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' })` |
| `cryptoRandomString({ length, type: 'url-safe' })` | `Random.string(length, { alphabet: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~' })` |
| `cryptoRandomString({ length, type: 'distinguishable' })` | `Random.string(length, { alphabet: 'CDEHKMPRTUWXY012458' })` |
| `nanoid()` | `Random.string(21)` |
| `customAlphabet(alphabet, size)()` | `Random.string(size, { alphabet })` |
| nanoid's `random(n)` | `Random.bytes(n)` |
| `_.shuffle(array)` | `Random.shuffle(array)` |
| `_.sample(array)` | `Random.pick(array)`, which throws for an empty array |
| `seedrandom(seed)()` | `Random.seeded(seed).float()`, with an integer seed |

Three behaviors differ on purpose:

- Reversed bounds, fractional bounds and lengths, and strings in place of numbers throw a `RangeError` instead of being swapped, truncated or coerced.
- `seeded` uses xoshiro128**, so its sequences differ from seedrandom's. A string seed has to become an integer first, for example a hash of it.
- `seeded` has no state export like seedrandom's `{ state: true }`. Call `seeded` with the same seed again to replay a sequence.
