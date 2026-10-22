---
'@portable/base64': patch
'@portable/quoted-printable': patch
'@portable/dns-packet': patch
'@portable/exif': patch
'@portable/png': patch
---

Byte results are typed `Uint8Array<ArrayBuffer>`, so they type-check as a `BufferSource` for `crypto.subtle`, `Blob` and `fetch`.
