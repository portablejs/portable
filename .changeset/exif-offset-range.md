---
'@portable/exif': patch
---

`parseDate` returns `undefined` for a time zone out of range, such as `+99:99`, and ignores such an `offset` option, instead of shifting the date by it.
