---
'@portable/mime-stream': minor
---

Added `DecoderStream`, which splits a raw MIME message into header, body and multipart chunks, `EncoderStream`, which writes them back out byte for byte, and `splitHeaders`, which returns the root header block and a stream of the body, as a replacement for mailsplit.
