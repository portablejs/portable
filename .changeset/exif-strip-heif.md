---
'@portable/exif': minor
---

`strip` and `StripStream` remove the `Exif` and XMP items from HEIC and AVIF files, which they used to reject with `UnsupportedError`. `strip` keeps the file's length, so every other byte stays at its offset. It writes the smaller `meta` box followed by a `free` box, and it overwrites the removed items' data with zeros. `StripStream` holds a HEIC or AVIF file only up to the end of its `meta` box.
