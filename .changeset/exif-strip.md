---
'@portable/exif': minor
---

Added `strip` and `StripStream`, which remove the EXIF and XMP metadata from JPEG, PNG and WebP files without re-encoding them, and keep the `Orientation` tag and the ICC profile unless told not to. `InvalidInputError` now takes its whole message.
