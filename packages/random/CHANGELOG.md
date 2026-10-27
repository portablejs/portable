# @portable/random

## 0.1.0

### Minor Changes

- [`b939049`](https://github.com/portablejs/portable/commit/b939049f4b583706cb09284b4812ad2aefb2fcce) - Initial release. `Random.int`, `float`, `string`, `shuffle`, `pick`, and `bytes` draw unbiased values from `crypto.getRandomValues`, and `seeded(seed)` returns the same functions backed by xoshiro128** for reproducible tests. Replaces random-int, crypto-random-string, nanoid's `customAlphabet`, seedrandom, and lodash's `random`, `sample`, and `shuffle`.
