# @portable/mime-headers

## 0.1.0

### Minor Changes

- [`1e2ecf0`](https://github.com/portablejs/portable/commit/1e2ecf092ce5de40507b2c85c65da7aa4bcbd309) - Initial release. `MimeHeaders.encodeWord`, `encodeWords`, and `decodeWords` convert text to RFC 2047 encoded-words and back; `fold` and `unfold` fold and unfold header lines; `parseHeaders` splits a header block into fields; `parseValue` and `formatValue` read and write values with RFC 2231 parameters; and `parseAddresses`, `parseMailboxes`, and `formatAddresses` read and write address lists. Replaces libmime's header functions, addressparser, and email-addresses.

### Patch Changes

- Updated dependencies [[`6b36d08`](https://github.com/portablejs/portable/commit/6b36d08e2331b7e55d90165a4bf6f43961291c8e), [`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a)]:
  - @portable/base64@0.1.0
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
