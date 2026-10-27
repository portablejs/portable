# @portable/mime-stream

## 0.1.0

### Minor Changes

- [`9f6121d`](https://github.com/portablejs/portable/commit/9f6121de530f256616a0bdf47a967af49b52ab01) - Initial release. `MimeStream.DecoderStream` splits a raw MIME message into header, body, and multipart chunks, `EncoderStream` writes them back out byte for byte, and `splitHeaders` returns the root header block and a stream of the body. Replaces mailsplit.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`1e2ecf0`](https://github.com/portablejs/portable/commit/1e2ecf092ce5de40507b2c85c65da7aa4bcbd309), [`a09a240`](https://github.com/portablejs/portable/commit/a09a240fc290f73902b2ffd85b7ac0fc3460aa97)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/mime-headers@0.1.0
  - @portable/streams@0.1.0
