---
'@portable/base64': minor
---

Initial release. `Base64.encode` and `Base64.decode` convert bytes to base64 and base64url and back, with optional MIME line wrapping, and `EncoderStream` and `DecoderStream` do the same on streams. They use the native `Uint8Array.prototype.toBase64` and `Uint8Array.fromBase64` where the runtime has them. Replaces libbase64, base64-js, and js-base64.
