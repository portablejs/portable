---
'@portable/binary': patch
'@portable/dns-packet': patch
'@portable/image-size': patch
'@portable/web-crypto': patch
---

`ImageSize.parse` converts an SVG `pc` length at 16 pixels, not about 0.11. `DnsPacket.encode` throws `InvalidInputError` for a number that doesn't fit its field, instead of writing it modulo the field's size. The web-crypto functions reject as soon as `signal` aborts, instead of after the `crypto.subtle` call finishes. `Binary.FrameDecoderStream` gives `InvalidInputError.offset` from the start of the stream.
