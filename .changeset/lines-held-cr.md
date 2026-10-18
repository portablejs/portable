---
'@portable/lines': patch
---

`maxLength` no longer counts a CR held back for a CRLF split across chunks, or the start of a string separator split across chunks, so whether a line overflows no longer depends on chunking. A held CR followed by an empty chunk is no longer split twice by a separator that matches a lone CR.
