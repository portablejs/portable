# @portable/image-size

## 0.1.1

### Patch Changes

- [#61](https://github.com/portablejs/portable/pull/61) [`c437905`](https://github.com/portablejs/portable/commit/c4379052f1e97d8c64fce323a5529799824b5a4f) - `parseStream` parses its buffer again only after the buffer has doubled, so a stream of small chunks no longer takes quadratic time. It can read up to twice the bytes a format needs before it returns.

## 0.1.0

### Minor Changes

- [`380593c`](https://github.com/portablejs/portable/commit/380593ca4bf755fe1aed7ccc147b89d0c92aec10) - Initial release. `ImageSize.parse` and `parseStream` read an image's type and dimensions from its header, from bytes or from a `ReadableStream`. `parseStream` cancels the stream as soon as it knows the dimensions. Replaces image-size.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
