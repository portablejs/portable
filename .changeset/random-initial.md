---
'@portable/random': minor
---

Added `int`, `float`, `string`, `shuffle`, `pick` and `bytes`, which draw unbiased values from `crypto.getRandomValues`, and `seeded(seed)`, which returns the same functions backed by xoshiro128** for reproducible tests. Replaces random-int, crypto-random-string, nanoid's `customAlphabet`, seedrandom, and lodash's `shuffle` and `sample`.
