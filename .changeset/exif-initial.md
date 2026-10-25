---
'@portable/exif': minor
---

Initial release. `Exif.parse` reads EXIF metadata from JPEG, TIFF, PNG, WebP, HEIC and AVIF bytes, `parseStream` reads it from a stream and stops once it has the metadata, and `parseDate` turns an EXIF date into a `Date`. `strip` and `StripStream` remove metadata from JPEG, PNG and WebP files, and by default keep the orientation and color profile. Replaces exif-parser.
