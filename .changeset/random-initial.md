---
'@portable/random': minor
---

Initial release. `Random.int`, `float`, `string`, `shuffle`, `pick` and `bytes` draw unbiased values from `crypto.getRandomValues`, and `seeded(seed)` returns the same functions backed by xoshiro128** for reproducible tests. Replaces random-int, crypto-random-string, nanoid's `customAlphabet`, seedrandom, and lodash's `random`, `sample` and `shuffle`.
