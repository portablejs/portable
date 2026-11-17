---
'@portable/exif': patch
---

`parse` decodes at most twice the size of the TIFF data in values longer than 4 bytes and skips the tags after that, so many entries that point at one large value no longer decode to far more than the input. It also skips a second tag with the same name in one IFD.
