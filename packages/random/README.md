# @portable/random

Draws unbiased random integers, floats, strings, shuffles and bytes from `crypto.getRandomValues`, and has a seeded generator with the same functions for tests. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [random-int](https://www.npmjs.com/package/random-int), [crypto-random-string](https://www.npmjs.com/package/crypto-random-string), [nanoid](https://www.npmjs.com/package/nanoid)'s `customAlphabet`, [seedrandom](https://www.npmjs.com/package/seedrandom), and [lodash](https://www.npmjs.com/package/lodash)'s `random`, `sample` and `shuffle`.

```sh
npm install @portable/random
```

```ts
import * as Random from '@portable/random';

Random.int(1, 6); // 1 to 6, both included
Random.float(); // from 0 up to but not including 1
Random.string(21); // 'Uakgb_J5m9g-0JDMbcJqL'
Random.string(6, { alphabet: '0123456789' }); // '407519'
Random.shuffle(['A', 'K', 'Q', 'J']); // a new array
Random.pick(['red', 'green', 'blue']);
Random.bytes(32); // Uint8Array

const random = Random.seeded(42);
random.int(1, 6); // the same number on every run, in every runtime
```

## API

| Function | Returns |
| --- | --- |
| `int(min, max)` | An integer from `min` to `max`, both included. Both must be safe integers with `min <= max`, and the range can include up to 2^53 integers, such as `0` to `Number.MAX_SAFE_INTEGER`. |
| `float()` | A number from 0 up to but not including 1, made from 53 random bits. |
| `string(length, { alphabet })` | `length` characters, each picked from `alphabet` with equal chance. The default alphabet is the 64 characters `A-Z`, `a-z`, `0-9`, `-` and `_`, so 21 characters have 126 random bits, like a nanoid. `alphabet` is split into code points, so emoji work. A character listed twice is picked twice as often. |
| `shuffle(array)` | A shuffled copy of `array`. Every order is equally likely. |
| `pick(array)` | A random element of `array`. |
| `bytes(length)` | A new `Uint8Array` of random bytes, with no 65,536-byte limit. |
| `seeded(seed)` | A `Random.Seeded` object with all of the functions above, drawing from a deterministic generator. `seed` is a safe integer. |

Arguments outside these rules throw a `RangeError`: a fractional or unsafe bound, `min > max`, a negative or fractional length, an empty alphabet, an empty array for `pick`, or a fractional seed. Nothing is coerced or swapped.

### Unbiased results

`int`, `string`, `shuffle` and `pick` use rejection sampling. A random value at or above the largest multiple of the range size is discarded and drawn again, so every result comes from the same number of source values. Reducing the value with a modulo instead, as `Math.floor(Math.random() * n)` and `bytes[i] % n` do, makes some results more likely whenever `n` is not a power of two. The tests check every function with a chi-squared test over ranges that aren't powers of two.

`crypto.getRandomValues` is a system call, so the package draws 16 KiB at a time into a private pool and takes values from it. `string` also keeps up to 32,768 generated characters for the last alphabet it used, as nanoid does. Each value is handed out once. Pooled values stay in memory until they are used, as in nanoid.

### Seeded generator

`Random.seeded(seed)` is for tests and reproducible simulations. It is not for secrets: a few outputs are enough to predict the rest.

The generator is xoshiro128** 1.1, seeded with two SplitMix64 outputs as its authors recommend. Its 32-bit outputs, which `seeded(seed).bytes(n)` returns least significant byte first, match Rust's `Xoshiro128StarStar::seed_from_u64(seed)` from `rand_xoshiro`, and a negative seed is read as its 64-bit two's complement. The generator uses 32-bit integer arithmetic only, so a seed gives the same values in every runtime. The values for a seed change only in a major version.

xoshiro128** has 128 bits of state, so `seeded(seed).shuffle` can reach at most 2^128 orders. That is fewer than the 35! orders of a 35-element array. `Random.shuffle` doesn't have that limit.

## Types

| Type | Description |
| --- | --- |
| `Random.Seeded` | The functions of `@portable/random`, drawing from a seeded generator, as `Random.seeded` returns them. |

## Why use this over random-int, crypto-random-string, nanoid, seedrandom and lodash

Each of these libraries does part of the job: random-int and lodash use `Math.random`, which is not a cryptographic generator, crypto-random-string and nanoid only make strings, and seedrandom only makes floats. This package has one set of functions with a cryptographic source, and the same functions with a seeded source for tests.

- `int` throws on fractional bounds. `randomInteger(1.5, 3.5)` can return 1 or 4.
- `int` throws when `min > max` or a bound is not a safe integer. random-int and lodash swap reversed bounds, and `_.random(2 ** 60, 2 ** 62)` returns integers that aren't safe.
- `pick([])` throws. `_.sample([])` returns `undefined`, so its return type has to include `undefined`.
- `string` picks whole code points. nanoid's `customAlphabet('😀🎉')` returns lone surrogates.
- `string` accepts an alphabet of any size. crypto-random-string rejects more than 65,536 characters.
- `string` throws for a length that is not a non-negative integer. nanoid truncates `2.1` to 2, and a size passed as a string once made it run out of memory ([nanoid#381](https://github.com/ai/nanoid/issues/381)).
- `seeded` takes integer seeds, and different seeds give different sequences. seedrandom gives `'sf'` and `'sfsf'` the same sequence.
- random-int's `randomInteger(max)` returns an integer from 0 to `max`. `int` has no one-argument form, so write `int(0, max)`.
- `_.random(min, max, true)` returns a float in a range. `float` takes no bounds, so write `min + Random.float() * (max - min)`.
- crypto-random-string's `type` option has no equivalent. Pass its characters as `alphabet`: `'distinguishable'`, for example, is `'CDEHKMPRTUWXY012458'`.
- `seeded` uses xoshiro128**, so its sequences differ from seedrandom's. A string seed has to become an integer first, for example a hash of it.
- `seeded` has no state export like seedrandom's `{ state: true }`. Call `seeded` with the same seed again to replay a sequence.

Each benchmark makes 1,000 calls per sample.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">1,000 × <code>int(1, 100)</code></th></tr>
<tr><td>@portable/random</td><td align="right">105,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>random-int</td><td align="right">9,180</td><td>11× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="14" height="12" alt="" /></td></tr>
<tr><td>lodash</td><td align="right">8,670</td><td>12× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="13" height="12" alt="" /></td></tr>
<tr><td><code>node:crypto</code></td><td align="right">5,130</td><td>20× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="8" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">1,000 × <code>int</code> over 2^53 integers</th></tr>
<tr><td>@portable/random</td><td align="right">31,200</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>random-int</td><td align="right">8,080</td><td>3.9× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="41" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">1,000 × <code>float()</code></th></tr>
<tr><td><code>Math.random</code> or <code>crypto.getRandomValues</code></td><td align="right">70,000</td><td>1.3× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/random</td><td align="right">54,400</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="124" height="12" alt="" /></td></tr>
<tr><td>lodash</td><td align="right">2,480</td><td>22× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="6" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">1,000 × <code>string(21)</code></th></tr>
<tr><td>nanoid</td><td align="right">29,200</td><td>1.1× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/random</td><td align="right">26,400</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="145" height="12" alt="" /></td></tr>
<tr><td>crypto-random-string</td><td align="right">315</td><td>84× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="2" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">1,000 × <code>string(12)</code> from 36 characters</th></tr>
<tr><td>@portable/random</td><td align="right">29,200</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>nanoid</td><td align="right">26,900</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="147" height="12" alt="" /></td></tr>
<tr><td>crypto-random-string</td><td align="right">344</td><td>85× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="2" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">1,000 × <code>shuffle</code> of 52 elements</th></tr>
<tr><td>@portable/random</td><td align="right">1,970</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>lodash</td><td align="right">1,120</td><td>1.8× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="91" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">1,000 × <code>pick</code></th></tr>
<tr><td>@portable/random</td><td align="right">85,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>lodash</td><td align="right">8,740</td><td>9.7× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="16" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">1,000 × <code>bytes(32)</code></th></tr>
<tr><td>@portable/random</td><td align="right">9,230</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>nanoid</td><td align="right">549</td><td>17× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="10" height="12" alt="" /></td></tr>
<tr><td><code>Math.random</code> or <code>crypto.getRandomValues</code></td><td align="right">478</td><td>19× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="8" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">1,000 × <code>seeded(1).float()</code></th></tr>
<tr><td>@portable/random</td><td align="right">57,700</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>seedrandom</td><td align="right">20,100</td><td>2.9× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="56" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/random, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/random | – | 1.6 kB | 0 | none | included |
| random-int | 3.1.0 | 0.3 kB | 0 | none | included |
| crypto-random-string | 6.0.0 | 1.3 kB | 3 | none | included |
| nanoid | 6.0.2 | 0.3 kB | 0 | none | included |
| seedrandom | 3.0.5 | 2.9 kB | 0 | `crypto` | `@types/seedrandom` |
| lodash | 4.18.1 | 26 kB | 0 | `Buffer` | `@types/lodash` |
| `node:crypto` | – | built in | – | Node only | – |
| `Math.random` or `crypto.getRandomValues` | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
