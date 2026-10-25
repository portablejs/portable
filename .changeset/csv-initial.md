---
'@portable/csv': minor
---

Initial release. `Csv.decode`, `encode`, `DecoderStream`, and `EncoderStream` read and write RFC 4180 CSV and TSV, with a `maxLength` limit on rows. If you pass `header` as an array literal, each row is typed with its column names. Replaces csv-parse, csv-stringify, papaparse, and fast-csv.
