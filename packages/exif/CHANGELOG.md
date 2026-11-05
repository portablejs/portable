# @portable/exif

## 0.1.1

### Patch Changes

- [#61](https://github.com/portablejs/portable/pull/61) [`c437905`](https://github.com/portablejs/portable/commit/c4379052f1e97d8c64fce323a5529799824b5a4f) - `parse` decodes at most twice the size of the TIFF data in values longer than 4 bytes and skips the tags after that, so many entries that point at one large value no longer decode to far more than the input. It also skips a second tag with the same name in one IFD.

## 0.1.0

### Minor Changes

- [`e2752f5`](https://github.com/portablejs/portable/commit/e2752f5547fc55a42a579679b7fd559897881361) - Initial release. `Exif.parse` reads EXIF metadata from JPEG, TIFF, PNG, WebP, HEIC, and AVIF bytes, `parseStream` reads it from a stream and stops once it has the metadata, and `parseDate` turns an EXIF date into a `Date`. `strip` and `StripStream` remove metadata from JPEG, PNG, and WebP files, and by default keep the orientation and color profile. Replaces exif-parser.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`a09a240`](https://github.com/portablejs/portable/commit/a09a240fc290f73902b2ffd85b7ac0fc3460aa97)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/streams@0.1.0
