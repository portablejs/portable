---
'@portable/mime-stream': minor
---

Initial release. `MimeStream.DecoderStream` splits a raw MIME message into header, body, and multipart chunks, `EncoderStream` writes them back out byte for byte, and `splitHeaders` returns the root header block and a stream of the body. Replaces mailsplit.
