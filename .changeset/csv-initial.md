---
'@portable/csv': minor
---

Added `@portable/csv`, which decodes and encodes RFC 4180 CSV with `decode`, `encode`, `DecoderStream` and `EncoderStream`. If you pass `header` as an array literal, each row is typed with its column names. It replaces csv-parse, csv-stringify, papaparse and fast-csv.
