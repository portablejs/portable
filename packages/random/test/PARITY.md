# Test parity

Upstream suites: [random-int 3.1.0 `test.js`](https://github.com/sindresorhus/random-int/blob/main/test.js), [crypto-random-string 6.0.0 `test.js`](https://github.com/sindresorhus/crypto-random-string/blob/main/test.js), [nanoid 6.0.2 `test/`](https://github.com/ai/nanoid/tree/main/test), [seedrandom 3.0.5 `test/`](https://github.com/davidbau/seedrandom/tree/master/test), and the `lodash.random`, `lodash.sample` and `lodash.shuffle` modules of [lodash 4.17.21 `test/test.js`](https://github.com/lodash/lodash/blob/4.17.21/test/test.js). The reference vectors for xoshiro128** and SplitMix64 come from [rand_xoshiro 0.8.1](https://github.com/rust-random/rngs/tree/master/rand_xoshiro) (MIT or Apache-2.0), whose authors produced them with the C reference code.

Test names are `file > describe > test`. `random` is `random.conformance.ts`, `uniformity` is `uniformity.conformance.ts`, `seeded` is `seeded.conformance.ts`, and `oracle` is `random.oracle.test.ts`. The conformance files run in Node and in browsers, with the real `crypto.getRandomValues` in both, so the suites that nanoid and seedrandom run separately for browsers need no separate rows.

## random-int

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| main | `random > int > returns an integer within the range, both ends included`, `returns min when min equals max`, `varies between calls` | The one-argument form `randomInteger(max)` does not exist: both bounds are required. |
| handles swapped min/max arguments | `random > int > throws a RangeError when min is above max` | Deliberate difference: reversed bounds throw instead of being swapped. |

## crypto-random-string

`cryptoRandomString({ length, type })` becomes `Random.string(length, alphabet)` with the alphabet that `type` uses. `oracle > matches the upstream libraries where they agree on a contract > string with the <type> alphabet gives crypto-random-string's <type> characters` checks each alphabet against crypto-random-string's output.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| main | `random > string > uses only and every character of the hex alphabet` | crypto-random-string defaults to hex. We default to the 64 URL-safe characters. |
| hex | `random > string > uses only and every character of the hex alphabet` | |
| base64 | `random > string > uses only and every character of the base64 alphabet` | The pattern excludes `=`, which covers the padding check. |
| url-safe | `random > string > uses only and every character of the url-safe alphabet` | |
| numeric | `random > string > uses only and every character of the numeric alphabet` | |
| distinguishable | `random > string > uses only and every character of the distinguishable alphabet` | |
| ascii-printable | `random > string > uses only and every character of the ascii-printable alphabet`, `excludes the space from printable ASCII` | |
| alphanumeric | `random > string > uses only and every character of the alphanumeric alphabet` | |
| characters | `random > string > uses only and every character of the characters alphabet`, `repeats a one-character alphabet` | |
| characters outside the Basic Multilingual Plane | `random > string > picks whole characters outside the Basic Multilingual Plane` | |
| character set sizes at the selector range boundaries | `random > string > picks from alphabets bigger than 256 and 65536 characters` | Also covers sizes above 65,536, which crypto-random-string rejects. |
| discarding selector values keeps the distribution uniform | `random > string > keeps a large alphabet uniform when its size does not divide 2^32`, `uniformity > string characters from an alphabet of 1000` | |
| length beyond the `crypto.getRandomValues` limit | `random > string > has no runs left by unfilled entropy in long strings` | |
| successive calls return different strings | `random > string > returns a different string on each call` | |
| argument errors | `random > string > throws a RangeError for a length that is not a non-negative integer`, `throws a RangeError for an empty alphabet` | `type` and `characters` are one argument here, so "either" and "unknown type" errors can't happen. There is no 65,536-character limit to reject. |

## nanoid

`nanoid(size)` becomes `Random.string(size)` and `customAlphabet(alphabet, size)()` becomes `Random.string(size, alphabet)`.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| is ready for 0 size | `random > string > returns the requested length` | |
| generates URL-friendly IDs | `random > string > defaults to 64 URL-safe characters` | |
| changes ID length | `random > string > returns the requested length` | |
| generates large IDs | `random > string > returns the requested length` | |
| generates IDs bigger than pool size | `random > string > returns the requested length` | Uses 70,000 characters, as upstream does. |
| accepts string | `random > string > throws a RangeError for a length that is not a non-negative integer` | Deliberate difference: a string length throws. Coercing it is what let `"0"` loop forever in nanoid ([#381](https://github.com/ai/nanoid/issues/381)). |
| has no collisions | `random > string > returns a different string on each call` | |
| avoids pool pollution, infinite loop | `random > string > keeps working after rejecting a length` | `2.1` throws instead of being truncated. |
| throws on negative or too big ID length | `random > string > throws a RangeError for a length that is not a non-negative integer` | The too-big half is skipped: a length past the engine's string limit fails with the engine's own `RangeError`, after it runs out of memory or time, which differs by runtime. |
| has flat distribution | `uniformity > string characters from an alphabet of 64` | A chi-squared test instead of a max-min spread. |
| prevent collision with proxy number | `random > string > throws a RangeError for a length that is not a non-negative integer` | An object with `valueOf` is rejected, not converted. |
| recovers from crypto errors | `random > string > recovers when crypto.getRandomValues throws` | |
| customAlphabet > has options | `random > string > repeats a one-character alphabet` | |
| customAlphabet > has flat distribution | `uniformity > string characters from an alphabet of 26` | |
| customAlphabet > changes size | `random > string > repeats a one-character alphabet` | |
| customAlphabet > is ready for 0 size | `random > string > uses only and every character of the … alphabet`, `throws a RangeError for an empty alphabet` | An empty alphabet throws even for length 0, because it is a mistake whatever the length. |
| customAlphabet > does not hang when default size is 0 | skipped | There is no default size for an alphabet. |
| customAlphabet > avoids pool pollution, infinite loop | `random > string > keeps working after rejecting a length` | |
| customAlphabet > supports non-integer size | `random > string > throws a RangeError for a length that is not a non-negative integer` | Deliberate difference: `16.5` throws instead of being truncated. |
| customAlphabet > supports multi-byte characters | `random > string > picks multi-byte characters` | |
| customAlphabet > supports alphabets bigger than 256 symbols | `random > string > picks from alphabets bigger than 256 and 65536 characters` | |
| customAlphabet > supports non-string alphabets | skipped | `alphabet` is a string. |
| customAlphabet > does not fall in infinite loop | `random > string > returns the requested length` | |
| customRandom > (4 tests) | skipped | There is no custom byte source. `Random.seeded` covers the deterministic case, and `seeded > reference vectors` checks its output. |
| urlAlphabet > is string, has 64 symbols, has no duplicates | `random > string > defaults to 64 URL-safe characters`, `oracle > matches the upstream libraries where they agree on a contract > string's default alphabet holds the same 64 characters as nanoid's` | The alphabet is not exported. |
| random > throws on negative size | `random > bytes > throws a RangeError for a negative or fractional length` | |
| random > generates small random buffers | `random > bytes > returns the requested number of bytes` | |
| random > generates random buffers | `random > bytes > fills every byte past the 65,536-byte limit of crypto.getRandomValues`, `uniformity > bytes` | |
| non-secure (all tests) | `random > seeded > returns the same values for the same seed`, `returns 100,000 ids without a collision`, `applies the same argument checks as the crypto-backed functions`, `uniformity > seeded: chi-squared uniformity > string characters from an alphabet of 26` and `of 64` | nanoid's `non-secure` uses `Math.random`. `Random.seeded` is the non-cryptographic generator here. Negative sizes throw instead of returning `''`. |
| pool pollution > generates large IDs | `random > string > keeps working after rejecting a length` | |
| bin.test.js | skipped | nanoid's command-line tool. |
| benchmark.js | `random.bench.ts` | |

## seedrandom

`seedrandom(seed)()` becomes `Random.seeded(seed).float()`. The generator is xoshiro128**, not ARC4, so the sequences differ.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| nodetest > should pass basic tests | `random > seeded > returns the same values for the same seed`, `keeps each generator independent` | Autoseeding, `global`, `entropy` and `pass` are not supported. `Random` is the unseeded generator, and nothing replaces `Math.random`. |
| nodetest > should support state api | skipped | There is no state export. To replay a sequence, call `seeded` with the same seed again. |
| nodetest > should support requirejs in node | skipped | ESM only. |
| prngtest > should use xor128, xorwow, xorshift7, tychei, seedrandom, xor4096, alea correctly | `seeded > reference vectors`, `uniformity > seeded: chi-squared uniformity > float in 100 equal bins and in its lowest bit` | Upstream pins each algorithm's first outputs and the counts below 1/2, 1/4 and 1/8. We pin xoshiro128** and SplitMix64 to published reference vectors and test the distribution with chi-squared. |
| prngtest > runs benchmarks | `random.bench.ts > seeded float within 25% of seedrandom` | |
| cryptotest > should be able to seed without crypto | `random > seeded > returns the same values for the same seed` | Seeding never reads entropy. |
| cryptotest > should be able to seed ('hello.') with zero crypto | skipped | Tests seedrandom's autoseed fallback, which doesn't exist here. |
| autoseed.html, newapi.html, require.html, options.html, state.html, altprng.html, browserified.html | `random > seeded > returns the same values for the same seed`, `seeded > reference vectors` | Browser copies of the Node tests above, plus `new` and global-option checks that don't apply. |

## lodash

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| random > should return `0` or `1` when no arguments are given | skipped | Both bounds are required. |
| random > should support a `min` and `max` | `random > int > returns an integer within the range, both ends included` | |
| random > should support not providing a `max` | skipped | Both bounds are required. |
| random > should swap `min` and `max` when `min` > `max` | `random > int > throws a RangeError when min is above max` | Deliberate difference. |
| random > should support large integer values | `random > int > returns an integer within the range, both ends included`, `throws a RangeError for bounds that are not safe integers` | `2^62` is not a safe integer, so it throws. |
| random > should coerce arguments to finite numbers | `random > int > throws a RangeError for bounds that are not safe integers` | Deliberate difference: `NaN`, `'1'` and `Infinity` throw. |
| random > should support floats | `random > float > returns numbers with a fractional part` | `float()` is a separate function. Scale it for another range. |
| random > should support providing a `floating` | `random > float > returns numbers from 0 up to but not including 1` | |
| random > should work as an iteratee for methods like `_.map` | skipped | No iteratee signature. |
| sample > should return a random element | `random > pick > returns an element of the array` | |
| sample > should return `undefined` when sampling empty collections | `random > pick > throws a RangeError for an empty array` | Deliberate difference. |
| sample > should sample an object | skipped | Arrays only. Pass `Object.values(object)`. |
| shuffle > should return a new array | `random > shuffle > returns a new array and leaves the input unchanged` | |
| shuffle > should contain the same elements after a collection is shuffled | `random > shuffle > keeps the same elements` | Arrays only. |
| shuffle > should shuffle small collections | `random > shuffle > shuffles small arrays into every order`, `uniformity > shuffle orders of 4 elements` | |
| shuffle > should treat number values for `collection` as empty | skipped | Arrays only. |
| methods that return arrays > should return an array (shuffle) | `random > shuffle > returns a new array and leaves the input unchanged` | |

## Statistical tests

`uniformity.conformance.ts` runs a chi-squared test on every function, once with `Random.seeded(20261018)` at p = 0.001 and once with `crypto.getRandomValues` at p = 1e-9. The seeded run gives the same result every time. The crypto run fails about once in a billion runs if the code is correct. The ranges include ones that are not powers of two (1 to 6, 0 to 36, 3 · 2^30 and 3 · 2^51 integers, 2^32 + 1 integers), where a modulo without rejection is biased, and `the chi-squared check` shows that the same sample sizes reject a modulo-biased draw and an off-by-one shuffle.

## Known upstream issues

| Issue | Upstream | Here | Test |
| --- | --- | --- | --- |
| Fractional bounds give results outside the range: `randomInteger(1.5, 3.5)` can return 1 or 4. | random-int | `RangeError` | `oracle > known upstream issues > random-int returns values outside fractional bounds` |
| Reversed bounds are swapped silently ([random-int#7](https://github.com/sindresorhus/random-int/issues/7)). | random-int, lodash | `RangeError` | `oracle > known upstream issues > random-int and lodash.random swap reversed bounds; int throws` |
| `Math.random` is not a cryptographic generator ([random-int#6](https://github.com/sindresorhus/random-int/issues/6), [lodash#1638](https://github.com/lodash/lodash/issues/1638)). | random-int, lodash | `crypto.getRandomValues` | `uniformity > crypto: chi-squared uniformity` |
| `Math.random` has too little state to reach every order of a large array ([lodash#4743](https://github.com/lodash/lodash/issues/4743)). | lodash | `crypto.getRandomValues` for `Random.shuffle`. `Random.seeded` has 128 bits of state, so it reaches at most 2^128 orders, which the README states. | `uniformity > shuffle positions of 10 elements` |
| `_.random(2 ** 60, 2 ** 62)` returns integers that aren't safe. | lodash | `RangeError` | `oracle > known upstream issues > lodash.random(0, 2 ** 62) returns unsafe integers; int throws` |
| `_.sample([])` returns `undefined`, so the element type has to include it. | lodash | `RangeError` | `oracle > known upstream issues > lodash.sample returns undefined for an empty array; pick throws` |
| `customAlphabet` indexes code units, so an emoji alphabet gives lone surrogates. | nanoid | The alphabet is split into code points. | `oracle > known upstream issues > nanoid customAlphabet splits emoji into lone surrogates` |
| A size of `0`, or a size passed as a string, looped until the heap ran out ([nanoid#381](https://github.com/ai/nanoid/issues/381), [nanoid#541](https://github.com/ai/nanoid/issues/541)). | nanoid | `RangeError` for anything but a non-negative safe integer | `random > string > throws a RangeError for a length that is not a non-negative integer` |
| More than 65,536 characters throws. | crypto-random-string | Any alphabet size works. | `oracle > known upstream issues > crypto-random-string rejects more than 65,536 characters; string accepts them` |
| A duplicated `j` in the url-safe alphabet made it twice as likely ([crypto-random-string#9](https://github.com/sindresorhus/crypto-random-string/issues/9)). | crypto-random-string | A repeated character is picked more often, as documented. The alphabets in our tests are checked to have no duplicates. | `random > string > uses only and every character of the … alphabet` |
| Seeds that repeat a pattern, such as `'sf'` and `'sfsf'`, give the same sequence ([seedrandom#63](https://github.com/davidbau/seedrandom/issues/63)). | seedrandom | Seeds are integers, and SplitMix64 maps each 64-bit seed to a different state. | `oracle > known upstream issues > seedrandom gives the same sequence for seeds that repeat a pattern; seeded does not`, `random > seeded > gives distinct sequences for seeds that differ only in high bits` |
| The same seed gave different results in different browsers ([seedrandom#59](https://github.com/davidbau/seedrandom/issues/59), [seedrandom#73](https://github.com/davidbau/seedrandom/issues/73)). | seedrandom | Only 32-bit integer arithmetic and one `BigInt` seeding step. | `seeded > reference vectors` and `random > seeded > returns the same sequence in every runtime`, which run in Node and Chromium |
| `xorshift7` initialization has flaws ([seedrandom#84](https://github.com/davidbau/seedrandom/issues/84)). | seedrandom | xoshiro128** is seeded with SplitMix64, as its authors recommend. | `seeded > reference vectors` |
