# @portable/binary

## 0.1.0

### Minor Changes

- [#26](https://github.com/portablejs/portable/pull/26) [`32814ce`](https://github.com/portablejs/portable/commit/32814ce49a9e3af6b009e9d236de29ae00a02775) - Initial release. `Binary.createReader` and `Binary.createWriter` read and write integers and floats in either byte order, varints (LEB128, zigzag, and SLEB128), and UTF-8 strings with a length or a terminating zero byte, and `utf8Length` counts a string's UTF-8 bytes. `FrameDecoderStream` splits a byte stream into length-prefixed frames, with a `maxBytes` limit, and `FrameEncoderStream` writes them. Replaces smart-buffer, varint, it-length-prefixed, and length-prefixed-stream.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`a09a240`](https://github.com/portablejs/portable/commit/a09a240fc290f73902b2ffd85b7ac0fc3460aa97)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/streams@0.1.0
