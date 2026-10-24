---
'@portable/exif': minor
---

Added `parse`, which reads EXIF metadata from JPEG, TIFF, PNG, WebP, HEIC and AVIF bytes, `parseStream`, which reads it from a stream and stops once it has the metadata, `parseDate`, and `strip` and `StripStream`, which remove metadata from JPEG, PNG and WebP files and by default keep the orientation and color profile. A replacement for exif-parser.
