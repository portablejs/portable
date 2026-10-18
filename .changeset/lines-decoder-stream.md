---
'@portable/lines': minor
---

Renamed `LineStream` to `DecoderStream`, so callers write `Lines.DecoderStream`, as with `Jsonl.DecoderStream` and `Base64.DecoderStream`. `LineStream.Options` is now `DecoderStream.Options`.
