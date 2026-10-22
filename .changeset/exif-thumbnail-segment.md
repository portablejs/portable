---
'@portable/exif': patch
---

`thumbnail.bytes` is `undefined` when IFD1 says the thumbnail extends past the TIFF block it was read from, such as a JPEG's APP1 segment. `parse` used to return bytes from the image data after the segment, and `parseStream` returned none, so the two disagreed.
