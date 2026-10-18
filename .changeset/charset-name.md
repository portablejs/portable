---
'@portable/charset': minor
---

Removed `isSupported`: `normalizeLabel` now returns `undefined` for labels WHATWG maps to the replacement encoding, such as `iso-2022-kr`, so a label can be encoded exactly when `normalizeLabel` returns a name. Renamed the `CharsetName` type to `Name`, which no longer includes `'replacement'`.
