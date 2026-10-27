# @portable/csv

## 0.1.0

### Minor Changes

- [`b55424e`](https://github.com/portablejs/portable/commit/b55424e075ab606371353336928aeaa51c68dd48) - Initial release. `Csv.decode`, `encode`, `DecoderStream`, and `EncoderStream` read and write RFC 4180 CSV and TSV, with a `maxLength` limit on rows. If you pass `header` as an array literal, each row is typed with its column names. Replaces csv-parse, csv-stringify, papaparse, and fast-csv.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`a09a240`](https://github.com/portablejs/portable/commit/a09a240fc290f73902b2ffd85b7ac0fc3460aa97)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/streams@0.1.0
