---
'@portable/bytes': minor
---

Initial release. `Bytes.toHex` and `fromHex` convert a `Uint8Array` to hex and back, with the native methods where the runtime has them, `concat` joins byte arrays, and `equal` and `timingSafeEqual` compare them. Replaces the matching uint8array-extras functions and `crypto.timingSafeEqual` from `node:crypto`.
