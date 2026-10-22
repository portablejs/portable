---
'@portable/csv': patch
---

A row longer than `maxLength` with text after a closing quote throws `MaxLengthError` however the input is chunked. Before, `decode` threw `InvalidInputError` for it and `DecoderStream` could throw either.
